# WhatsApp — Receber mídia (Plano 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mídia recebida no WhatsApp (imagem, áudio, vídeo, documento) aparece na inbox: baixada da Uazapi, guardada num bucket privado, renderizada via URL assinada; legenda vira o corpo da mensagem; arquivo acima de 16 MB ou falha de download viram um marcador em vez de sumir.

**Architecture:** A migração `0016` acrescenta colunas de mídia em `whatsapp_messages`, a coluna `history_imported_at` em `whatsapp_conversations` (usada só no Plano 3, criada aqui), o bucket privado `whatsapp-media` com RLS por prefixo de `account_id` e um índice parcial para o cron de retenção (Plano 2b). `parseWebhookPayload` passa a extrair campos de mídia num objeto normalizado. Uma porta nova `WhatsappMediaStorage` (upload) e um método Uazapi-específico `downloadMedia` isolam I/O de arquivo. `handleInboundMessage` grava a mensagem primeiro com `media_status='expired'` (pessimista) e depois faz download→upload→`updateMessageMedia('stored')`; se o worker morrer no meio, a mensagem continua existindo como "indisponível". A listagem de mensagens gera URLs assinadas (TTL 1h) no servidor. O envio de mídia e o cron de retenção NÃO entram neste plano (Plano 2b).

**Tech Stack:** Next.js 16 (App Router, Server Actions, route handlers), React 19, TypeScript, Vitest, Supabase (Postgres + Storage, `@supabase/supabase-js`), módulo `src/modules/whatsapp/` (service + portas + repositório em memória para testes). Deploy Cloudflare Workers via OpenNext.

**Spec:** `docs/superpowers/specs/2026-09-03-whatsapp-midia-historico-design.md` (seção "Item 2 — Mídia", exceto "Envio (UI)" e "Cron de retenção", que são o Plano 2b). Payloads reais capturados: `docs/ops/whatsapp-payloads-capturados-2026-09-03.md` desta sessão — copiados como fixtures na Task 4.

## Global Constraints

- Todas as respostas e textos de UI em **português do Brasil**.
- Mudanças cirúrgicas: só tocar no que o "Item 2 — recebimento" exige. Sem mexer em `sendBulkMessages`, `sendMessage`, `logMessage` nem no fluxo de envio.
- **Sem grupos.** `parseWebhookPayload` continua descartando `fromMe === true` e `isGroup === true`.
- Comando de teste: `npm test` (roda `vitest run`). Typecheck: `npx tsc --noEmit`. Lint: `npm run lint`.
- Teto por arquivo: **16 MB** (`16 * 1024 * 1024`), constante no código, não setting.
- Valores de `media_type`: `image` | `audio` | `video` | `document`. Valores de `media_status`: `stored` | `too_large` | `expired`. `null` nos dois quando a mensagem é texto puro.
- Path do objeto no bucket: `{accountId}/{conversationId}/{messageId}.{ext}`.
- URLs assinadas com TTL de **3600 s** (1 h). O path cru do objeto nunca vai pro cliente.
- Migração: seguir o padrão de `0013_signed_consents.sql` (bucket privado + RLS por `(storage.foldername(name))[1]`). A última migração aplicada é `0015_contacts_document_fields.sql`; esta é a `0016`.
- **Assunção validada parcialmente:** o objeto `message` do webhook `{EventType:"messages", message:{...}}` tem os mesmos campos do item de `/message/find` (validado ao vivo). A Task 4, Step 1 confirma isso com uma captura rápida antes de escrever o parser; se divergir, ajustar as fixtures antes de prosseguir.

---

## File Structure

- `supabase/migrations/0016_whatsapp_media.sql` — **novo**. Colunas de mídia, `history_imported_at`, bucket, índice de retenção.
- `src/lib/supabase/database.types.ts` — **regenerado** após a migração (`npx supabase gen types typescript --linked`).
- `src/modules/whatsapp/types.ts` — `MediaType`, `MediaStatus`, campos de mídia em `Message`, `historyImportedAt` em `Conversation`.
- `src/modules/whatsapp/media.ts` — **novo**. `MAX_MEDIA_BYTES`, `mediaTypeFromUazapi()`, `extFromMime()`, `storagePathFor()`. Puro, sem I/O.
- `src/modules/whatsapp/storage.ts` — **novo**. Porta `WhatsappMediaStorage` + `createSupabaseWhatsappMediaStorage(supabase)`.
- `src/modules/whatsapp/storage.fake.ts` — **novo**. `createFakeWhatsappMediaStorage()` para testes.
- `src/modules/whatsapp/repository.ts` — `insertMessage` aceita campos de mídia; nova `updateMessageMedia`; `Message`/`Conversation` refletem colunas novas.
- `src/modules/whatsapp/repository.memory.ts` + `repository.supabase.ts` — implementar o acima.
- `src/modules/whatsapp/provider.uazapi.ts` — `downloadMedia` no `UazapiProvider`.
- `src/modules/whatsapp/service.ts` — `parseWebhookPayload` normaliza mídia; `handleInboundMessage` ganha ingestão de mídia (deps novas: `provider.downloadMedia`, `storage`).
- `src/modules/whatsapp/service.test.ts` — testes de parser e de ingestão.
- `src/modules/whatsapp/provider.uazapi.test.ts` — testes de `downloadMedia` (se o arquivo não existir, criar seguindo o padrão de `service.test.ts`).
- `src/app/api/whatsapp/webhook/[accountId]/route.ts` — injeta `storage` + provider Uazapi no `handleInboundMessage`.
- `src/app/(app)/whatsapp/actions.ts` — `getConversationMessagesAction` devolve `MessageView[]` com `mediaUrl` assinada.
- `src/components/whatsapp/whatsapp-client.tsx` — renderização de mídia + marcadores.
- `src/middleware.ts` — `media-src` no CSP.

---

### Task 1: Migração 0016 — colunas de mídia, bucket, índice

**Files:**
- Create: `supabase/migrations/0016_whatsapp_media.sql`
- Modify (regenerado): `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces (colunas em `whatsapp_messages`): `media_type text null`, `media_status text null`, `media_storage_path text null`, `media_mime text null`, `media_filename text null`. Coluna em `whatsapp_conversations`: `history_imported_at timestamptz null`. Bucket `whatsapp-media` (privado). Índice `whatsapp_messages_media_retention_idx`.

- [ ] **Step 1: Escrever a migração**

Criar `supabase/migrations/0016_whatsapp_media.sql`:

```sql
-- Feature: mídia recebida no WhatsApp (imagem, áudio, vídeo, documento).
-- Colunas de mídia em whatsapp_messages + bucket privado whatsapp-media.
-- history_imported_at é usada só pela importação de histórico (Plano 3),
-- criada aqui para não abrir outra migração depois.
-- Espelha o padrão de 0013_signed_consents.sql (bucket privado + RLS por
-- prefixo de account_id no path do objeto).

alter table whatsapp_messages
  add column media_type text
    check (media_type in ('image', 'audio', 'video', 'document')),
  add column media_status text
    check (media_status in ('stored', 'too_large', 'expired')),
  add column media_storage_path text,
  add column media_mime text,
  add column media_filename text;

-- Se tem mídia, tem status. Texto puro deixa os dois nulos.
alter table whatsapp_messages
  add constraint whatsapp_messages_media_status_present
  check (media_type is null or media_status is not null);

-- Usado pelo cron de retenção (Plano 2b): varre só o que está guardado.
create index whatsapp_messages_media_retention_idx
  on whatsapp_messages (sent_at)
  where media_status = 'stored';

alter table whatsapp_conversations
  add column history_imported_at timestamptz;

insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;

create policy "account members manage whatsapp media objects"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Aplicar a migração no banco linkado**

Run: `npx supabase db push --linked`
Expected: aplica `0016`. Se pedir confirmação, aceitar. Se `--linked` não estiver configurado, rodar `npx supabase link --project-ref nrfpjqrirmqktnnfqqex` antes (ref em `memory/arkdoctor_supabase_project.md`).

> A migração `0016` já pode ter sido aplicada manualmente em produção antes deste plano (padrão das features anteriores). Se `db push` disser "no migrations to apply", confirmar com `npx supabase migration list --linked` que `0016` aparece como aplicada e seguir.

- [ ] **Step 3: Regenerar os tipos do banco**

Run: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
Expected: o diff mostra as 5 colunas novas em `whatsapp_messages` (Row/Insert/Update) e `history_imported_at` em `whatsapp_conversations`. Nenhuma outra tabela muda.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Os tipos novos são opcionais no Insert (nullable), então nada quebra ainda.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0016_whatsapp_media.sql src/lib/supabase/database.types.ts
git commit -m "$(cat <<'EOF'
feat(whatsapp): migração 0016 — colunas de mídia + bucket whatsapp-media

whatsapp_messages ganha media_type/media_status/media_storage_path/
media_mime/media_filename com checks. Bucket privado whatsapp-media com RLS
por prefixo de account_id. Índice parcial para o cron de retenção (Plano 2b).
history_imported_at em whatsapp_conversations para a importação (Plano 3).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YZ9CY9uzfq9NdsGs2LhM3U
EOF
)"
```

---

### Task 2: Tipos de domínio — mídia em `Message`

**Files:**
- Modify: `src/modules/whatsapp/types.ts`

**Interfaces:**
- Produces:
  - `export type MediaType = "image" | "audio" | "video" | "document"`
  - `export type MediaStatus = "stored" | "too_large" | "expired"`
  - `Message` ganha: `mediaType: MediaType | null`, `mediaStatus: MediaStatus | null`, `mediaStoragePath: string | null`, `mediaMime: string | null`, `mediaFilename: string | null`.
  - `Conversation` ganha: `historyImportedAt: string | null`.

- [ ] **Step 1: Editar `types.ts`**

Adicionar após `MessageDirection` e dentro das interfaces:

```ts
export type MessageDirection = "inbound" | "outbound";

export type MediaType = "image" | "audio" | "video" | "document";
export type MediaStatus = "stored" | "too_large" | "expired";

export interface Message {
  id: string;
  conversationId: string;
  accountId: string;
  direction: MessageDirection;
  body: string;
  sentAt: string;
  mediaType: MediaType | null;
  mediaStatus: MediaStatus | null;
  mediaStoragePath: string | null;
  mediaMime: string | null;
  mediaFilename: string | null;
}
```

E em `Conversation`, adicionar `historyImportedAt: string | null;` após `createdAt`.

- [ ] **Step 2: Typecheck (falhas esperadas e localizadas)**

Run: `npx tsc --noEmit`
Expected: FALHA só em `repository.memory.ts` e `repository.supabase.ts` (os builders `toMessage`/`toConversation` e os `insertMessage`/`insertConversation` em memória não preenchem os campos novos). Nenhum erro em `service.ts`, `actions.ts` ou componentes ainda. Resolvido na Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/modules/whatsapp/types.ts
git commit -m "$(cat <<'EOF'
feat(whatsapp): campos de mídia em Message e historyImportedAt em Conversation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YZ9CY9uzfq9NdsGs2LhM3U
EOF
)"
```

---

### Task 3: Repositório — persistir e ler mídia

**Files:**
- Modify: `src/modules/whatsapp/repository.ts` (interface)
- Modify: `src/modules/whatsapp/repository.memory.ts`
- Modify: `src/modules/whatsapp/repository.supabase.ts`
- Test: `src/modules/whatsapp/service.test.ts` (usa o repo em memória — já é a cobertura)

**Interfaces:**
- Consumes: `MediaType`, `MediaStatus` (Task 2).
- Produces:
  - `insertMessage(accountId, conversationId, input)` — `input` passa a ser
    `{ direction: MessageDirection; body: string; media?: { type: MediaType; status: MediaStatus; mime: string; filename: string | null; storagePath: string | null } }`.
  - `updateMessageMedia(accountId, messageId, patch: { status: MediaStatus; storagePath: string | null }): Promise<void>` — novo.
  - `toMessage` mapeia as 5 colunas; `toConversation` mapeia `history_imported_at`.

- [ ] **Step 1: Escrever o teste que falha (repo em memória via service.test)**

Adicionar ao final do bloco `describe("whatsapp service", ...)` em `src/modules/whatsapp/service.test.ts`:

```ts
it("insertMessage grava campos de mídia e updateMessageMedia troca o status", async () => {
  const repo = createInMemoryWhatsappRepository();
  const conversation = await startConversation(repo, "acc-1", {
    contactId: null,
    contactName: "Carla",
    contactPhone: "5511999990000",
  });
  const msg = await repo.insertMessage("acc-1", conversation.id, {
    direction: "inbound",
    body: "Ola amigo",
    media: {
      type: "image",
      status: "expired",
      mime: "image/jpeg",
      filename: null,
      storagePath: null,
    },
  });
  expect(msg.mediaType).toBe("image");
  expect(msg.mediaStatus).toBe("expired");

  await repo.updateMessageMedia("acc-1", msg.id, {
    status: "stored",
    storagePath: "acc-1/" + conversation.id + "/" + msg.id + ".jpg",
  });
  const [read] = await getConversationMessages(repo, "acc-1", conversation.id);
  expect(read.mediaStatus).toBe("stored");
  expect(read.mediaStoragePath).toBe("acc-1/" + conversation.id + "/" + msg.id + ".jpg");
  expect(read.mediaMime).toBe("image/jpeg");
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/modules/whatsapp/service.test.ts -t "grava campos de mídia"`
Expected: FAIL — `input.media` é ignorado e `updateMessageMedia` não existe (`repo.updateMessageMedia is not a function`).

- [ ] **Step 3: Atualizar a interface `repository.ts`**

```ts
import type {
  Conversation, Message, WhatsappConnection, ConnectionStatus, MediaType, MediaStatus,
} from "./types";

// ...
  insertMessage(
    accountId: string,
    conversationId: string,
    input: {
      direction: "inbound" | "outbound";
      body: string;
      media?: {
        type: MediaType;
        status: MediaStatus;
        mime: string;
        filename: string | null;
        storagePath: string | null;
      };
    },
  ): Promise<Message>;
  updateMessageMedia(
    accountId: string,
    messageId: string,
    patch: { status: MediaStatus; storagePath: string | null },
  ): Promise<void>;
```

- [ ] **Step 4: Implementar em `repository.memory.ts`**

No `insertMessage`, montar o `Message` completo:

```ts
async insertMessage(accountId, conversationId, input) {
  const id = crypto.randomUUID();
  const message: Message = {
    id,
    conversationId,
    accountId,
    direction: input.direction,
    body: input.body,
    sentAt: new Date().toISOString(),
    mediaType: input.media?.type ?? null,
    mediaStatus: input.media?.status ?? null,
    mediaStoragePath: input.media?.storagePath ?? null,
    mediaMime: input.media?.mime ?? null,
    mediaFilename: input.media?.filename ?? null,
  };
  messages.set(id, message);
  return message;
},

async updateMessageMedia(accountId, messageId, patch) {
  const m = messages.get(messageId);
  if (!m || m.accountId !== accountId) return;
  messages.set(messageId, {
    ...m,
    mediaStatus: patch.status,
    mediaStoragePath: patch.storagePath,
  });
},
```

No `insertConversation`, adicionar `historyImportedAt: null` ao objeto. Importar `Message` já vem do arquivo.

- [ ] **Step 5: Implementar em `repository.supabase.ts`**

`toMessage` passa a mapear as colunas novas:

```ts
function toMessage(
  row: Database["public"]["Tables"]["whatsapp_messages"]["Row"],
): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    accountId: row.account_id,
    direction: row.direction as MessageDirection,
    body: row.body,
    sentAt: row.sent_at,
    mediaType: (row.media_type as MediaType | null) ?? null,
    mediaStatus: (row.media_status as MediaStatus | null) ?? null,
    mediaStoragePath: row.media_storage_path,
    mediaMime: row.media_mime,
    mediaFilename: row.media_filename,
  };
}
```

`toConversation` ganha `historyImportedAt: row.history_imported_at`.

`insertMessage`:

```ts
async insertMessage(accountId, conversationId, input) {
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .insert({
      account_id: accountId,
      conversation_id: conversationId,
      direction: input.direction,
      body: input.body,
      media_type: input.media?.type ?? null,
      media_status: input.media?.status ?? null,
      media_storage_path: input.media?.storagePath ?? null,
      media_mime: input.media?.mime ?? null,
      media_filename: input.media?.filename ?? null,
    })
    .select("*")
    .single();
  if (error) throwDbError(error);
  return toMessage(data);
},

async updateMessageMedia(accountId, messageId, patch) {
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ media_status: patch.status, media_storage_path: patch.storagePath })
    .eq("account_id", accountId)
    .eq("id", messageId);
  if (error) throwDbError(error);
},
```

Adicionar `MediaType, MediaStatus` ao import de `./types` no topo do arquivo.

- [ ] **Step 6: Rodar toda a suíte do módulo**

Run: `npx vitest run src/modules/whatsapp/ && npx tsc --noEmit`
Expected: PASS. O teste da Task 3 passa; os testes existentes (que não passam `media`) continuam passando porque os campos caem em `null`.

- [ ] **Step 7: Commit**

```bash
git add src/modules/whatsapp/repository.ts src/modules/whatsapp/repository.memory.ts src/modules/whatsapp/repository.supabase.ts src/modules/whatsapp/service.test.ts
git commit -m "$(cat <<'EOF'
feat(whatsapp): repositório grava e lê campos de mídia da mensagem

insertMessage aceita input.media; nova updateMessageMedia para promover
'expired' -> 'stored'/'too_large' depois do upload. toMessage/toConversation
mapeiam as colunas novas.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YZ9CY9uzfq9NdsGs2LhM3U
EOF
)"
```

---

### Task 4: `parseWebhookPayload` — extrair mídia

**Files:**
- Modify: `src/modules/whatsapp/service.ts` (`parseWebhookPayload`, ~linha 181; ramo `payload.EventType === "messages"`)
- Create: `src/modules/whatsapp/media.ts`
- Test: `src/modules/whatsapp/service.test.ts` (bloco `describe("parseWebhookPayload", ...)` — existe hoje? se não, criar)

**Interfaces:**
- Consumes: `MediaType` (Task 2).
- Produces:
  - `media.ts`: `export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;`
    `export function mediaTypeFromUazapi(messageType: string): MediaType | null` — `"ImageMessage" -> "image"`, `"AudioMessage" -> "audio"`, `"VideoMessage" -> "video"`, `"DocumentMessage" -> "document"`, resto `null`.
    `export function extFromMime(mime: string): string` — `image/jpeg->jpg`, `image/png->png`, `image/webp->webp`, `audio/ogg->ogg`, `audio/mpeg->mp3`, `video/mp4->mp4`, `application/pdf->pdf`; fallback: parte depois de `/` sem parâmetros, ou `"bin"`.
  - `parseWebhookPayload(body)` retorna, além de `{ fromPhone, fromName?, body }`, um campo opcional
    `media?: { providerMessageId: string; type: MediaType; mime: string; filename: string | null; fileLength: number }`.
    Para mensagem de mídia, `body` é a legenda (`content.caption` / `text`) ou `""`.

- [ ] **Step 1: (validação ao vivo, 2 min) confirmar o envelope do webhook de mídia**

Com o WhatsApp conectado, mandar de outro celular **uma imagem com legenda** para o número da instância e capturar o POST que a Uazapi faz no webhook. Caminho mais simples: `docs/ops/whatsapp-validacao-payloads-uazapi.md` seção 6 (apontar `POST /webhook` para um `https://webhook.site/...` temporário, mandar a mídia, ler, restaurar a URL real).
Confirmar que o objeto `message` traz `messageType`, `content.mimetype`, `content.caption` (imagem), `content.fileName` (documento), `content.fileLength`, `messageid`, `sender_pn`, `fromMe`, `isGroup` — os mesmos campos de `/message/find` capturados em `docs/ops/whatsapp-payloads-capturados-2026-09-03.md`.
**Se bater:** usar as fixtures do Step 2 como estão. **Se divergir:** ajustar as fixtures para o payload real antes de seguir.

- [ ] **Step 2: Escrever os testes que falham**

Em `src/modules/whatsapp/service.test.ts`, no bloco `describe("parseWebhookPayload", ...)` (criar o bloco se não existir, ao lado dos outros `describe`), adicionar. As fixtures abaixo são recortes reais capturados (só o essencial de `content`):

```ts
const imageWebhook = {
  EventType: "messages",
  message: {
    fromMe: false,
    isGroup: false,
    messageType: "ImageMessage",
    messageid: "3AFC432F36B07600E616",
    sender: "257208528953502@lid",
    sender_pn: "556696604575@s.whatsapp.net",
    senderName: "Ederson Fernandes",
    text: "Ola amigo",
    content: {
      mimetype: "image/jpeg",
      caption: "Ola amigo",
      fileLength: 125831,
      URL: "https://mmg.whatsapp.net/o1/v/t24/enc?mms3=true",
    },
  },
};

const documentWebhook = {
  EventType: "messages",
  message: {
    fromMe: false,
    isGroup: false,
    messageType: "DocumentMessage",
    messageid: "3AAED69C92FBA6BAE2C1",
    sender: "257208528953502@lid",
    sender_pn: "556696604575@s.whatsapp.net",
    senderName: "Ederson Fernandes",
    text: "",
    content: {
      mimetype: "application/pdf",
      fileName: "1004239-53.2025.8.11.0040-processo.pdf",
      fileLength: 2413752,
    },
  },
};

const audioWebhook = {
  EventType: "messages",
  message: {
    fromMe: false,
    isGroup: false,
    messageType: "AudioMessage",
    messageid: "3AD9DA24C6DECE028736",
    sender_pn: "556696604575@s.whatsapp.net",
    text: "",
    content: { mimetype: "audio/ogg; codecs=opus", fileLength: 11705, PTT: true },
  },
};

it("extrai mídia de imagem com legenda", () => {
  const parsed = parseWebhookPayload(imageWebhook);
  expect(parsed).toEqual({
    fromPhone: "556696604575",
    fromName: "Ederson Fernandes",
    body: "Ola amigo",
    media: {
      providerMessageId: "3AFC432F36B07600E616",
      type: "image",
      mime: "image/jpeg",
      filename: null,
      fileLength: 125831,
    },
  });
});

it("extrai mídia de documento com fileName e legenda vazia", () => {
  const parsed = parseWebhookPayload(documentWebhook);
  expect(parsed?.media).toEqual({
    providerMessageId: "3AAED69C92FBA6BAE2C1",
    type: "document",
    mime: "application/pdf",
    filename: "1004239-53.2025.8.11.0040-processo.pdf",
    fileLength: 2413752,
  });
  expect(parsed?.body).toBe("");
});

it("extrai mídia de áudio (mime com parâmetros)", () => {
  const parsed = parseWebhookPayload(audioWebhook);
  expect(parsed?.media?.type).toBe("audio");
  expect(parsed?.media?.mime).toBe("audio/ogg; codecs=opus");
});

it("descarta mídia de grupo e fromMe", () => {
  expect(parseWebhookPayload({ ...imageWebhook, message: { ...imageWebhook.message, isGroup: true } })).toBeNull();
  expect(parseWebhookPayload({ ...imageWebhook, message: { ...imageWebhook.message, fromMe: true } })).toBeNull();
});

it("mensagem de texto puro continua sem campo media", () => {
  const parsed = parseWebhookPayload({
    EventType: "messages",
    message: { fromMe: false, isGroup: false, messageType: "Conversation", sender_pn: "556696604575@s.whatsapp.net", text: "oi" },
  });
  expect(parsed).toEqual({ fromPhone: "556696604575", fromName: undefined, body: "oi" });
  expect("media" in (parsed ?? {})).toBe(false);
});
```

- [ ] **Step 3: Rodar e confirmar que falham**

Run: `npx vitest run src/modules/whatsapp/service.test.ts -t "extrai mídia"`
Expected: FAIL — hoje `parseWebhookPayload` exige `typeof messageData.text === "string"` e devolve só `{fromPhone, fromName, body}`; sem `media`, e para `text: ""` (áudio/vídeo/doc) devolve body vazio sem mídia.

- [ ] **Step 4: Criar `src/modules/whatsapp/media.ts`**

```ts
import type { MediaType } from "./types";

export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

const UAZAPI_MESSAGE_TYPE: Record<string, MediaType> = {
  ImageMessage: "image",
  AudioMessage: "audio",
  VideoMessage: "video",
  DocumentMessage: "document",
};

export function mediaTypeFromUazapi(messageType: string): MediaType | null {
  return UAZAPI_MESSAGE_TYPE[messageType] ?? null;
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

export function extFromMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (MIME_EXT[base]) return MIME_EXT[base];
  const afterSlash = base.split("/")[1];
  return afterSlash && /^[a-z0-9.+-]+$/.test(afterSlash) ? afterSlash : "bin";
}

export function storagePathFor(
  accountId: string,
  conversationId: string,
  messageId: string,
  mime: string,
): string {
  return `${accountId}/${conversationId}/${messageId}.${extFromMime(mime)}`;
}
```

- [ ] **Step 5: Alterar `parseWebhookPayload` no ramo `EventType === "messages"`**

Substituir o corpo do `if (payload.EventType === "messages") { ... }` (linhas ~187-200) por:

```ts
import { mediaTypeFromUazapi } from "./media";
// (adicionar no topo do arquivo, junto dos outros imports)

  if (payload.EventType === "messages") {
    const message = payload.message;
    if (typeof message !== "object" || message === null) return null;
    const messageData = message as Record<string, unknown>;
    if (messageData.fromMe === true || messageData.isGroup === true) return null;
    const senderJid =
      typeof messageData.sender_pn === "string" ? messageData.sender_pn : messageData.sender;
    if (typeof senderJid !== "string") return null;

    const content =
      typeof messageData.content === "object" && messageData.content !== null
        ? (messageData.content as Record<string, unknown>)
        : {};
    const mediaType =
      typeof messageData.messageType === "string"
        ? mediaTypeFromUazapi(messageData.messageType)
        : null;

    const fromPhone = normalizeWhatsappJid(senderJid);
    const fromName =
      typeof messageData.senderName === "string" ? messageData.senderName : undefined;

    if (mediaType) {
      const mime = typeof content.mimetype === "string" ? content.mimetype : "application/octet-stream";
      const caption =
        typeof content.caption === "string"
          ? content.caption
          : typeof messageData.text === "string"
            ? messageData.text
            : "";
      const filename =
        mediaType === "document" && typeof content.fileName === "string"
          ? content.fileName
          : null;
      const providerMessageId =
        typeof messageData.messageid === "string" ? messageData.messageid : "";
      const fileLength = typeof content.fileLength === "number" ? content.fileLength : 0;
      return {
        fromPhone,
        fromName,
        body: caption,
        media: { providerMessageId, type: mediaType, mime, filename, fileLength },
      };
    }

    if (typeof messageData.text !== "string") return null;
    return { fromPhone, fromName, body: messageData.text };
  }
```

Atualizar a assinatura de retorno da função:

```ts
export function parseWebhookPayload(
  body: unknown,
): {
  fromPhone: string;
  fromName?: string;
  body: string;
  media?: {
    providerMessageId: string;
    type: import("./types").MediaType;
    mime: string;
    filename: string | null;
    fileLength: number;
  };
} | null {
```

- [ ] **Step 6: Rodar os testes do parser + suíte do módulo**

Run: `npx vitest run src/modules/whatsapp/ && npx tsc --noEmit`
Expected: PASS. Os ramos `event === "messages.upsert"` e o fallback `fromPhone/body` não foram tocados; seus testes continuam verdes.

- [ ] **Step 7: Commit**

```bash
git add src/modules/whatsapp/media.ts src/modules/whatsapp/service.ts src/modules/whatsapp/service.test.ts
git commit -m "$(cat <<'EOF'
feat(whatsapp): parseWebhookPayload extrai mídia (tipo, mime, filename, legenda)

Novo módulo media.ts (MAX_MEDIA_BYTES, mediaTypeFromUazapi, extFromMime,
storagePathFor). Mensagem de mídia devolve { media } com providerMessageId
para o download; legenda vira o body. Grupo/fromMe continuam descartados.
Fixtures são recortes reais capturados na validação ao vivo.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YZ9CY9uzfq9NdsGs2LhM3U
EOF
)"
```

---

### Task 5: Porta de storage + `downloadMedia` no provider Uazapi

**Files:**
- Create: `src/modules/whatsapp/storage.ts`
- Create: `src/modules/whatsapp/storage.fake.ts`
- Modify: `src/modules/whatsapp/provider.uazapi.ts` (`UazapiProvider` interface + impl)
- Create: `src/modules/whatsapp/provider.uazapi.test.ts`

**Interfaces:**
- Consumes: `WhatsappRepository`, `UazapiConfig` (interno de `provider.uazapi.ts`), `Database` type do Supabase.
- Produces:
  - `storage.ts`: `export interface WhatsappMediaStorage { upload(path: string, bytes: Uint8Array, mime: string): Promise<void>; createSignedUrls(paths: string[], ttlSeconds: number): Promise<(string | null)[]>; remove(paths: string[]): Promise<void>; }` e `export function createSupabaseWhatsappMediaStorage(supabase: SupabaseClient<Database>): WhatsappMediaStorage`.
  - `storage.fake.ts`: `export function createFakeWhatsappMediaStorage(): WhatsappMediaStorage & { objects: Map<string, { bytes: Uint8Array; mime: string }> }`.
  - `UazapiProvider` ganha `downloadMedia(accountId: string, providerMessageId: string): Promise<{ bytes: Uint8Array; mime: string }>`.
- Nota: `createSignedUrls`/`remove` são usados pelas Tasks 8 e (Plano 2b); ficam na porta agora para não reabrir o arquivo depois.

- [ ] **Step 1: Criar `storage.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const BUCKET = "whatsapp-media";

export interface WhatsappMediaStorage {
  upload(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  createSignedUrls(paths: string[], ttlSeconds: number): Promise<(string | null)[]>;
  remove(paths: string[]): Promise<void>;
}

export function createSupabaseWhatsappMediaStorage(
  supabase: SupabaseClient<Database>,
): WhatsappMediaStorage {
  return {
    async upload(path, bytes, mime) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: mime, upsert: true });
      if (error) throw new Error(`Falha ao subir mídia no storage: ${error.message}`);
    },
    async createSignedUrls(paths, ttlSeconds) {
      if (paths.length === 0) return [];
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, ttlSeconds);
      if (error) throw new Error("Não foi possível gerar as URLs da mídia.");
      return data.map((d) => d.signedUrl ?? null);
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await supabase.storage.from(BUCKET).remove(paths);
      if (error) throw new Error(`Falha ao remover mídia do storage: ${error.message}`);
    },
  };
}
```

- [ ] **Step 2: Criar `storage.fake.ts`**

```ts
import type { WhatsappMediaStorage } from "./storage";

export function createFakeWhatsappMediaStorage(): WhatsappMediaStorage & {
  objects: Map<string, { bytes: Uint8Array; mime: string }>;
} {
  const objects = new Map<string, { bytes: Uint8Array; mime: string }>();
  return {
    objects,
    async upload(path, bytes, mime) {
      objects.set(path, { bytes, mime });
    },
    async createSignedUrls(paths) {
      return paths.map((p) => (objects.has(p) ? `https://signed.test/${p}` : null));
    },
    async remove(paths) {
      paths.forEach((p) => objects.delete(p));
    },
  };
}
```

- [ ] **Step 3: Escrever o teste de `downloadMedia` que falha**

Criar `src/modules/whatsapp/provider.uazapi.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createUazapiProvider } from "./provider.uazapi";
import { createInMemoryWhatsappRepository } from "./repository.memory";

async function repoWithUazapi() {
  const repo = createInMemoryWhatsappRepository();
  await repo.updateConnectionConfig("acc-1", "uazapi", {
    subdomain: "arkscrapper",
    token: "tok-1",
    webhookSecret: "sec-1",
  });
  return repo;
}

afterEach(() => vi.restoreAllMocks());

describe("UazapiProvider.downloadMedia", () => {
  it("chama /message/download e baixa o fileURL retornado", async () => {
    const repo = await repoWithUazapi();
    const provider = createUazapiProvider(repo);
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/message/download")) {
        expect(JSON.parse(String(init?.body))).toEqual({ id: "MID-1" });
        return new Response(
          JSON.stringify({ fileURL: "https://arkscrapper.uazapi.com/files/abc.jpg", mimetype: "image/jpeg" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (u === "https://arkscrapper.uazapi.com/files/abc.jpg") {
        return new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      throw new Error("URL inesperada: " + u);
    });

    const result = await provider.downloadMedia("acc-1", "MID-1");
    expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4]);
    expect(result.mime).toBe("image/jpeg");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lança quando /message/download não devolve fileURL", async () => {
    const repo = await repoWithUazapi();
    const provider = createUazapiProvider(repo);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "not found" }), { status: 200 }),
    );
    await expect(provider.downloadMedia("acc-1", "MID-x")).rejects.toThrow("Falha ao baixar mídia");
  });
});
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `npx vitest run src/modules/whatsapp/provider.uazapi.test.ts`
Expected: FAIL — `provider.downloadMedia is not a function`.

- [ ] **Step 5: Implementar `downloadMedia` em `provider.uazapi.ts`**

Na interface:

```ts
export interface UazapiProvider extends WhatsappProvider {
  getQrCode(accountId: string): Promise<string | null>;
  downloadMedia(
    accountId: string,
    providerMessageId: string,
  ): Promise<{ bytes: Uint8Array; mime: string }>;
}
```

Na fábrica, junto de `getQrCode`:

```ts
    async downloadMedia(accountId, providerMessageId) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      const meta = await fetch(`${baseUrl(config.subdomain)}/message/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({ id: providerMessageId }),
      });
      const metaJson = meta.ok ? await meta.json().catch(() => null) : null;
      const fileUrl = metaJson?.fileURL;
      if (typeof fileUrl !== "string" || !fileUrl) {
        throw new Error("Falha ao baixar mídia: a Uazapi não devolveu fileURL");
      }
      const mime =
        typeof metaJson?.mimetype === "string" ? metaJson.mimetype : "application/octet-stream";

      const file = await fetch(fileUrl);
      if (!file.ok) throw new Error(`Falha ao baixar mídia: arquivo (${file.status})`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { bytes, mime };
    },
```

- [ ] **Step 6: Rodar testes + typecheck**

Run: `npx vitest run src/modules/whatsapp/ && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/whatsapp/storage.ts src/modules/whatsapp/storage.fake.ts src/modules/whatsapp/provider.uazapi.ts src/modules/whatsapp/provider.uazapi.test.ts
git commit -m "$(cat <<'EOF'
feat(whatsapp): porta WhatsappMediaStorage + UazapiProvider.downloadMedia

storage.ts abstrai upload/createSignedUrls/remove do bucket whatsapp-media
(+ fake para testes). downloadMedia chama /message/download e baixa o
fileURL público que a Uazapi devolve (validado ao vivo).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YZ9CY9uzfq9NdsGs2LhM3U
EOF
)"
```

---

### Task 6: Ingestão de mídia no `handleInboundMessage`

**Files:**
- Modify: `src/modules/whatsapp/service.ts` (`handleInboundMessage`, ~linha 47)
- Test: `src/modules/whatsapp/service.test.ts`

**Interfaces:**
- Consumes: `parseWebhookPayload` retorno com `media` (Task 4); `WhatsappRepository.insertMessage`/`updateMessageMedia` (Task 3); `WhatsappMediaStorage` (Task 5); `mediaDownloader: (accountId, providerMessageId) => Promise<{ bytes: Uint8Array; mime: string }>` (o `downloadMedia` do provider); `MAX_MEDIA_BYTES`, `storagePathFor` (Task 4).
- Produces: `handleInboundMessage` ganha um 5º parâmetro opcional `mediaDeps?: { storage: WhatsappMediaStorage; downloadMedia: (accountId: string, providerMessageId: string) => Promise<{ bytes: Uint8Array; mime: string }> }` e o `input` (4º parâmetro) passa a aceitar `media?` como devolvido por `parseWebhookPayload`. Sem `mediaDeps` ou sem `input.media`, o comportamento é idêntico ao de hoje.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao `describe("whatsapp service", ...)` em `service.test.ts` (importar no topo: `createFakeWhatsappMediaStorage` de `./storage.fake`, `MAX_MEDIA_BYTES` de `./media`):

```ts
function mediaDepsFake() {
  const storage = createFakeWhatsappMediaStorage();
  const downloadMedia = vi.fn(async () => ({ bytes: new Uint8Array([9, 9, 9]), mime: "image/jpeg" }));
  return { storage, downloadMedia };
}

it("ingestão de mídia: baixa, sobe no bucket e grava a mensagem como stored", async () => {
  const repo = createInMemoryWhatsappRepository();
  const crmDeps = buildCrmDeps(createInMemoryCrmRepository());
  const deps = mediaDepsFake();

  const msg = await handleInboundMessage(repo, crmDeps, "acc-1", {
    fromPhone: "5511988887777",
    fromName: "Carla",
    body: "Ola amigo",
    media: { providerMessageId: "MID-1", type: "image", mime: "image/jpeg", filename: null, fileLength: 3 },
  }, deps);

  expect(deps.downloadMedia).toHaveBeenCalledWith("acc-1", "MID-1");
  const stored = await getConversationMessages(repo, "acc-1", msg.conversationId);
  expect(stored[0].mediaType).toBe("image");
  expect(stored[0].mediaStatus).toBe("stored");
  expect(stored[0].body).toBe("Ola amigo");
  expect(deps.storage.objects.get(stored[0].mediaStoragePath!)).toBeDefined();
});

it("ingestão de mídia: arquivo acima de 16 MB entra como too_large sem baixar", async () => {
  const repo = createInMemoryWhatsappRepository();
  const crmDeps = buildCrmDeps(createInMemoryCrmRepository());
  const deps = mediaDepsFake();

  const msg = await handleInboundMessage(repo, crmDeps, "acc-1", {
    fromPhone: "5511988887777",
    body: "",
    media: { providerMessageId: "MID-2", type: "video", mime: "video/mp4", filename: null, fileLength: MAX_MEDIA_BYTES + 1 },
  }, deps);

  expect(deps.downloadMedia).not.toHaveBeenCalled();
  const stored = await getConversationMessages(repo, "acc-1", msg.conversationId);
  expect(stored[0].mediaStatus).toBe("too_large");
  expect(stored[0].mediaStoragePath).toBeNull();
});

it("ingestão de mídia: falha de download deixa a mensagem como expired, não lança", async () => {
  const repo = createInMemoryWhatsappRepository();
  const crmDeps = buildCrmDeps(createInMemoryCrmRepository());
  const storage = createFakeWhatsappMediaStorage();
  const downloadMedia = vi.fn(async () => { throw new Error("rede caiu"); });

  const msg = await handleInboundMessage(repo, crmDeps, "acc-1", {
    fromPhone: "5511988887777",
    body: "",
    media: { providerMessageId: "MID-3", type: "audio", mime: "audio/ogg", filename: null, fileLength: 10 },
  }, { storage, downloadMedia });

  const stored = await getConversationMessages(repo, "acc-1", msg.conversationId);
  expect(stored[0].mediaStatus).toBe("expired");
  expect(stored[0].mediaType).toBe("audio");
});

it("sem media no input, handleInboundMessage grava texto puro como antes", async () => {
  const repo = createInMemoryWhatsappRepository();
  const crmDeps = buildCrmDeps(createInMemoryCrmRepository());
  const msg = await handleInboundMessage(repo, crmDeps, "acc-1", {
    fromPhone: "5511988887777",
    body: "oi",
  });
  const stored = await getConversationMessages(repo, "acc-1", msg.conversationId);
  expect(stored[0].mediaType).toBeNull();
  expect(stored[0].body).toBe("oi");
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `npx vitest run src/modules/whatsapp/service.test.ts -t "ingestão de mídia"`
Expected: FAIL — `handleInboundMessage` ignora `input.media` e o 5º parâmetro.

- [ ] **Step 3: Implementar a ingestão**

Em `service.ts`, importar no topo:

```ts
import { MAX_MEDIA_BYTES, storagePathFor } from "./media";
import type { WhatsappMediaStorage } from "./storage";
```

Reescrever `handleInboundMessage` (a parte de contato/conversa fica igual; muda só o `input` e o trecho de inserção da mensagem):

```ts
export async function handleInboundMessage(
  whatsappRepo: WhatsappRepository,
  crmDeps: {
    findContactByPhone: (accountId: string, phone: string) => Promise<{ id: string; name: string } | null>;
    createContact: (
      accountId: string,
      input: { name: string; phone: string },
    ) => Promise<{ id: string; name: string }>;
  },
  accountId: string,
  input: {
    fromPhone: string;
    fromName?: string;
    body: string;
    media?: {
      providerMessageId: string;
      type: MediaType;
      mime: string;
      filename: string | null;
      fileLength: number;
    };
  },
  mediaDeps?: {
    storage: WhatsappMediaStorage;
    downloadMedia: (
      accountId: string,
      providerMessageId: string,
    ) => Promise<{ bytes: Uint8Array; mime: string }>;
  },
) {
  let contact = await crmDeps.findContactByPhone(accountId, input.fromPhone);
  if (!contact) {
    contact = await crmDeps.createContact(accountId, {
      name: input.fromName ?? input.fromPhone,
      phone: input.fromPhone,
    });
  }

  let conversation = await whatsappRepo.getConversationByPhone(accountId, input.fromPhone);
  if (!conversation) {
    conversation = await whatsappRepo.insertConversation(accountId, {
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: input.fromPhone,
    });
  } else if (conversation.contactId === null) {
    await whatsappRepo.linkConversationContact(accountId, conversation.id, contact.id);
    conversation = { ...conversation, contactId: contact.id };
  }

  const preview =
    input.media && input.body === ""
      ? mediaPreviewLabel(input.media.type)
      : input.body;

  let message: Message;
  if (input.media && mediaDeps) {
    const tooLarge = input.media.fileLength > MAX_MEDIA_BYTES;
    message = await whatsappRepo.insertMessage(accountId, conversation.id, {
      direction: "inbound",
      body: input.body,
      media: {
        type: input.media.type,
        status: tooLarge ? "too_large" : "expired",
        mime: input.media.mime,
        filename: input.media.filename,
        storagePath: null,
      },
    });
    if (!tooLarge) {
      try {
        const { bytes, mime } = await mediaDeps.downloadMedia(
          accountId,
          input.media.providerMessageId,
        );
        const path = storagePathFor(accountId, conversation.id, message.id, mime || input.media.mime);
        await mediaDeps.storage.upload(path, bytes, mime || input.media.mime);
        await whatsappRepo.updateMessageMedia(accountId, message.id, {
          status: "stored",
          storagePath: path,
        });
        message = { ...message, mediaStatus: "stored", mediaStoragePath: path };
      } catch (err) {
        console.error("[whatsapp] ingestão de mídia falhou, marcada como expired", err);
        // a mensagem já está gravada como 'expired' — não relança
      }
    }
  } else {
    message = await whatsappRepo.insertMessage(accountId, conversation.id, {
      direction: "inbound",
      body: input.body,
    });
  }

  await whatsappRepo.touchConversation(accountId, conversation.id, preview, message.sentAt);
  await whatsappRepo.incrementUnreadCount(accountId, conversation.id);

  return message;
}

function mediaPreviewLabel(type: MediaType): string {
  return { image: "📷 Imagem", audio: "🎤 Áudio", video: "🎬 Vídeo", document: "📄 Documento" }[type];
}
```

Adicionar `MediaType` ao import de `./types` no topo do `service.ts` (hoje importa `WhatsappConnection, Message`).

- [ ] **Step 4: Rodar a suíte do módulo + typecheck**

Run: `npx vitest run src/modules/whatsapp/ && npx tsc --noEmit`
Expected: PASS. O teste "still returns a success result shape" e os de webhook de texto continuam verdes (não passam `media`/`mediaDeps`).

- [ ] **Step 5: Commit**

```bash
git add src/modules/whatsapp/service.ts src/modules/whatsapp/service.test.ts
git commit -m "$(cat <<'EOF'
feat(whatsapp): handleInboundMessage ingere mídia (download -> bucket -> stored)

Grava a mensagem primeiro como 'expired' (pessimista); acima de 16 MB entra
'too_large' sem baixar; sucesso promove para 'stored' com o storage_path.
Falha de download/upload é engolida — a mensagem permanece 'expired'.
Preview da conversa usa rótulo do tipo quando não há legenda.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YZ9CY9uzfq9NdsGs2LhM3U
EOF
)"
```

---

### Task 7: Ligar storage + provider no route do webhook

**Files:**
- Modify: `src/app/api/whatsapp/webhook/[accountId]/route.ts`

**Interfaces:**
- Consumes: `createSupabaseWhatsappMediaStorage` (Task 5); `createUazapiProvider` (`provider.uazapi.ts`); `handleInboundMessage` com `mediaDeps` (Task 6).
- Produces: nenhuma nova; o route passa `mediaDeps` quando `parsed.media` existe.

- [ ] **Step 1: Editar o route**

```ts
import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createSupabaseWhatsappRepository } from "@/modules/whatsapp/repository.supabase";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import { createSupabaseWhatsappMediaStorage } from "@/modules/whatsapp/storage";
import { createUazapiProvider } from "@/modules/whatsapp/provider.uazapi";
import * as whatsapp from "@/modules/whatsapp/service";
import * as crm from "@/modules/crm/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const { accountId } = await params;
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get("secret");

  const supabase = createServiceRoleSupabaseClient();
  const whatsappRepo = createSupabaseWhatsappRepository(supabase);
  const crmRepo = createSupabaseCrmRepository(supabase);

  const connection = await whatsappRepo.getConnection(accountId);
  if (!whatsapp.isValidWebhookSecret(connection, providedSecret)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const rawBody = await request.json();
  const parsed = whatsapp.parseWebhookPayload(rawBody);
  if (!parsed) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const mediaDeps = parsed.media
    ? {
        storage: createSupabaseWhatsappMediaStorage(supabase),
        downloadMedia: (accId: string, providerMessageId: string) =>
          createUazapiProvider(whatsappRepo).downloadMedia(accId, providerMessageId),
      }
    : undefined;

  const message = await whatsapp.handleInboundMessage(
    whatsappRepo,
    {
      findContactByPhone: (accId, phone) => crm.findContactByPhone(crmRepo, accId, phone),
      createContact: (accId, input) => crm.createContact(crmRepo, accId, input),
    },
    accountId,
    parsed,
    mediaDeps,
  );

  return NextResponse.json({ ok: true, messageId: message.id });
}
```

- [ ] **Step 2: Typecheck + lint + suíte completa**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/whatsapp/webhook/[accountId]/route.ts"
git commit -m "$(cat <<'EOF'
feat(whatsapp): webhook injeta storage + downloadMedia na ingestão de mídia

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YZ9CY9uzfq9NdsGs2LhM3U
EOF
)"
```

---

### Task 8: Listagem com URL assinada + CSP

**Files:**
- Modify: `src/app/(app)/whatsapp/actions.ts` (`getConversationMessagesAction`)
- Modify: `src/middleware.ts` (CSP `media-src`)
- Modify: `src/components/whatsapp/whatsapp-client.tsx` (tipo do estado `messages`)

**Interfaces:**
- Consumes: `getConversationMessages` (service, devolve `Message[]`); `createSupabaseWhatsappMediaStorage(...).createSignedUrls` (Task 5).
- Produces:
  - `export type MessageView = Message & { mediaUrl: string | null }` (exportado de `actions.ts`).
  - `getConversationMessagesAction(conversationId): Promise<MessageView[]>` — antes `Promise<Message[]>`. Para cada mensagem com `mediaStatus === "stored"` e `mediaStoragePath`, `mediaUrl` é a URL assinada (TTL 3600); nas demais, `null`.

- [ ] **Step 1: `media-src` no CSP**

Em `src/middleware.ts`, no array `directives` de `buildCsp`, após a linha `img-src`:

```ts
    `img-src 'self' data: ${supabaseUrl}`,
    `media-src 'self' ${supabaseUrl}`,
    `connect-src 'self' ${supabaseUrl}${allowTurnstile ? ` ${TURNSTILE_ORIGIN}` : ""}`,
```

(As URLs assinadas do Storage têm origem `${supabaseUrl}`, já coberta em `img-src`; `media-src` cobre `<audio>`/`<video>`.)

- [ ] **Step 2: `getConversationMessagesAction` devolve `MessageView[]`**

Em `src/app/(app)/whatsapp/actions.ts`:

```ts
import { createSupabaseWhatsappMediaStorage } from "@/modules/whatsapp/storage";
import type { Message } from "@/modules/whatsapp/types";

const SIGNED_URL_TTL = 3600;
export type MessageView = Message & { mediaUrl: string | null };

export async function getConversationMessagesAction(
  conversationId: string,
): Promise<MessageView[]> {
  const { repo, accountId } = await getRepoAndAccount();
  const messages = await whatsapp.getConversationMessages(repo, accountId, conversationId);

  const storedPaths = messages
    .filter((m) => m.mediaStatus === "stored" && m.mediaStoragePath)
    .map((m) => m.mediaStoragePath as string);

  let urlByPath = new Map<string, string>();
  if (storedPaths.length > 0) {
    const supabase = await createServerSupabaseClient();
    const storage = createSupabaseWhatsappMediaStorage(supabase);
    const signed = await storage.createSignedUrls(storedPaths, SIGNED_URL_TTL);
    urlByPath = new Map(storedPaths.map((p, i) => [p, signed[i] ?? ""]));
  }

  return messages.map((m) => ({
    ...m,
    mediaUrl:
      m.mediaStatus === "stored" && m.mediaStoragePath
        ? urlByPath.get(m.mediaStoragePath) ?? null
        : null,
  }));
}
```

(`createServerSupabaseClient` já é importado no arquivo. O client do servidor herda a sessão do usuário — a RLS de `storage.objects` da migração `0016` autoriza pelo prefixo `account_id`.)

- [ ] **Step 3: Ajustar o tipo do estado no client**

Em `src/components/whatsapp/whatsapp-client.tsx`:
- No import de actions, adicionar `type MessageView`.
- Trocar `useState<Message[]>` do estado `messages` por `useState<MessageView[]>` e o import `import type { Conversation, Message }` — se `Message` não for mais usado diretamente, deixar só `Conversation` (a Task 9 usa `MessageView`). Se o lint acusar `Message` não usado, remover do import.

- [ ] **Step 4: Typecheck + lint + testes**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS. `whatsapp-client.tsx` pode acusar erro de tipo no `.map`/render de `message.body` só se a Task 9 ainda não rodou — se o render atual (`{message.body}`) continua válido para `MessageView`, não há erro. Não há teste novo (ação fina; a cobertura está nas Tasks 4 e 6).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/whatsapp/actions.ts" src/middleware.ts src/components/whatsapp/whatsapp-client.tsx
git commit -m "$(cat <<'EOF'
feat(whatsapp): listagem de mensagens devolve URL assinada da mídia + CSP media-src

getConversationMessagesAction retorna MessageView[] com mediaUrl (TTL 1h)
para mensagens 'stored'. media-src do CSP libera o domínio do Supabase
Storage para <audio>/<video>.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YZ9CY9uzfq9NdsGs2LhM3U
EOF
)"
```

---

### Task 9: Renderização de mídia na inbox

**Files:**
- Modify: `src/components/whatsapp/whatsapp-client.tsx` (bloco de render de mensagem, ~linhas 413-430)

**Interfaces:**
- Consumes: `MessageView` (Task 8) — `mediaType`, `mediaStatus`, `mediaMime`, `mediaFilename`, `mediaUrl`, `body`.
- Produces: nenhuma.

- [ ] **Step 1: Substituir o conteúdo da bolha de mensagem**

O bloco atual renderiza `{message.body}` dentro da `<div className={cn("max-w-[70%] ...")}>`. Trocar por um render condicional. Dentro do `.map((message) => ( ... ))`, o miolo da bolha passa a ser:

```tsx
<div
  className={cn(
    "max-w-[70%] space-y-1 rounded-lg px-3 py-2 text-sm shadow-sm",
    message.direction === "outbound" ? "bg-[#d9fdd3]" : "bg-white",
  )}
>
  {message.mediaType && <MediaBubble message={message} />}
  {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
</div>
```

- [ ] **Step 2: Adicionar o componente `MediaBubble`**

No mesmo arquivo, antes do componente que contém o `.map` (nível de módulo):

```tsx
function MediaBubble({ message }: { message: MessageView }) {
  const { mediaType, mediaStatus, mediaUrl, mediaFilename } = message;

  if (mediaStatus === "too_large") {
    return <p className="italic text-muted-foreground">[arquivo muito grande — não salvo]</p>;
  }
  if (mediaStatus === "expired" || !mediaUrl) {
    return <p className="italic text-muted-foreground">[mídia expirada]</p>;
  }
  if (mediaType === "image") {
    return (
      <a href={mediaUrl} target="_blank" rel="noreferrer">
        <img src={mediaUrl} alt={mediaFilename ?? "imagem"} className="max-h-64 rounded" />
      </a>
    );
  }
  if (mediaType === "audio") {
    return <audio controls src={mediaUrl} className="w-full" />;
  }
  if (mediaType === "video") {
    return <video controls src={mediaUrl} className="max-h-64 rounded" />;
  }
  return (
    <a
      href={mediaUrl}
      target="_blank"
      rel="noreferrer"
      download={mediaFilename ?? undefined}
      className="flex items-center gap-2 underline"
    >
      <FileText className="size-4 shrink-0" />
      <span className="truncate">{mediaFilename ?? "Documento"}</span>
    </a>
  );
}
```

Adicionar `FileText` ao import de `lucide-react` (hoje `import { Plus } from "lucide-react";` → `import { Plus, FileText } from "lucide-react";`).

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. Se o lint acusar `<img>` do Next (`@next/next/no-img-element`), seguir o padrão do resto do componente — checar se há `eslint-disable` para `<img>` em outros componentes (ex.: fotos de tratamento). Se o projeto usar `next/image`, trocar por `next/image`; se já houver `<img>` cru em uso, manter o padrão e adicionar o `// eslint-disable-next-line @next/next/no-img-element` na linha.

- [ ] **Step 4: Verificação manual**

Run: `npm run dev`, abrir `/whatsapp` (logado, WhatsApp conectado).
Conferir, mandando de outro celular:
1. Imagem com legenda → miniatura clicável (abre em nova aba) + legenda abaixo.
2. Áudio → player `<audio controls>` toca.
3. Vídeo → player `<video controls>` toca.
4. PDF → cartão com ícone + nome + baixa ao clicar.
5. Arquivo > 16 MB → "[arquivo muito grande — não salvo]".
6. Nenhuma tela de erro do Next; conversa novas de número desconhecido viram lead (como já acontece com texto).

- [ ] **Step 5: Commit**

```bash
git add src/components/whatsapp/whatsapp-client.tsx
git commit -m "$(cat <<'EOF'
feat(whatsapp): renderiza imagem, áudio, vídeo e documento na inbox

MediaBubble: miniatura clicável (imagem), <audio>/<video> controls, cartão
com download (documento). Marcadores para too_large e expired. Legenda
abaixo da mídia.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YZ9CY9uzfq9NdsGs2LhM3U
EOF
)"
```

---

## Self-Review

**1. Spec coverage** (seção "Item 2 — Mídia", parte de recebimento):
- Migração `0016` — colunas de mídia + constraint + índice parcial + `history_imported_at` → Task 1.
- Bucket privado `whatsapp-media`, path `{accountId}/{conversationId}/{messageId}.{ext}`, service-role/RLS, URL assinada TTL 1h → Tasks 1, 5, 6, 8.
- Teto 16 MB → `too_large` sem baixar → Task 6 (constante em `media.ts`, Task 4).
- Provider `downloadMedia` (confirmado `/message/download` → `fileURL` → GET) → Task 5.
- Webhook: `parseWebhookPayload` reconhece mídia (tipo, mime, filename, legenda), ainda descarta `fromMe`/`isGroup` → Task 4. Ingestão com fallback `expired` em falha → Task 6. Auto-criação de lead mantida (código de contato/conversa intacto) → Task 6.
- Renderização: imagem/áudio/vídeo/documento + marcadores `too_large`/`expired` + legenda abaixo → Task 9.
- CSP: domínio do Supabase Storage em `img-src` (já estava) e `media-src` (novo) → Task 8.
- Testes: fixtures reais de payload no parser; ingestão >16MB / ok / falha; `downloadMedia` com `fetch` fakeado → Tasks 4, 5, 6.
- **Fora deste plano (Plano 2b):** envio de mídia (compositor, `sendMedia`, `logMessageAction` com FormData), cron de retenção de 30 dias. O índice `whatsapp_messages_media_retention_idx` e os métodos `storage.remove`/`createSignedUrls` já ficam prontos aqui.

**2. Placeholder scan:** sem TBD/TODO; todo passo de código tem bloco concreto. Fixtures da Task 4 são recortes reais (arquivo `docs/ops/whatsapp-payloads-capturados-2026-09-03.md`), com Step 1 de confirmação ao vivo do envelope do webhook antes de fixá-las.

**3. Type consistency:**
- `Message` (Task 2): `mediaType`/`mediaStatus`/`mediaStoragePath`/`mediaMime`/`mediaFilename` — mesmos nomes em `repository.*` (Task 3), `service.ts` (Task 6), `actions.ts` (Task 8), client (Task 9).
- `insertMessage` input `.media` `{ type, status, mime, filename, storagePath }` (Task 3) — construído com esses campos em `handleInboundMessage` (Task 6).
- `parseWebhookPayload` `.media` `{ providerMessageId, type, mime, filename, fileLength }` (Task 4) — consumido com esses nomes em `handleInboundMessage` `input.media` (Task 6) e no route (Task 7).
- `WhatsappMediaStorage`: `upload(path, bytes, mime)`, `createSignedUrls(paths, ttlSeconds)`, `remove(paths)` (Task 5) — chamados com essas assinaturas em Task 6 (`upload`) e Task 8 (`createSignedUrls`).
- `downloadMedia(accountId, providerMessageId) => { bytes, mime }` (Task 5) — mesma assinatura no `mediaDeps.downloadMedia` (Task 6) e no route (Task 7).
- `MessageView = Message & { mediaUrl: string | null }` (Task 8) — usado no estado e no `MediaBubble` (Task 9).
- `MediaType`/`MediaStatus` (Task 2) — importados em `media.ts` (Task 4), `repository.ts`/`.supabase.ts` (Task 3), `service.ts` (Task 6).

## Execução

Depois deste plano, o **Plano 2b** (envio de mídia + cron de retenção) precisa da etapa de validação ao vivo do `/send/media` (`docs/ops/whatsapp-validacao-payloads-uazapi.md` seção 5). O **Plano 3** (importar histórico) depende da migração `0016` e do mapeamento de `parseWebhookPayload` já prontos aqui — a extração comum de mensagem deve ser refatorada para uma função pura reutilizável no Plano 3.
