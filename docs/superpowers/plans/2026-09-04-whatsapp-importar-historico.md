# WhatsApp — Importar histórico de conversas (Plano 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depois de conectar o WhatsApp, a clínica consegue importar as conversas diretas dos últimos 60 dias (até 50 conversas, 30 mensagens cada) pra dentro do ArkDoctor — criando lead quando o telefone não tem cadastro — via um aviso pós-conexão e um botão fixo "Importar histórico", com resumo do resultado e retomada segura se for interrompida.

**Architecture:** Dois métodos novos no `UazapiProvider` (`findChats`, `findMessages`) usam `/chat/find` e `/message/find`, já validados ao vivo. Uma função pura `mapUazapiMessage` (novo módulo `message-mapping.ts`) extrai texto/mídia/timestamp de um objeto de mensagem da Uazapi — reaproveitada tanto pelo `parseWebhookPayload` (refatorado, sem mudar comportamento) quanto pela nova `service.importWhatsappHistory`. A ingestão de mídia (download → upload → `updateMessageMedia`) também é extraída pra uma função compartilhada `ingestMediaBytes`, reaproveitada por `handleInboundMessage` e pela importação. `importWhatsappHistory` processa até `HISTORY_BATCH_SIZE` conversas não marcadas por clique (idempotência via `whatsapp_conversations.history_imported_at`), grava mensagens com o `sent_at` real (repositório ganha suporte a `sentAt` explícito no insert), baixa mídia só das mensagens com menos de 30 dias, e nunca mexe em conversas/mensagens já importadas.

**Tech Stack:** Next.js 16 (App Router, Server Actions, route handlers), React 19, TypeScript, Vitest, Supabase (Postgres, `@supabase/supabase-js`), módulo `src/modules/whatsapp/` (service + portas + repositório em memória para testes). Deploy Cloudflare Workers via OpenNext.

**Spec:** `docs/superpowers/specs/2026-09-03-whatsapp-midia-historico-design.md` (seção "Item 1 — Importar histórico de conversas"). Payloads reais capturados: `docs/ops/whatsapp-payloads-capturados-2026-09-03.md` §2 (`/chat/find`) e §3 (`/message/find`) — validação ao vivo já feita nessa sessão anterior, fixtures desta plano vêm de lá.

## Global Constraints

- Todas as respostas e textos de UI em **português do Brasil**.
- Mudanças cirúrgicas: só tocar no que a importação de histórico exige. `logMessage`, `sendMediaMessage`, `sendBulkMessages` não mudam de comportamento.
- **Sem grupos, em lugar nenhum.** `findChats` descarta `wa_isGroup === true` (filtro no request e defensivamente na resposta).
- Comando de teste: `npm test` (roda `vitest run`). Typecheck: `npx tsc --noEmit`. Lint: `npm run lint`.
- Constantes no código, não settings: `HISTORY_MAX_CONVERSATIONS = 50`, `HISTORY_MAX_MESSAGES_PER_CONVERSATION = 30`, `HISTORY_WINDOW_DAYS = 60`, `HISTORY_BATCH_SIZE = 15` (lote por clique — evita estourar limite de subrequests/CPU do Worker num único clique; ver spec "Idempotência e limite do Worker").
- Janela de mídia da importação: **30 dias** (mesma janela do cron de retenção — mensagem de mídia mais antiga que isso entra com `media_status='expired'`, sem tentar baixar).
- Teto por arquivo de mídia: **16 MB** (`MAX_MEDIA_BYTES`, já existe em `media.ts`).
- Idempotência: `whatsapp_conversations.history_imported_at` é gravado **depois** de processar cada conversa (sucesso). Erro numa conversa não marca e não trava as demais.
- Fora de escopo (não implementar): fila/retry automático, deduplicação entre mensagens já recebidas ao vivo (webhook) e mensagens reimportadas pelo histórico da mesma janela de tempo — risco pequeno, aceito pela spec.

---

## File Structure

- `src/modules/whatsapp/message-mapping.ts` — **novo**. `mapUazapiMessage(raw)`, puro, sem I/O. Extrai `{fromMe, body, timestampMs, senderJid, senderName, media}` de um objeto de mensagem da Uazapi (mesmo shape em `/message/find` e no `message` do webhook).
- `src/modules/whatsapp/message-mapping.test.ts` — **novo**.
- `src/modules/whatsapp/service.ts` — `parseWebhookPayload` passa a usar `mapUazapiMessage`; `ingestMediaBytes` extraída e reaproveitada por `handleInboundMessage`; nova `importWhatsappHistory` + constantes `HISTORY_*`.
- `src/modules/whatsapp/service.test.ts` — testes da importação; testes existentes de `parseWebhookPayload`/`handleInboundMessage` continuam passando sem alteração.
- `src/modules/whatsapp/repository.ts` — `insertMessage` aceita `sentAt?: string`; nova `markHistoryImported(accountId, conversationId, importedAtIso)`.
- `src/modules/whatsapp/repository.supabase.ts` + `repository.memory.ts` — implementam o acima.
- `src/modules/whatsapp/repository.memory.test.ts` — testes das duas mudanças.
- `src/modules/whatsapp/provider.uazapi.ts` — `findChats(accountId, limit)` e `findMessages(accountId, chatId, limit)` no `UazapiProvider`, exporta `UazapiChat`.
- `src/modules/whatsapp/provider.uazapi.test.ts` — testes dos dois métodos novos.
- `src/app/(app)/whatsapp/actions.ts` — `importWhatsappHistoryAction()`.
- `src/components/whatsapp/whatsapp-client.tsx` — aviso pós-conexão + botão fixo "Importar histórico" + resumo do resultado.

---

### Task 1: Repositório — `sentAt` explícito no insert + `markHistoryImported`

**Files:**
- Modify: `src/modules/whatsapp/repository.ts`
- Modify: `src/modules/whatsapp/repository.supabase.ts`
- Modify: `src/modules/whatsapp/repository.memory.ts`
- Test: `src/modules/whatsapp/repository.memory.test.ts`

**Interfaces:**
- Produces: `WhatsappRepository.insertMessage(accountId, conversationId, input)` — `input.sentAt?: string` (ISO), opcional; quando ausente mantém o comportamento atual (agora). `WhatsappRepository.markHistoryImported(accountId: string, conversationId: string, importedAtIso: string): Promise<void>`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar em `src/modules/whatsapp/repository.memory.test.ts` (mesmo padrão dos testes existentes desse arquivo — ver `insertMessage`/`updateMessageMedia` já testados lá):

```ts
it("insertMessage uses the provided sentAt instead of now", async () => {
  const repo = createInMemoryWhatsappRepository();
  const conversation = await repo.insertConversation("acc-1", {
    contactId: null,
    contactName: "Carla",
    contactPhone: "5511999999999",
  });
  const message = await repo.insertMessage("acc-1", conversation.id, {
    direction: "inbound",
    body: "mensagem antiga",
    sentAt: "2026-01-01T10:00:00.000Z",
  });
  expect(message.sentAt).toBe("2026-01-01T10:00:00.000Z");
});

it("markHistoryImported sets historyImportedAt on the conversation", async () => {
  const repo = createInMemoryWhatsappRepository();
  const conversation = await repo.insertConversation("acc-1", {
    contactId: null,
    contactName: "Carla",
    contactPhone: "5511999999999",
  });
  expect(conversation.historyImportedAt).toBeNull();

  await repo.markHistoryImported("acc-1", conversation.id, "2026-09-04T12:00:00.000Z");

  const updated = await repo.getConversation("acc-1", conversation.id);
  expect(updated?.historyImportedAt).toBe("2026-09-04T12:00:00.000Z");
});

it("markHistoryImported does nothing for a conversation from another account", async () => {
  const repo = createInMemoryWhatsappRepository();
  const conversation = await repo.insertConversation("acc-1", {
    contactId: null,
    contactName: "Carla",
    contactPhone: "5511999999999",
  });
  await repo.markHistoryImported("acc-2", conversation.id, "2026-09-04T12:00:00.000Z");
  const updated = await repo.getConversation("acc-1", conversation.id);
  expect(updated?.historyImportedAt).toBeNull();
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- repository.memory`
Expected: FAIL — `markHistoryImported` não existe / `sentAt` é ignorado.

- [ ] **Step 3: Atualizar a interface**

Em `src/modules/whatsapp/repository.ts`, no método `insertMessage`, adicionar `sentAt?: string;` ao objeto `input` (logo depois de `body: string;`). Adicionar ao final da interface `WhatsappRepository`:

```ts
  markHistoryImported(
    accountId: string,
    conversationId: string,
    importedAtIso: string,
  ): Promise<void>;
```

- [ ] **Step 4: Implementar no repositório em memória**

Em `src/modules/whatsapp/repository.memory.ts`, dentro de `insertMessage`, trocar:

```ts
        sentAt: new Date().toISOString(),
```

por:

```ts
        sentAt: input.sentAt ?? new Date().toISOString(),
```

Adicionar novo método (perto de `linkConversationContact`):

```ts
    async markHistoryImported(accountId, conversationId, importedAtIso) {
      const c = conversations.get(conversationId);
      if (!c || c.accountId !== accountId) return;
      conversations.set(conversationId, { ...c, historyImportedAt: importedAtIso });
    },
```

- [ ] **Step 5: Implementar no repositório Supabase**

Em `src/modules/whatsapp/repository.supabase.ts`, dentro de `insertMessage`, no objeto passado a `.insert`, adicionar (o Supabase ignora chaves ausentes, então só inclui `sent_at` quando fornecido):

```ts
          ...(input.sentAt ? { sent_at: input.sentAt } : {}),
```

logo após `body: input.body,`. Adicionar novo método (perto de `linkConversationContact`):

```ts
    async markHistoryImported(accountId, conversationId, importedAtIso) {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ history_imported_at: importedAtIso })
        .eq("account_id", accountId)
        .eq("id", conversationId);
      if (error) throwDbError(error);
    },
```

- [ ] **Step 6: Rodar os testes**

Run: `npm test -- repository.memory`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (repositório Supabase agora implementa `markHistoryImported`; o `repository.fake`/mocks de outros testes que montam `WhatsappRepository` manualmente, se houver, precisam do método — checar `grep -rn "WhatsappRepository = {" src` e ajustar se necessário).

- [ ] **Step 8: Commit**

```bash
git add src/modules/whatsapp/repository.ts src/modules/whatsapp/repository.supabase.ts src/modules/whatsapp/repository.memory.ts src/modules/whatsapp/repository.memory.test.ts
git commit -m "feat(whatsapp): sentAt explícito no insert + markHistoryImported no repositório"
```

---

### Task 2: `message-mapping.ts` — extração pura de mensagem Uazapi

**Files:**
- Create: `src/modules/whatsapp/message-mapping.ts`
- Test: `src/modules/whatsapp/message-mapping.test.ts`

**Interfaces:**
- Consumes: `mediaTypeFromUazapi(messageType: string): MediaType | null` de `./media` (já existe).
- Produces: `mapUazapiMessage(raw: unknown): MappedUazapiMessage | null`, onde

```ts
export interface MappedUazapiMessage {
  fromMe: boolean;
  body: string;
  timestampMs: number | null;
  senderJid: string | null;
  senderName: string | null;
  media: {
    providerMessageId: string;
    type: MediaType;
    mime: string;
    filename: string | null;
    fileLength: number;
  } | null;
}
```

Usado pela Task 3 (`parseWebhookPayload`) e pela Task 5 (`importWhatsappHistory`).

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/modules/whatsapp/message-mapping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapUazapiMessage } from "./message-mapping";

describe("mapUazapiMessage", () => {
  it("parses a plain text message", () => {
    const result = mapUazapiMessage({
      fromMe: false,
      messageType: "Conversation",
      messageTimestamp: 1788445013000,
      sender_pn: "556696604575@s.whatsapp.net",
      senderName: "Ederson Fernandes",
      text: "oi",
    });
    expect(result).toEqual({
      fromMe: false,
      body: "oi",
      timestampMs: 1788445013000,
      senderJid: "556696604575@s.whatsapp.net",
      senderName: "Ederson Fernandes",
      media: null,
    });
  });

  it("parses an image message with caption", () => {
    const result = mapUazapiMessage({
      fromMe: false,
      messageType: "ImageMessage",
      messageTimestamp: 1788445100000,
      messageid: "3AFC432F36B07600E616",
      sender_pn: "556696604575@s.whatsapp.net",
      senderName: "Ederson Fernandes",
      text: "Ola amigo",
      content: { mimetype: "image/jpeg", caption: "Ola amigo", fileLength: 125831 },
    });
    expect(result).toEqual({
      fromMe: false,
      body: "Ola amigo",
      timestampMs: 1788445100000,
      senderJid: "556696604575@s.whatsapp.net",
      senderName: "Ederson Fernandes",
      media: {
        providerMessageId: "3AFC432F36B07600E616",
        type: "image",
        mime: "image/jpeg",
        filename: null,
        fileLength: 125831,
      },
    });
  });

  it("parses a document message with fileName and fromMe true", () => {
    const result = mapUazapiMessage({
      fromMe: true,
      messageType: "DocumentMessage",
      messageTimestamp: 1788445200000,
      messageid: "3AAED69C92FBA6BAE2C1",
      text: "",
      content: {
        mimetype: "application/pdf",
        fileName: "processo.pdf",
        fileLength: 2413752,
      },
    });
    expect(result?.fromMe).toBe(true);
    expect(result?.media).toEqual({
      providerMessageId: "3AAED69C92FBA6BAE2C1",
      type: "document",
      mime: "application/pdf",
      filename: "processo.pdf",
      fileLength: 2413752,
    });
  });

  it("returns null for a non-media message without a text field", () => {
    expect(mapUazapiMessage({ fromMe: false, messageType: "Conversation" })).toBeNull();
  });

  it("returns senderJid and timestampMs null when absent (webhook fixtures não têm messageTimestamp)", () => {
    const result = mapUazapiMessage({ fromMe: false, text: "oi sem sender" });
    expect(result).toEqual({
      fromMe: false,
      body: "oi sem sender",
      timestampMs: null,
      senderJid: null,
      senderName: null,
      media: null,
    });
  });

  it("returns null for non-object input", () => {
    expect(mapUazapiMessage(null)).toBeNull();
    expect(mapUazapiMessage("oi")).toBeNull();
    expect(mapUazapiMessage(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- message-mapping`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Criar `src/modules/whatsapp/message-mapping.ts`:

```ts
import type { MediaType } from "./types";
import { mediaTypeFromUazapi } from "./media";

export interface MappedUazapiMessage {
  fromMe: boolean;
  body: string;
  timestampMs: number | null;
  senderJid: string | null;
  senderName: string | null;
  media: {
    providerMessageId: string;
    type: MediaType;
    mime: string;
    filename: string | null;
    fileLength: number;
  } | null;
}

/**
 * Extrai os campos comuns de um objeto de mensagem da Uazapi. O mesmo shape
 * aparece tanto no `message` do webhook (`{EventType:"messages", message}`)
 * quanto em cada item de `/message/find` — validado ao vivo em
 * docs/ops/whatsapp-payloads-capturados-2026-09-03.md.
 *
 * Não decide direção de conversa nem valida `isGroup` — isso fica a cargo de
 * cada chamador (o webhook já filtra `isGroup`/`fromMe` antes de chamar; a
 * importação de histórico filtra grupo no nível do chat, não da mensagem).
 */
export function mapUazapiMessage(raw: unknown): MappedUazapiMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;

  const fromMe = data.fromMe === true;
  const senderJid =
    typeof data.sender_pn === "string"
      ? data.sender_pn
      : typeof data.sender === "string"
        ? data.sender
        : null;
  const senderName = typeof data.senderName === "string" ? data.senderName : null;
  const timestampMs = typeof data.messageTimestamp === "number" ? data.messageTimestamp : null;

  const content =
    typeof data.content === "object" && data.content !== null
      ? (data.content as Record<string, unknown>)
      : {};
  const mediaType =
    typeof data.messageType === "string" ? mediaTypeFromUazapi(data.messageType) : null;

  if (mediaType) {
    const mime =
      typeof content.mimetype === "string" ? content.mimetype : "application/octet-stream";
    const caption =
      typeof content.caption === "string"
        ? content.caption
        : typeof data.text === "string"
          ? data.text
          : "";
    const filename =
      mediaType === "document" && typeof content.fileName === "string" ? content.fileName : null;
    const providerMessageId = typeof data.messageid === "string" ? data.messageid : "";
    const fileLength = typeof content.fileLength === "number" ? content.fileLength : 0;
    return {
      fromMe,
      body: caption,
      timestampMs,
      senderJid,
      senderName,
      media: { providerMessageId, type: mediaType, mime, filename, fileLength },
    };
  }

  if (typeof data.text !== "string") return null;
  return { fromMe, body: data.text, timestampMs, senderJid, senderName, media: null };
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- message-mapping`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/whatsapp/message-mapping.ts src/modules/whatsapp/message-mapping.test.ts
git commit -m "feat(whatsapp): mapUazapiMessage — extração pura reutilizável de mensagem"
```

---

### Task 3: Refatorar `parseWebhookPayload` para usar `mapUazapiMessage`

**Files:**
- Modify: `src/modules/whatsapp/service.ts`

**Interfaces:**
- Consumes: `mapUazapiMessage` da Task 2.
- Produces: nenhuma mudança de assinatura — `parseWebhookPayload` continua com o mesmo tipo de retorno. **Refatoração pura**, comportamento idêntico.

- [ ] **Step 1: Confirmar que os testes existentes cobrem o comportamento atual**

Run: `npm test -- service.test.ts -t parseWebhookPayload`
Expected: PASS (baseline antes da refatoração).

- [ ] **Step 2: Refatorar**

Em `src/modules/whatsapp/service.ts`, adicionar o import:

```ts
import { mapUazapiMessage } from "./message-mapping";
```

Dentro de `parseWebhookPayload`, substituir todo o bloco `if (payload.EventType === "messages") { ... }` (que hoje reimplementa a extração campo a campo) por:

```ts
  if (payload.EventType === "messages") {
    const message = payload.message;
    if (typeof message !== "object" || message === null) return null;
    const messageData = message as Record<string, unknown>;
    if (messageData.fromMe === true || messageData.isGroup === true) return null;

    const mapped = mapUazapiMessage(messageData);
    if (!mapped || !mapped.senderJid) return null;

    const fromPhone = normalizeWhatsappJid(mapped.senderJid);
    const fromName = mapped.senderName ?? undefined;

    if (mapped.media) {
      return { fromPhone, fromName, body: mapped.body, media: mapped.media };
    }
    return { fromPhone, fromName, body: mapped.body };
  }
```

Importante: manter os dois `return` separados (com e sem a chave `media`) — o teste
`expect("media" in (parsed ?? {})).toBe(false)` em `service.test.ts` verifica que a
chave nem existe quando não há mídia, não apenas que é `undefined`.

O bloco `if (payload.event === "messages.upsert") { ... }` (Evolution) e o fallback
final `if (typeof payload.fromPhone === "string" ...)` **não mudam**.

- [ ] **Step 3: Rodar todos os testes de `parseWebhookPayload`**

Run: `npm test -- service.test.ts -t parseWebhookPayload`
Expected: PASS — todos os testes existentes (texto, mídia, grupo, fromMe, sender_pn ausente, Evolution, shape manual) continuam passando sem alteração.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/whatsapp/service.ts
git commit -m "refactor(whatsapp): parseWebhookPayload usa mapUazapiMessage"
```

---

### Task 4: Provider Uazapi — `findChats` e `findMessages`

**Files:**
- Modify: `src/modules/whatsapp/provider.uazapi.ts`
- Modify: `src/modules/whatsapp/provider.uazapi.test.ts`

**Interfaces:**
- Produces:

```ts
export interface UazapiChat {
  chatId: string;
  phone: string;
  name: string;
  isGroup: boolean;
  lastMessageTimestampMs: number;
}
```

adicionado a `UazapiProvider`:

```ts
  findChats(accountId: string, limit: number): Promise<UazapiChat[]>;
  findMessages(accountId: string, chatId: string, limit: number): Promise<unknown[]>;
```

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/modules/whatsapp/provider.uazapi.test.ts` (dentro do `describe("UazapiProvider", ...)` existente, reaproveitando `fetchMock`/`seedConfig` já definidos no arquivo):

```ts
  describe("findChats", () => {
    it("posts to /chat/find, filters groups and normalizes the chat list", async () => {
      const repo = createInMemoryWhatsappRepository();
      await seedConfig(repo);
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          chats: [
            {
              id: "ra9c738f87b6727",
              wa_chatid: "556696604575@s.whatsapp.net",
              phone: "+55 66 9660-4575",
              wa_isGroup: false,
              wa_lastMsgTimestamp: 1788445013000,
              wa_contactName: "Ederson Fernandes",
            },
            {
              wa_chatid: "12036305512345@g.us",
              wa_isGroup: true,
              wa_lastMsgTimestamp: 1788445000000,
            },
          ],
          pagination: { limit: 50, offset: 0, totalRecords: 2 },
        }),
      });

      const provider = createUazapiProvider(repo);
      const chats = await provider.findChats("acc-1", 50);

      expect(fetchMock).toHaveBeenCalledWith(
        "https://minhaclinica.uazapi.com/chat/find",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ token: "abc123" }),
          body: JSON.stringify({
            sort: "-wa_lastMsgTimestamp",
            limit: 50,
            offset: 0,
            wa_isGroup: false,
          }),
        }),
      );
      expect(chats).toEqual([
        {
          chatId: "556696604575@s.whatsapp.net",
          phone: "556696604575",
          name: "Ederson Fernandes",
          isGroup: false,
          lastMessageTimestampMs: 1788445013000,
        },
      ]);
    });

    it("falls back to the phone digits as name when no contact name is present", async () => {
      const repo = createInMemoryWhatsappRepository();
      await seedConfig(repo);
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          chats: [
            {
              wa_chatid: "556696604575@s.whatsapp.net",
              wa_isGroup: false,
              wa_lastMsgTimestamp: 1788445013000,
            },
          ],
        }),
      });

      const provider = createUazapiProvider(repo);
      const chats = await provider.findChats("acc-1", 50);
      expect(chats[0].name).toBe("556696604575");
    });

    it("throws when the request fails", async () => {
      const repo = createInMemoryWhatsappRepository();
      await seedConfig(repo);
      fetchMock.mockResolvedValue({ ok: false, status: 500 });

      const provider = createUazapiProvider(repo);
      await expect(provider.findChats("acc-1", 50)).rejects.toThrow();
    });
  });

  describe("findMessages", () => {
    it("posts to /message/find and returns the raw messages array", async () => {
      const repo = createInMemoryWhatsappRepository();
      await seedConfig(repo);
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          messages: [{ fromMe: false, text: "oi", messageTimestamp: 1788445013000 }],
          hasMore: false,
        }),
      });

      const provider = createUazapiProvider(repo);
      const messages = await provider.findMessages("acc-1", "556696604575@s.whatsapp.net", 30);

      expect(fetchMock).toHaveBeenCalledWith(
        "https://minhaclinica.uazapi.com/message/find",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ chatid: "556696604575@s.whatsapp.net", limit: 30 }),
        }),
      );
      expect(messages).toEqual([{ fromMe: false, text: "oi", messageTimestamp: 1788445013000 }]);
    });

    it("returns an empty array when the response has no messages field", async () => {
      const repo = createInMemoryWhatsappRepository();
      await seedConfig(repo);
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      const provider = createUazapiProvider(repo);
      const messages = await provider.findMessages("acc-1", "556696604575@s.whatsapp.net", 30);
      expect(messages).toEqual([]);
    });
  });
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- provider.uazapi`
Expected: FAIL — `findChats`/`findMessages` não existem no provider.

- [ ] **Step 3: Implementar**

Em `src/modules/whatsapp/provider.uazapi.ts`, adicionar ao topo (depois dos imports existentes):

```ts
export interface UazapiChat {
  chatId: string;
  phone: string;
  name: string;
  isGroup: boolean;
  lastMessageTimestampMs: number;
}
```

Adicionar à interface `UazapiProvider`:

```ts
  findChats(accountId: string, limit: number): Promise<UazapiChat[]>;
  findMessages(accountId: string, chatId: string, limit: number): Promise<unknown[]>;
```

Adicionar os dois métodos ao objeto retornado por `createUazapiProvider` (depois de `sendMedia`):

```ts
    async findChats(accountId, limit) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      const response = await fetch(`${baseUrl(config.subdomain)}/chat/find`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({ sort: "-wa_lastMsgTimestamp", limit, offset: 0, wa_isGroup: false }),
      });
      if (!response.ok) {
        throw new Error(`Falha ao listar conversas na Uazapi (${response.status})`);
      }
      const data = await response.json();
      const chats = Array.isArray(data?.chats) ? (data.chats as Record<string, unknown>[]) : [];

      return chats
        .filter((c) => c.wa_isGroup !== true && typeof c.wa_chatid === "string")
        .map((c) => {
          const chatId = c.wa_chatid as string;
          const name =
            (typeof c.wa_contactName === "string" && c.wa_contactName) ||
            (typeof c.wa_name === "string" && c.wa_name) ||
            (typeof c.name === "string" && c.name) ||
            normalizeWhatsappJid(chatId);
          return {
            chatId,
            phone: normalizeWhatsappJid(chatId),
            name,
            isGroup: false,
            lastMessageTimestampMs:
              typeof c.wa_lastMsgTimestamp === "number" ? c.wa_lastMsgTimestamp : 0,
          };
        });
    },

    async findMessages(accountId, chatId, limit) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      const response = await fetch(`${baseUrl(config.subdomain)}/message/find`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({ chatid: chatId, limit }),
      });
      if (!response.ok) {
        throw new Error(`Falha ao listar mensagens na Uazapi (${response.status})`);
      }
      const data = await response.json();
      return Array.isArray(data?.messages) ? data.messages : [];
    },
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- provider.uazapi`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 6: Commit**

```bash
git add src/modules/whatsapp/provider.uazapi.ts src/modules/whatsapp/provider.uazapi.test.ts
git commit -m "feat(whatsapp): UazapiProvider.findChats + findMessages"
```

---

### Task 5: `service.importWhatsappHistory` + `ingestMediaBytes` compartilhada

**Files:**
- Modify: `src/modules/whatsapp/service.ts`
- Modify: `src/modules/whatsapp/service.test.ts`

**Interfaces:**
- Consumes: `mapUazapiMessage` (Task 2), `UazapiChat` (Task 4), `WhatsappRepository.markHistoryImported`/`insertMessage({sentAt})` (Task 1), `MAX_MEDIA_BYTES`/`storagePathFor`/`safeContentType` de `./media` (já existiam).
- Produces:

```ts
export const HISTORY_MAX_CONVERSATIONS = 50;
export const HISTORY_MAX_MESSAGES_PER_CONVERSATION = 30;
export const HISTORY_WINDOW_DAYS = 60;
export const HISTORY_BATCH_SIZE = 15;

export interface ImportHistoryResult {
  imported: number;
  skipped: number;
  errors: number;
  hasMore: boolean;
}

export async function importWhatsappHistory(
  whatsappRepo: WhatsappRepository,
  crmDeps: {
    findContactByPhone: (accountId: string, phone: string) => Promise<{ id: string; name: string } | null>;
    createContact: (accountId: string, input: { name: string; phone: string }) => Promise<{ id: string; name: string }>;
  },
  uazapiDeps: {
    findChats: (accountId: string, limit: number) => Promise<UazapiChat[]>;
    findMessages: (accountId: string, chatId: string, limit: number) => Promise<unknown[]>;
    downloadMedia: (accountId: string, providerMessageId: string) => Promise<{ bytes: Uint8Array; mime: string }>;
  },
  storage: WhatsappMediaStorage,
  accountId: string,
  nowIso: string,
): Promise<ImportHistoryResult>;
```

Usada pela Task 6 (Server Action).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar em `src/modules/whatsapp/service.test.ts`. Primeiro, ampliar os imports do topo do arquivo — trocar:

```ts
import {
  startConversation,
  logMessage,
  sendMediaMessage,
  runMediaRetention,
  getConversationMessages,
  handleInboundMessage,
  getConnectionStatus,
  connectWhatsapp,
  disconnectWhatsapp,
  resetUnreadCount,
  isValidWebhookSecret,
  parseWebhookPayload,
  personalizeMessage,
  sendBulkMessages,
} from "./service";
```

por:

```ts
import {
  startConversation,
  logMessage,
  sendMediaMessage,
  runMediaRetention,
  getConversationMessages,
  handleInboundMessage,
  importWhatsappHistory,
  getConnectionStatus,
  connectWhatsapp,
  disconnectWhatsapp,
  resetUnreadCount,
  isValidWebhookSecret,
  parseWebhookPayload,
  personalizeMessage,
  sendBulkMessages,
} from "./service";
import type { UazapiChat } from "./provider.uazapi";
```

Adicionar um novo `describe` no final do arquivo (antes do último `});` de fechamento do arquivo, no mesmo nível dos outros `describe`):

```ts
describe("importWhatsappHistory", () => {
  const NOW = "2026-09-04T12:00:00.000Z";

  function fakeChat(overrides: Partial<UazapiChat> = {}): UazapiChat {
    return {
      chatId: "5511999999999@s.whatsapp.net",
      phone: "5511999999999",
      name: "Carla Souza",
      isGroup: false,
      lastMessageTimestampMs: Date.parse(NOW) - 24 * 60 * 60 * 1000,
      ...overrides,
    };
  }

  function makeCrmDeps() {
    const crmRepo = createInMemoryCrmRepository();
    return {
      findContactByPhone: (accId: string, phone: string) => crm.findContactByPhone(crmRepo, accId, phone),
      createContact: (accId: string, input: { name: string; phone: string }) =>
        crm.createContact(crmRepo, accId, input),
    };
  }

  it("creates a conversation and a lead for a new phone, imports its messages", async () => {
    const repo = createInMemoryWhatsappRepository();
    const uazapiDeps = {
      findChats: vi.fn().mockResolvedValue([fakeChat()]),
      findMessages: vi.fn().mockResolvedValue([
        {
          fromMe: false,
          text: "Oi, gostaria de agendar",
          messageTimestamp: Date.parse(NOW) - 60 * 60 * 1000,
        },
        { fromMe: true, text: "Claro, qual dia?", messageTimestamp: Date.parse(NOW) - 30 * 60 * 1000 },
      ]),
      downloadMedia: vi.fn(),
    };
    const storage = createFakeWhatsappMediaStorage();

    const result = await importWhatsappHistory(
      repo,
      makeCrmDeps(),
      uazapiDeps,
      storage,
      "acc-1",
      NOW,
    );

    expect(result).toEqual({ imported: 1, skipped: 0, errors: 0, hasMore: false });

    const conversation = await repo.getConversationByPhone("acc-1", "5511999999999");
    expect(conversation?.historyImportedAt).toBe(NOW);
    expect(conversation?.contactId).not.toBeNull();
    expect(conversation?.lastMessagePreview).toBe("Claro, qual dia?");

    const messages = await repo.listMessages("acc-1", conversation!.id);
    expect(messages).toHaveLength(2);
    expect(messages.find((m) => m.direction === "inbound")?.body).toBe("Oi, gostaria de agendar");
    expect(messages.find((m) => m.direction === "outbound")?.body).toBe("Claro, qual dia?");
  });

  it("skips a conversation already marked as imported", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "5511999999999",
    });
    await repo.markHistoryImported("acc-1", conversation.id, "2026-09-01T00:00:00.000Z");

    const uazapiDeps = {
      findChats: vi.fn().mockResolvedValue([fakeChat()]),
      findMessages: vi.fn(),
      downloadMedia: vi.fn(),
    };

    const result = await importWhatsappHistory(
      repo,
      makeCrmDeps(),
      uazapiDeps,
      createFakeWhatsappMediaStorage(),
      "acc-1",
      NOW,
    );

    expect(result).toEqual({ imported: 0, skipped: 1, errors: 0, hasMore: false });
    expect(uazapiDeps.findMessages).not.toHaveBeenCalled();
  });

  it("discards chats outside the 60-day window and groups", async () => {
    const repo = createInMemoryWhatsappRepository();
    const uazapiDeps = {
      findChats: vi.fn().mockResolvedValue([
        fakeChat({
          phone: "5511111111111",
          chatId: "5511111111111@s.whatsapp.net",
          lastMessageTimestampMs: Date.parse(NOW) - 61 * 24 * 60 * 60 * 1000,
        }),
        fakeChat({ phone: "5511222222222", chatId: "123@g.us", isGroup: true }),
      ]),
      findMessages: vi.fn(),
      downloadMedia: vi.fn(),
    };

    const result = await importWhatsappHistory(
      repo,
      makeCrmDeps(),
      uazapiDeps,
      createFakeWhatsappMediaStorage(),
      "acc-1",
      NOW,
    );

    expect(result).toEqual({ imported: 0, skipped: 0, errors: 0, hasMore: false });
    expect(uazapiDeps.findMessages).not.toHaveBeenCalled();
  });

  it("processes at most HISTORY_BATCH_SIZE conversations and reports hasMore", async () => {
    const repo = createInMemoryWhatsappRepository();
    const chats = Array.from({ length: 16 }, (_, i) =>
      fakeChat({ phone: `551199999${String(i).padStart(4, "0")}`, chatId: `551199999${String(i).padStart(4, "0")}@s.whatsapp.net` }),
    );
    const uazapiDeps = {
      findChats: vi.fn().mockResolvedValue(chats),
      findMessages: vi.fn().mockResolvedValue([]),
      downloadMedia: vi.fn(),
    };

    const result = await importWhatsappHistory(
      repo,
      makeCrmDeps(),
      uazapiDeps,
      createFakeWhatsappMediaStorage(),
      "acc-1",
      NOW,
    );

    expect(result.imported).toBe(15);
    expect(result.hasMore).toBe(true);
    expect(uazapiDeps.findMessages).toHaveBeenCalledTimes(15);
  });

  it("keeps going when one conversation fails, and does not mark it as imported", async () => {
    const repo = createInMemoryWhatsappRepository();
    const uazapiDeps = {
      findChats: vi.fn().mockResolvedValue([
        fakeChat({ phone: "5511111111111", chatId: "5511111111111@s.whatsapp.net" }),
        fakeChat({ phone: "5511222222222", chatId: "5511222222222@s.whatsapp.net" }),
      ]),
      findMessages: vi
        .fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce([]),
      downloadMedia: vi.fn(),
    };

    const result = await importWhatsappHistory(
      repo,
      makeCrmDeps(),
      uazapiDeps,
      createFakeWhatsappMediaStorage(),
      "acc-1",
      NOW,
    );

    expect(result).toEqual({ imported: 1, skipped: 0, errors: 1, hasMore: false });
    const failedConversation = await repo.getConversationByPhone("acc-1", "5511111111111");
    expect(failedConversation?.historyImportedAt).toBeNull();
  });

  it("downloads media newer than 30 days and marks older media as expired without downloading", async () => {
    const repo = createInMemoryWhatsappRepository();
    const uazapiDeps = {
      findChats: vi.fn().mockResolvedValue([fakeChat()]),
      findMessages: vi.fn().mockResolvedValue([
        {
          fromMe: false,
          messageType: "ImageMessage",
          messageid: "recent-img",
          messageTimestamp: Date.parse(NOW) - 10 * 24 * 60 * 60 * 1000,
          text: "",
          content: { mimetype: "image/jpeg", fileLength: 1000 },
        },
        {
          fromMe: false,
          messageType: "ImageMessage",
          messageid: "old-img",
          messageTimestamp: Date.parse(NOW) - 40 * 24 * 60 * 60 * 1000,
          text: "",
          content: { mimetype: "image/jpeg", fileLength: 1000 },
        },
      ]),
      downloadMedia: vi.fn().mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg" }),
    };
    const storage = createFakeWhatsappMediaStorage();

    await importWhatsappHistory(repo, makeCrmDeps(), uazapiDeps, storage, "acc-1", NOW);

    expect(uazapiDeps.downloadMedia).toHaveBeenCalledTimes(1);
    expect(uazapiDeps.downloadMedia).toHaveBeenCalledWith("acc-1", "recent-img");

    const conversation = await repo.getConversationByPhone("acc-1", "5511999999999");
    const messages = await repo.listMessages("acc-1", conversation!.id);
    const recent = messages.find((m) => m.mediaStoragePath !== null);
    const old = messages.find((m) => m.mediaStoragePath === null);
    expect(recent?.mediaStatus).toBe("stored");
    expect(old?.mediaStatus).toBe("expired");
  });
});
```

Adicionar também os imports que faltam no topo do arquivo (se ainda não estiverem lá):
`createInMemoryCrmRepository` já é importado (`import { createInMemoryCrmRepository } from "../crm/repository.memory";`), `crm` já é importado como `import * as crm from "../crm/service";` — conferir e reaproveitar, não duplicar.

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npm test -- service.test.ts -t importWhatsappHistory`
Expected: FAIL — `importWhatsappHistory` não existe.

- [ ] **Step 3: Extrair `ingestMediaBytes` de `handleInboundMessage`**

Em `src/modules/whatsapp/service.ts`, atualizar o import de tipos para incluir `MediaStatus` e `MessageDirection`:

```ts
import type { WhatsappConnection, Message, MediaType, MediaStatus, MessageDirection } from "./types";
```

Adicionar a nova função (perto de `handleInboundMessage`, antes dela):

```ts
async function ingestMediaBytes(
  whatsappRepo: WhatsappRepository,
  storage: WhatsappMediaStorage,
  downloadMedia: (accountId: string, providerMessageId: string) => Promise<{ bytes: Uint8Array; mime: string }>,
  accountId: string,
  conversationId: string,
  message: Message,
  media: { providerMessageId: string; type: MediaType; mime: string },
): Promise<Message> {
  try {
    const { bytes, mime } = await downloadMedia(accountId, media.providerMessageId);
    if (bytes.byteLength > MAX_MEDIA_BYTES) {
      await whatsappRepo.updateMessageMedia(accountId, message.id, {
        status: "too_large",
        storagePath: null,
      });
      return { ...message, mediaStatus: "too_large", mediaStoragePath: null };
    }
    const path = storagePathFor(accountId, conversationId, message.id, mime || media.mime);
    await storage.upload(path, bytes, safeContentType(media.type, mime || media.mime));
    await whatsappRepo.updateMessageMedia(accountId, message.id, { status: "stored", storagePath: path });
    return { ...message, mediaStatus: "stored", mediaStoragePath: path };
  } catch (err) {
    console.error("[whatsapp] ingestão de mídia falhou, marcada como expired", err);
    return message;
  }
}
```

Dentro de `handleInboundMessage`, trocar o bloco:

```ts
    if (!tooLarge) {
      try {
        const { bytes, mime } = await mediaDeps.downloadMedia(
          accountId,
          input.media.providerMessageId,
        );
        if (bytes.byteLength > MAX_MEDIA_BYTES) {
          await whatsappRepo.updateMessageMedia(accountId, message.id, {
            status: "too_large",
            storagePath: null,
          });
          message = { ...message, mediaStatus: "too_large", mediaStoragePath: null };
        } else {
          const path = storagePathFor(accountId, conversation.id, message.id, mime || input.media.mime);
          await mediaDeps.storage.upload(
            path,
            bytes,
            safeContentType(input.media.type, mime || input.media.mime),
          );
          await whatsappRepo.updateMessageMedia(accountId, message.id, {
            status: "stored",
            storagePath: path,
          });
          message = { ...message, mediaStatus: "stored", mediaStoragePath: path };
        }
      } catch (err) {
        console.error("[whatsapp] ingestão de mídia falhou, marcada como expired", err);
        // a mensagem já está gravada como 'expired' — não relança
      }
    }
```

por:

```ts
    if (!tooLarge) {
      message = await ingestMediaBytes(
        whatsappRepo,
        mediaDeps.storage,
        mediaDeps.downloadMedia,
        accountId,
        conversation.id,
        message,
        { providerMessageId: input.media.providerMessageId, type: input.media.type, mime: input.media.mime },
      );
    }
```

- [ ] **Step 4: Rodar os testes de `handleInboundMessage` (refatoração pura)**

Run: `npm test -- service.test.ts -t "handleInboundMessage"`
Expected: PASS — nenhum teste existente muda de comportamento.

- [ ] **Step 5: Implementar `importWhatsappHistory`**

Ainda em `src/modules/whatsapp/service.ts`, adicionar o import do tipo do provider e da função de mapeamento:

```ts
import { mapUazapiMessage } from "./message-mapping";
import type { UazapiChat } from "./provider.uazapi";
```

Adicionar as constantes (perto de `DISCONNECTED_ERROR`):

```ts
export const HISTORY_MAX_CONVERSATIONS = 50;
export const HISTORY_MAX_MESSAGES_PER_CONVERSATION = 30;
export const HISTORY_WINDOW_DAYS = 60;
export const HISTORY_BATCH_SIZE = 15;
const HISTORY_MEDIA_WINDOW_DAYS = 30;
```

Adicionar a função (depois de `handleInboundMessage`):

```ts
export interface ImportHistoryResult {
  imported: number;
  skipped: number;
  errors: number;
  hasMore: boolean;
}

export async function importWhatsappHistory(
  whatsappRepo: WhatsappRepository,
  crmDeps: {
    findContactByPhone: (accountId: string, phone: string) => Promise<{ id: string; name: string } | null>;
    createContact: (
      accountId: string,
      input: { name: string; phone: string },
    ) => Promise<{ id: string; name: string }>;
  },
  uazapiDeps: {
    findChats: (accountId: string, limit: number) => Promise<UazapiChat[]>;
    findMessages: (accountId: string, chatId: string, limit: number) => Promise<unknown[]>;
    downloadMedia: (
      accountId: string,
      providerMessageId: string,
    ) => Promise<{ bytes: Uint8Array; mime: string }>;
  },
  storage: WhatsappMediaStorage,
  accountId: string,
  nowIso: string,
): Promise<ImportHistoryResult> {
  const nowMs = Date.parse(nowIso);
  const cutoffMs = nowMs - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const mediaCutoffMs = nowMs - HISTORY_MEDIA_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const allChats = await uazapiDeps.findChats(accountId, HISTORY_MAX_CONVERSATIONS);
  const chats = allChats.filter((c) => !c.isGroup && c.lastMessageTimestampMs >= cutoffMs);

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let processed = 0;
  let hasMore = false;

  for (const chat of chats) {
    let conversation = await whatsappRepo.getConversationByPhone(accountId, chat.phone);
    if (conversation?.historyImportedAt) {
      skipped += 1;
      continue;
    }

    if (processed >= HISTORY_BATCH_SIZE) {
      hasMore = true;
      continue;
    }
    processed += 1;

    try {
      if (!conversation) {
        let contact = await crmDeps.findContactByPhone(accountId, chat.phone);
        if (!contact) {
          contact = await crmDeps.createContact(accountId, { name: chat.name, phone: chat.phone });
        }
        conversation = await whatsappRepo.insertConversation(accountId, {
          contactId: contact.id,
          contactName: contact.name,
          contactPhone: chat.phone,
        });
      }
      const conversationId = conversation.id;
      const priorLastMessageAt = conversation.lastMessageAt;

      const rawMessages = await uazapiDeps.findMessages(
        accountId,
        chat.chatId,
        HISTORY_MAX_MESSAGES_PER_CONVERSATION,
      );

      let newestPreview: string | null = null;
      let newestSentAtMs: number | null = null;

      for (const raw of rawMessages) {
        const mapped = mapUazapiMessage(raw);
        if (!mapped) continue;

        const sentAtMs = mapped.timestampMs ?? nowMs;
        const sentAtIso = new Date(sentAtMs).toISOString();
        const direction: MessageDirection = mapped.fromMe ? "outbound" : "inbound";

        if (mapped.media) {
          const withinMediaWindow = sentAtMs >= mediaCutoffMs;
          const tooLargeByLength = mapped.media.fileLength > MAX_MEDIA_BYTES;
          const attemptDownload = withinMediaWindow && !tooLargeByLength;
          const initialStatus: MediaStatus =
            withinMediaWindow && tooLargeByLength ? "too_large" : "expired";

          let message = await whatsappRepo.insertMessage(accountId, conversationId, {
            direction,
            body: mapped.body,
            sentAt: sentAtIso,
            media: {
              type: mapped.media.type,
              status: initialStatus,
              mime: mapped.media.mime,
              filename: mapped.media.filename,
              storagePath: null,
            },
          });

          if (attemptDownload) {
            message = await ingestMediaBytes(
              whatsappRepo,
              storage,
              uazapiDeps.downloadMedia,
              accountId,
              conversationId,
              message,
              { providerMessageId: mapped.media.providerMessageId, type: mapped.media.type, mime: mapped.media.mime },
            );
          }
        } else {
          await whatsappRepo.insertMessage(accountId, conversationId, {
            direction,
            body: mapped.body,
            sentAt: sentAtIso,
          });
        }

        if (newestSentAtMs === null || sentAtMs > newestSentAtMs) {
          newestSentAtMs = sentAtMs;
          newestPreview =
            mapped.media && mapped.body === "" ? mediaPreviewLabel(mapped.media.type) : mapped.body;
        }
      }

      if (
        newestSentAtMs !== null &&
        newestPreview !== null &&
        (!priorLastMessageAt || newestSentAtMs > Date.parse(priorLastMessageAt))
      ) {
        await whatsappRepo.touchConversation(
          accountId,
          conversationId,
          newestPreview,
          new Date(newestSentAtMs).toISOString(),
        );
      }

      await whatsappRepo.markHistoryImported(accountId, conversationId, nowIso);
      imported += 1;
    } catch (err) {
      console.error("[whatsapp] importação de histórico: erro numa conversa, seguindo", chat.chatId, err);
      errors += 1;
    }
  }

  return { imported, skipped, errors, hasMore };
}
```

- [ ] **Step 6: Rodar os testes**

Run: `npm test -- service.test.ts`
Expected: PASS (todos, incluindo os novos de `importWhatsappHistory` e os já existentes).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 8: Commit**

```bash
git add src/modules/whatsapp/service.ts src/modules/whatsapp/service.test.ts
git commit -m "feat(whatsapp): importWhatsappHistory + ingestMediaBytes compartilhada"
```

---

### Task 6: Server Action `importWhatsappHistoryAction`

**Files:**
- Modify: `src/app/(app)/whatsapp/actions.ts`

**Interfaces:**
- Consumes: `whatsapp.importWhatsappHistory` (Task 5), `whatsapp.ImportHistoryResult`, `createSupabaseCrmRepository` de `@/modules/crm/repository.supabase`, `crm.findContactByPhone`/`crm.createContact` de `@/modules/crm/service` (mesmo padrão já usado no webhook route).
- Produces: `importWhatsappHistoryAction(): Promise<whatsapp.ImportHistoryResult>`.

- [ ] **Step 1: Implementar**

Em `src/app/(app)/whatsapp/actions.ts`, adicionar aos imports do topo:

```ts
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import * as crm from "@/modules/crm/service";
```

Adicionar ao final do arquivo:

```ts
export async function importWhatsappHistoryAction(): Promise<whatsapp.ImportHistoryResult> {
  const { repo, accountId } = await getRepoAndAccount();
  const supabase = await createServerSupabaseClient();
  const storage = createSupabaseWhatsappMediaStorage(supabase);
  const crmRepo = createSupabaseCrmRepository(supabase);
  const uazapi = createUazapiProvider(repo);

  const result = await whatsapp.importWhatsappHistory(
    repo,
    {
      findContactByPhone: (accId, phone) => crm.findContactByPhone(crmRepo, accId, phone),
      createContact: (accId, input) => crm.createContact(crmRepo, accId, input),
    },
    {
      findChats: (accId, limit) => uazapi.findChats(accId, limit),
      findMessages: (accId, chatId, limit) => uazapi.findMessages(accId, chatId, limit),
      downloadMedia: (accId, providerMessageId) => uazapi.downloadMedia(accId, providerMessageId),
    },
    storage,
    accountId,
    new Date().toISOString(),
  );
  revalidatePath("/whatsapp");
  return result;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/whatsapp/actions.ts
git commit -m "feat(whatsapp): importWhatsappHistoryAction"
```

---

### Task 7: UI — aviso pós-conexão + botão "Importar histórico" + resumo

**Files:**
- Modify: `src/components/whatsapp/whatsapp-client.tsx`

**Interfaces:**
- Consumes: `importWhatsappHistoryAction` (Task 6), `Conversation.historyImportedAt` (já existe em `types.ts`).

- [ ] **Step 1: Implementar**

Em `src/components/whatsapp/whatsapp-client.tsx`, adicionar ao import de actions:

```ts
  importWhatsappHistoryAction,
```

(logo após `getWhatsappConnectionAction,` na lista de imports de `@/app/(app)/whatsapp/actions`).

Dentro de `WhatsappClient`, adicionar os estados novos (perto de `connectionError`):

```ts
  const [importingHistory, setImportingHistory] = useState(false);
  const [historyImportError, setHistoryImportError] = useState<string | null>(null);
  const [historyImportSummary, setHistoryImportSummary] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyBannerDismissed, setHistoryBannerDismissed] = useState(false);
```

Adicionar a função de importação (perto de `handleToggleConnection`):

```ts
  async function handleImportHistory() {
    setImportingHistory(true);
    setHistoryImportError(null);
    try {
      const result = await importWhatsappHistoryAction();
      setHistoryImportSummary(
        `${result.imported} conversas importadas, ${result.skipped} já existentes, ${result.errors} com erro.`,
      );
      setHistoryHasMore(result.hasMore);
      setHistoryBannerDismissed(true);
      setConversations(await listConversationsAction());
    } catch (err) {
      setHistoryImportError(err instanceof Error ? err.message : "Erro ao importar histórico");
    } finally {
      setImportingHistory(false);
    }
  }
```

Adicionar, logo antes do `return`, o cálculo do aviso pós-conexão:

```ts
  const showHistoryBanner =
    !historyBannerDismissed &&
    connection?.status === "connected" &&
    conversations.every((c) => !c.historyImportedAt);
```

No JSX, dentro da `<div className="flex items-center gap-2">` que já tem o Badge/botão Conectar/`UazapiConfigDialog` (perto do topo do componente), adicionar o botão fixo depois de `<UazapiConfigDialog onSaved={refreshConnection} />`:

```tsx
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={importingHistory || connection?.status !== "connected"}
            onClick={handleImportHistory}
          >
            {importingHistory
              ? "Importando..."
              : historyHasMore
                ? "Continuar importação"
                : "Importar histórico"}
          </Button>
```

Logo abaixo do bloco `{connectionError && ...}` (antes do bloco do `{qrCode && ...}`), adicionar o aviso pós-conexão e o resumo:

```tsx
      {showHistoryBanner && (
        <div className="flex items-center justify-between gap-2 rounded-xl border p-3">
          <p className="text-sm">Conexão feita. Importar as conversas recentes?</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={importingHistory} onClick={handleImportHistory}>
              {importingHistory ? "Importando..." : "Importar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setHistoryBannerDismissed(true)}
            >
              Agora não
            </Button>
          </div>
        </div>
      )}
      {historyImportError && <p className="text-sm text-red-600">{historyImportError}</p>}
      {historyImportSummary && (
        <p className="text-sm text-muted-foreground">
          {historyImportSummary}
          {historyHasMore && " Clique em \"Continuar importação\" pra seguir."}
        </p>
      )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sem erros

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/whatsapp/whatsapp-client.tsx
git commit -m "feat(whatsapp): aviso pós-conexão + botão Importar histórico na UI"
```

---

## Depois do plano (fora do escopo das tasks acima)

- **Smoke-test manual** em `/whatsapp` (logado, Uazapi conectada, conta com histórico real): clicar "Importar histórico", conferir resumo, conferir que conversas antigas aparecem com mensagens na ordem certa e mídia recente/antiga se comportando como esperado (`stored` vs `expired`), conferir leads novos criados no CRM, clicar de novo pra confirmar idempotência (0 importadas, N já existentes).
- `git push origin main` (acumula com o Plano 2b já commitado).
- Deploy em prod segue bloqueado até o upgrade do plano Cloudflare Workers (ver `memory/whatsapp_plano_2b_execucao.md`).
