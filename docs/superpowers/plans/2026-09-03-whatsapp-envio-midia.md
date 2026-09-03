# WhatsApp — envio de mídia + cron de retenção (Plano 2b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O usuário anexa um arquivo (imagem, áudio, vídeo, documento) no compositor da inbox e ele é enviado pela Uazapi, guardado no bucket privado e renderizado como mensagem `outbound`; um cron diário do Cloudflare apaga do bucket a mídia com mais de 30 dias, marcando a mensagem como `expired`.

**Architecture:** Espelha o caminho de recebimento do Plano 2a. `UazapiProvider` ganha `sendMedia` (endpoint `/send/media`, validado ao vivo em 2026-09-03). Uma função de serviço `sendMediaMessage` faz: checa conexão → checa 16 MB → envia base64 pela Uazapi → grava a mensagem `outbound` → sobe os bytes no bucket. A UI ganha um botão de anexo com preview e legenda. A retenção é uma função pura `runMediaRetention` chamada por uma rota interna `POST /api/whatsapp/media-retention` protegida por secret; o Cloudflare Cron Trigger dispara essa rota via um worker wrapper que re-exporta o worker gerado pelo OpenNext e acrescenta um handler `scheduled`.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions, route handlers), React 19, TypeScript, Vitest 4, Supabase (Postgres + Storage, `@supabase/supabase-js`), `@opennextjs/cloudflare` 1.20 + Wrangler 4, módulo `src/modules/whatsapp/`.

**Spec:** `docs/superpowers/specs/2026-09-03-whatsapp-midia-historico-design.md` — seção "Item 2 — Mídia", subseções "Envio (UI)" e "Renderização (UI)" (a renderização já foi feita no Plano 2a), e a seção "Cron de retenção de mídia (30 dias)". Payloads reais de `/send/media`: `docs/ops/whatsapp-payloads-capturados-2026-09-03.md` seção 5 (capturados ao vivo nesta rodada).

## Global Constraints

- **Sem grupos.** Não se aplica ao envio (o usuário escolhe a conversa 1:1); nada a fazer.
- **YAGNI.** Limites são constantes no código, não settings. Teto por arquivo: **16 MB** (`MAX_MEDIA_BYTES`, já existe em `src/modules/whatsapp/media.ts`). Janela de retenção: **30 dias** por `sent_at`.
- **Um arquivo por vez** no compositor.
- **Validação contra a API real já feita** para `/send/media` — os nomes de campo abaixo são os confirmados, não suposições. Não reabrir.
- Migração `0016` **já aplicada em produção** (colunas de mídia + bucket `whatsapp-media` privado + índice parcial `whatsapp_messages_media_retention_idx` + `storage.remove`/`createSignedUrls` na porta `WhatsappMediaStorage`). Nenhuma migração nova neste plano.
- Erro tratado como **dado** no caminho de envio: `sendMediaMessage` retorna `{ ok: false, error }` (tipo `LogMessageResult`, já existe), nunca lança para status de conexão / tamanho / falha do provider.
- Estilo dos testes: Vitest, `createInMemoryWhatsappRepository`, `createFakeWhatsappMediaStorage` (`src/modules/whatsapp/storage.fake.ts`), `fetch` fakeado via `vi.stubGlobal` ou `vi.spyOn(globalThis, "fetch")`. Seguir os arquivos `*.test.ts` vizinhos.

---

## `/send/media` — contrato confirmado ao vivo (2026-09-03)

**Request** — `POST https://<subdomain>.uazapi.com/send/media`, header `token`, body JSON:

```json
{ "number": "556696746676", "type": "image",
  "file": "<base64 cru, sem prefixo data:>", "text": "<legenda>",
  "docName": "<nome do arquivo — só para type=document>" }
```

- `number`: telefone com DDI+DDD, **sem** `@s.whatsapp.net`.
- `type`: `image` | `audio` | `video` | `document`.
- `file`: base64 cru (o app sempre manda base64 — o arquivo vem do compositor). URL pública também é aceita, mas não usamos.
- `text`: legenda. Ignorada para `audio`.
- `docName`: só para `document`.

**Response** — HTTP 200, objeto de mensagem completo. Campo que usamos: `messageid` (ex. `"3EB05D6F865EB4CBD195E2"`). Fallback `id` (`"<owner>:<messageid>"`).

**Erros** — status **não-2xx** + body `{"error":"<msg>"}`:

| caso | status |
|---|---|
| arquivo inacessível / inválido | `500` |
| token inválido | `401` |
| falta `number` | `400` |

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/modules/whatsapp/media.ts` | helpers puros de mídia | Modificar: `+ mediaTypeFromMime` |
| `src/modules/whatsapp/provider.uazapi.ts` | adaptador Uazapi | Modificar: `+ sendMedia` na interface e na impl |
| `src/modules/whatsapp/provider.uazapi.test.ts` | testes do adaptador | Modificar: `describe("UazapiProvider.sendMedia")` |
| `src/modules/whatsapp/service.ts` | regras de negócio | Modificar: `+ sendMediaMessage`, `+ runMediaRetention`, `+ type SendMediaFn` |
| `src/modules/whatsapp/service.test.ts` | testes de serviço | Modificar: testes das 2 funções novas |
| `src/modules/whatsapp/repository.ts` | porta do repositório | Modificar: `+ listStoredMediaOlderThan` |
| `src/modules/whatsapp/repository.memory.ts` | repo em memória (testes) | Modificar: impl de `listStoredMediaOlderThan` |
| `src/modules/whatsapp/repository.supabase.ts` | repo Supabase | Modificar: impl de `listStoredMediaOlderThan` |
| `src/modules/whatsapp/repository.memory.test.ts` | testes do repo memória | Modificar: teste de `listStoredMediaOlderThan` |
| `src/app/(app)/whatsapp/actions.ts` | server actions | Modificar: `+ sendWhatsappMediaAction` |
| `src/components/whatsapp/whatsapp-client.tsx` | UI da inbox | Modificar: anexo + preview + legenda no compositor |
| `src/middleware.ts` | CSP | Modificar: `blob:` em `img-src` |
| `src/app/api/whatsapp/media-retention/route.ts` | rota do cron de retenção | Criar |
| `worker.ts` (raiz) | entrypoint do Worker: `fetch` do OpenNext + `scheduled` | Criar |
| `wrangler.toml` | config do Worker | Modificar: `main`, `[triggers]`, `[vars]` |
| `.env.local.example` / `.env.production` | docs de env | Modificar: `MEDIA_RETENTION_SECRET`, `APP_URL` |

---

## Task 1: `UazapiProvider.sendMedia`

**Files:**
- Modify: `src/modules/whatsapp/provider.uazapi.ts`
- Test: `src/modules/whatsapp/provider.uazapi.test.ts`

**Interfaces:**
- Consumes: `getConfig`, `baseUrl` (já no arquivo); `MediaType` de `./types`.
- Produces:
  ```ts
  // na interface UazapiProvider
  sendMedia(
    accountId: string,
    toPhone: string,
    input: { type: MediaType; dataBase64: string; filename: string | null; caption: string },
  ): Promise<{ providerMessageId: string }>;
  ```

- [ ] **Step 1: Escrever o teste que falha (sucesso — imagem)**

Adicionar ao fim de `src/modules/whatsapp/provider.uazapi.test.ts` (o arquivo já tem `repoWithUazapi()` no escopo do módulo — reusar):

```ts
describe("UazapiProvider.sendMedia", () => {
  afterEach(() => vi.restoreAllMocks());

  it("faz POST em /send/media com base64 e devolve o messageid", async () => {
    const repo = await repoWithUazapi();
    const provider = createUazapiProvider(repo);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messageid: "MID-1", id: "556:MID-1" }), { status: 200 }),
    );

    const result = await provider.sendMedia("acc-1", "556696746676", {
      type: "image",
      dataBase64: "QUJD",
      filename: null,
      caption: "legenda",
    });

    expect(result.providerMessageId).toBe("MID-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://arkscrapper.uazapi.com/send/media");
    expect(JSON.parse(String(init?.body))).toEqual({
      number: "556696746676",
      type: "image",
      file: "QUJD",
      text: "legenda",
    });
  });

  it("inclui docName quando é documento com filename", async () => {
    const repo = await repoWithUazapi();
    const provider = createUazapiProvider(repo);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messageid: "MID-2" }), { status: 200 }),
    );

    await provider.sendMedia("acc-1", "556696746676", {
      type: "document",
      dataBase64: "QUJD",
      filename: "relatorio.pdf",
      caption: "",
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      type: "document",
      docName: "relatorio.pdf",
    });
  });

  it("lança com a mensagem de erro da Uazapi quando o status não é 2xx", async () => {
    const repo = await repoWithUazapi();
    const provider = createUazapiProvider(repo);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "failed to process file" }), { status: 500 }),
    );

    await expect(
      provider.sendMedia("acc-1", "556696746676", {
        type: "image",
        dataBase64: "QUJD",
        filename: null,
        caption: "",
      }),
    ).rejects.toThrow("failed to process file");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/whatsapp/provider.uazapi.test.ts -t "sendMedia"`
Expected: FAIL — `provider.sendMedia is not a function`.

- [ ] **Step 3: Implementar**

Em `src/modules/whatsapp/provider.uazapi.ts`:

1. Trocar o import de tipos para incluir `MediaType`:
```ts
import type { ConnectionStatus, WhatsappConnection, MediaType } from "./types";
```

2. Na interface `UazapiProvider`, depois de `downloadMedia`, acrescentar:
```ts
  sendMedia(
    accountId: string,
    toPhone: string,
    input: { type: MediaType; dataBase64: string; filename: string | null; caption: string },
  ): Promise<{ providerMessageId: string }>;
```

3. No objeto retornado por `createUazapiProvider`, depois do método `downloadMedia`, acrescentar:
```ts
    async sendMedia(accountId, toPhone, input) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      const body: Record<string, string> = {
        number: toPhone,
        type: input.type,
        file: input.dataBase64,
        text: input.caption,
      };
      if (input.type === "document" && input.filename) body.docName = input.filename;

      const response = await fetch(`${baseUrl(config.subdomain)}/send/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(
          detail && typeof detail.error === "string"
            ? `Falha ao enviar mídia pela Uazapi: ${detail.error}`
            : "Falha ao enviar mídia pela Uazapi",
        );
      }
      const data = await response.json();
      return { providerMessageId: data.messageid ?? data.id ?? "" };
    },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/whatsapp/provider.uazapi.test.ts`
Expected: PASS (todos, inclusive os antigos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/whatsapp/provider.uazapi.ts src/modules/whatsapp/provider.uazapi.test.ts
git commit -m "feat(whatsapp): UazapiProvider.sendMedia — POST /send/media com base64"
```

---

## Task 2: `mediaTypeFromMime` + `service.sendMediaMessage`

**Files:**
- Modify: `src/modules/whatsapp/media.ts`
- Modify: `src/modules/whatsapp/service.ts`
- Test: `src/modules/whatsapp/media.test.ts`, `src/modules/whatsapp/service.test.ts`

**Interfaces:**
- Consumes: `MAX_MEDIA_BYTES`, `storagePathFor`, `safeContentType` (já importados em `service.ts`); `WhatsappMediaStorage` (idem); `mediaPreviewLabel` (função local não-exportada de `service.ts`); `DISCONNECTED_ERROR` (const local); `LogMessageResult` (já exportado).
- Produces:
  ```ts
  // media.ts
  export function mediaTypeFromMime(mime: string): MediaType;

  // service.ts
  export type SendMediaFn = (
    accountId: string,
    toPhone: string,
    input: { type: MediaType; dataBase64: string; filename: string | null; caption: string },
  ) => Promise<{ providerMessageId: string }>;

  export async function sendMediaMessage(
    repo: WhatsappRepository,
    storage: WhatsappMediaStorage,
    sendMedia: SendMediaFn,
    accountId: string,
    conversationId: string,
    input: { type: MediaType; bytes: Uint8Array; mime: string; filename: string | null; caption: string },
  ): Promise<LogMessageResult>;
  ```

- [ ] **Step 1: Teste de `mediaTypeFromMime` (falha)**

Adicionar ao fim de `src/modules/whatsapp/media.test.ts`:

```ts
import { mediaTypeFromMime } from "./media";

describe("mediaTypeFromMime", () => {
  it("mapeia o prefixo do mime para o tipo de mídia", () => {
    expect(mediaTypeFromMime("image/jpeg")).toBe("image");
    expect(mediaTypeFromMime("audio/ogg; codecs=opus")).toBe("audio");
    expect(mediaTypeFromMime("video/mp4")).toBe("video");
    expect(mediaTypeFromMime("application/pdf")).toBe("document");
    expect(mediaTypeFromMime("")).toBe("document");
  });
});
```

(Se `media.test.ts` já importa de `./media` numa linha única, adicionar `mediaTypeFromMime` a essa lista em vez de um novo import.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/whatsapp/media.test.ts -t "mediaTypeFromMime"`
Expected: FAIL — `mediaTypeFromMime is not exported`.

- [ ] **Step 3: Implementar `mediaTypeFromMime`**

Ao fim de `src/modules/whatsapp/media.ts`:

```ts
export function mediaTypeFromMime(mime: string): MediaType {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("audio/")) return "audio";
  if (base.startsWith("video/")) return "video";
  return "document";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/whatsapp/media.test.ts`
Expected: PASS.

- [ ] **Step 5: Testes de `sendMediaMessage` (falha)**

Em `src/modules/whatsapp/service.test.ts`: adicionar `sendMediaMessage` à lista de imports de `./service`. Adicionar um novo `describe`:

```ts
describe("sendMediaMessage", () => {
  async function setup() {
    const repo = createInMemoryWhatsappRepository();
    const storage = createFakeWhatsappMediaStorage();
    await repo.upsertConnectionStatus("acc-1", "connected", new Date().toISOString());
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla",
      contactPhone: "5511988887777",
    });
    return { repo, storage, conversationId: conversation.id };
  }

  it("envia pela Uazapi, grava a mensagem outbound e sobe o arquivo no bucket", async () => {
    const { repo, storage, conversationId } = await setup();
    const sendMedia = vi.fn().mockResolvedValue({ providerMessageId: "MID-1" });
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await sendMediaMessage(repo, storage, sendMedia, "acc-1", conversationId, {
      type: "image",
      bytes,
      mime: "image/jpeg",
      filename: "foto.jpg",
      caption: "olha isso",
    });

    expect(result.ok).toBe(true);
    expect(sendMedia).toHaveBeenCalledWith("acc-1", "5511988887777", {
      type: "image",
      dataBase64: Buffer.from(bytes).toString("base64"),
      filename: "foto.jpg",
      caption: "olha isso",
    });
    const messages = await repo.listMessages("acc-1", conversationId);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      direction: "outbound",
      body: "olha isso",
      mediaType: "image",
      mediaStatus: "stored",
    });
    expect(messages[0].mediaStoragePath).toBeTruthy();
    expect(storage.objects.has(messages[0].mediaStoragePath as string)).toBe(true);
  });

  it("usa o rótulo do tipo como preview quando não há legenda", async () => {
    const { repo, storage, conversationId } = await setup();
    const sendMedia = vi.fn().mockResolvedValue({ providerMessageId: "MID-2" });
    await sendMediaMessage(repo, storage, sendMedia, "acc-1", conversationId, {
      type: "document",
      bytes: new Uint8Array([9]),
      mime: "application/pdf",
      filename: "x.pdf",
      caption: "",
    });
    const conv = await repo.getConversation("acc-1", conversationId);
    expect(conv?.lastMessagePreview).toContain("Documento");
  });

  it("retorna { ok: false } e não chama o provider quando desconectado", async () => {
    const { repo, storage, conversationId } = await setup();
    await repo.upsertConnectionStatus("acc-1", "disconnected", null);
    const sendMedia = vi.fn();

    const result = await sendMediaMessage(repo, storage, sendMedia, "acc-1", conversationId, {
      type: "image",
      bytes: new Uint8Array([1]),
      mime: "image/jpeg",
      filename: null,
      caption: "",
    });

    expect(result).toEqual({ ok: false, error: expect.stringContaining("desconectado") });
    expect(sendMedia).not.toHaveBeenCalled();
  });

  it("retorna { ok: false } quando o arquivo passa de 16 MB, sem chamar o provider", async () => {
    const { repo, storage, conversationId } = await setup();
    const sendMedia = vi.fn();
    const big = new Uint8Array(MAX_MEDIA_BYTES + 1);

    const result = await sendMediaMessage(repo, storage, sendMedia, "acc-1", conversationId, {
      type: "video",
      bytes: big,
      mime: "video/mp4",
      filename: null,
      caption: "",
    });

    expect(result.ok).toBe(false);
    expect(sendMedia).not.toHaveBeenCalled();
  });

  it("retorna { ok: false } e não grava mensagem quando o provider falha", async () => {
    const { repo, storage, conversationId } = await setup();
    const sendMedia = vi.fn().mockRejectedValue(new Error("failed to process file"));

    const result = await sendMediaMessage(repo, storage, sendMedia, "acc-1", conversationId, {
      type: "image",
      bytes: new Uint8Array([1]),
      mime: "image/jpeg",
      filename: null,
      caption: "",
    });

    expect(result).toEqual({ ok: false, error: expect.stringContaining("failed to process file") });
    expect(await repo.listMessages("acc-1", conversationId)).toHaveLength(0);
  });

  it("mantém a mensagem como 'expired' quando o envio dá certo mas o upload local falha", async () => {
    const { repo, conversationId } = await setup();
    const storage = createFakeWhatsappMediaStorage();
    storage.upload = vi.fn().mockRejectedValue(new Error("storage down"));
    const sendMedia = vi.fn().mockResolvedValue({ providerMessageId: "MID-3" });

    const result = await sendMediaMessage(repo, storage, sendMedia, "acc-1", conversationId, {
      type: "image",
      bytes: new Uint8Array([1]),
      mime: "image/jpeg",
      filename: null,
      caption: "",
    });

    expect(result.ok).toBe(true);
    const messages = await repo.listMessages("acc-1", conversationId);
    expect(messages[0].mediaStatus).toBe("expired");
    expect(messages[0].mediaStoragePath).toBeNull();
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run src/modules/whatsapp/service.test.ts -t "sendMediaMessage"`
Expected: FAIL — `sendMediaMessage is not exported`.

- [ ] **Step 7: Implementar `sendMediaMessage`**

Em `src/modules/whatsapp/service.ts`, depois da função `logMessage` (antes de `handleInboundMessage`):

```ts
export type SendMediaFn = (
  accountId: string,
  toPhone: string,
  input: { type: MediaType; dataBase64: string; filename: string | null; caption: string },
) => Promise<{ providerMessageId: string }>;

export async function sendMediaMessage(
  repo: WhatsappRepository,
  storage: WhatsappMediaStorage,
  sendMedia: SendMediaFn,
  accountId: string,
  conversationId: string,
  input: { type: MediaType; bytes: Uint8Array; mime: string; filename: string | null; caption: string },
): Promise<LogMessageResult> {
  const conversation = await repo.getConversation(accountId, conversationId);
  if (!conversation) throw new Error("Conversa não encontrada");

  const connection = await repo.getConnection(accountId);
  if (connection && connection.status !== "connected") {
    return { ok: false, error: DISCONNECTED_ERROR };
  }
  if (input.bytes.byteLength > MAX_MEDIA_BYTES) {
    return { ok: false, error: "Arquivo acima do limite de 16 MB." };
  }

  try {
    await sendMedia(accountId, conversation.contactPhone, {
      type: input.type,
      dataBase64: Buffer.from(input.bytes).toString("base64"),
      filename: input.filename,
      caption: input.caption,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao enviar mídia" };
  }

  const message = await repo.insertMessage(accountId, conversationId, {
    direction: "outbound",
    body: input.caption,
    media: {
      type: input.type,
      status: "stored",
      mime: input.mime,
      filename: input.filename,
      storagePath: null,
    },
  });

  let finalMessage = message;
  try {
    const path = storagePathFor(accountId, conversationId, message.id, input.mime);
    await storage.upload(path, input.bytes, safeContentType(input.type, input.mime));
    await repo.updateMessageMedia(accountId, message.id, { status: "stored", storagePath: path });
    finalMessage = { ...message, mediaStoragePath: path };
  } catch (err) {
    console.error("[whatsapp] envio: mídia enviada mas upload local falhou, marcada 'expired'", err);
    await repo.updateMessageMedia(accountId, message.id, { status: "expired", storagePath: null });
    finalMessage = { ...message, mediaStatus: "expired", mediaStoragePath: null };
  }

  const preview = input.caption || mediaPreviewLabel(input.type);
  await repo.touchConversation(accountId, conversationId, preview, message.sentAt);
  return { ok: true, message: finalMessage };
}
```

Nota: `Buffer` já é usado no projeto (`src/middleware.ts`) sob `nodejs_compat`; não precisa import.

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run src/modules/whatsapp/service.test.ts src/modules/whatsapp/media.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/whatsapp/media.ts src/modules/whatsapp/media.test.ts src/modules/whatsapp/service.ts src/modules/whatsapp/service.test.ts
git commit -m "feat(whatsapp): service.sendMediaMessage — envia, grava outbound e sobe no bucket"
```

---

## Task 3: `sendWhatsappMediaAction` + CSP `blob:`

**Files:**
- Modify: `src/app/(app)/whatsapp/actions.ts`
- Modify: `src/middleware.ts:22`

**Interfaces:**
- Consumes: `getRepoAndAccount`, `createServerSupabaseClient`, `createSupabaseWhatsappMediaStorage`, `createUazapiProvider`, `whatsapp.*` (já importados no arquivo); `MAX_MEDIA_BYTES` e `mediaTypeFromMime` de `@/modules/whatsapp/media` (import novo).
- Produces:
  ```ts
  export async function sendWhatsappMediaAction(
    conversationId: string,
    formData: FormData,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  ```

- [ ] **Step 1: Adicionar `blob:` ao `img-src` do CSP**

Em `src/middleware.ts`, linha 22, trocar:
```ts
    `img-src 'self' data: ${supabaseUrl}`,
```
por:
```ts
    `img-src 'self' data: blob: ${supabaseUrl}`,
```
Motivo: o preview de imagem no compositor usa `URL.createObjectURL(file)` (um `blob:`). O restante do CSP já cobre a mídia servida (URLs assinadas do Supabase entraram em `img-src`/`media-src` no Plano 2a).

- [ ] **Step 2: Implementar a action**

Em `src/app/(app)/whatsapp/actions.ts`:

1. Acrescentar o import:
```ts
import { MAX_MEDIA_BYTES, mediaTypeFromMime } from "@/modules/whatsapp/media";
```

2. Ao fim do arquivo:
```ts
export async function sendWhatsappMediaAction(
  conversationId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um arquivo." };
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return { ok: false, error: "Arquivo acima do limite de 16 MB." };
  }
  const rawCaption = formData.get("caption");
  const caption = typeof rawCaption === "string" ? rawCaption : "";

  const { repo, accountId } = await getRepoAndAccount();
  const supabase = await createServerSupabaseClient();
  const storage = createSupabaseWhatsappMediaStorage(supabase);
  const uazapi = createUazapiProvider(repo);
  const mime = file.type || "application/octet-stream";

  const result = await whatsapp.sendMediaMessage(
    repo,
    storage,
    (accId, toPhone, input) => uazapi.sendMedia(accId, toPhone, input),
    accountId,
    conversationId,
    {
      type: mediaTypeFromMime(mime),
      bytes: new Uint8Array(await file.arrayBuffer()),
      mime,
      filename: file.name || null,
      caption,
    },
  );

  if (result.ok) {
    revalidatePath("/whatsapp");
    return { ok: true };
  }
  return { ok: false, error: result.error };
}
```

- [ ] **Step 3: Verificar tipo e lint**

Run: `npx tsc --noEmit && npx eslint src/app/(app)/whatsapp/actions.ts src/middleware.ts`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/whatsapp/actions.ts" src/middleware.ts
git commit -m "feat(whatsapp): sendWhatsappMediaAction (FormData) + blob: no img-src do CSP"
```

---

## Task 4: Compositor — anexo, preview e legenda

**Files:**
- Modify: `src/components/whatsapp/whatsapp-client.tsx`

**Interfaces:**
- Consumes: `sendWhatsappMediaAction` de `@/app/(app)/whatsapp/actions`; `getConversationMessagesAction` (já importado); `Paperclip`, `X` de `lucide-react`.

- [ ] **Step 1: Importar ícones e a action**

No import de `lucide-react` (linha 4), acrescentar `Paperclip` e `X`:
```ts
import { Plus, FileText, Image as ImageIcon, Mic, Video, Paperclip, X } from "lucide-react";
```
No import de `@/app/(app)/whatsapp/actions`, acrescentar `sendWhatsappMediaAction`.

- [ ] **Step 2: Estado do anexo**

Dentro de `WhatsappClient`, junto dos outros `useState` (perto de `const [draft, setDraft]`):
```ts
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentCaption, setAttachmentCaption] = useState("");
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
```
E um efeito para o preview de imagem (logo abaixo dos `useState`, antes dos `useEffect` existentes):
```ts
  useEffect(() => {
    if (!attachment || !attachment.type.startsWith("image/")) {
      setAttachmentPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachment);
    setAttachmentPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);
```

- [ ] **Step 3: Handlers**

Perto de `handleSend`:
```ts
  function handlePickAttachment(file: File | null) {
    setSendError(null);
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      setSendError("Arquivo acima do limite de 16 MB.");
      return;
    }
    setAttachment(file);
    setAttachmentCaption("");
  }

  function clearAttachment() {
    setAttachment(null);
    setAttachmentCaption("");
  }

  async function handleSendAttachment() {
    if (!selectedConversationId || !attachment || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const formData = new FormData();
      formData.set("file", attachment);
      formData.set("caption", attachmentCaption);
      const result = await sendWhatsappMediaAction(selectedConversationId, formData);
      if (!result.ok) {
        setSendError(result.error);
        return;
      }
      clearAttachment();
      const updated = await getConversationMessagesAction(selectedConversationId);
      setMessages(updated);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Erro ao enviar arquivo");
    } finally {
      setSending(false);
    }
  }
```

- [ ] **Step 4: UI do compositor**

Trocar o bloco atual do compositor (a `<div className="flex items-center gap-2 border-t p-3">` com o `Input` e o botão "Enviar", linhas ~503-516) por:

```tsx
              {attachment ? (
                <div className="space-y-2 border-t p-3">
                  <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-2">
                    {attachmentPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- object URL local de preview, não é asset estático
                      <img
                        src={attachmentPreviewUrl}
                        alt={attachment.name}
                        className="size-16 rounded object-cover"
                      />
                    ) : (
                      <FileText className="size-10 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{attachment.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(attachment.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={clearAttachment}>
                      <X className="size-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={attachmentCaption}
                      onChange={(e) => setAttachmentCaption(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSendAttachment();
                      }}
                      placeholder="Legenda (opcional)"
                      disabled={sending || !isConnected}
                    />
                    <Button
                      onClick={handleSendAttachment}
                      disabled={sending || !isConnected}
                    >
                      Enviar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 border-t p-3">
                  <label
                    className={cn(
                      "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-muted",
                      (sending || !isConnected) && "pointer-events-none opacity-50",
                    )}
                    title="Anexar arquivo"
                  >
                    <Paperclip className="size-4" />
                    <input
                      type="file"
                      className="hidden"
                      disabled={sending || !isConnected}
                      onChange={(e) => {
                        handlePickAttachment(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSend();
                    }}
                    placeholder="Digite uma mensagem"
                    disabled={sending || !isConnected}
                  />
                  <Button onClick={handleSend} disabled={sending || !draft.trim() || !isConnected}>
                    Enviar
                  </Button>
                </div>
              )}
```

- [ ] **Step 5: Verificar tipo, lint e build**

Run: `npx tsc --noEmit && npx eslint src/components/whatsapp/whatsapp-client.tsx && npm run build`
Expected: sem erros.

- [ ] **Step 6: Smoke-test manual**

Com o WhatsApp conectado (instância real), na inbox:
1. Clicar no clipe → escolher uma imagem → conferir miniatura + campo de legenda.
2. Escrever legenda → Enviar → a imagem aparece como bolha `outbound` com a legenda embaixo, e chega no WhatsApp do número de destino.
3. Repetir com um PDF (aparece cartão com nome + "Baixar"), um áudio e um vídeo.
4. Tentar um arquivo > 16 MB → erro claro, nada é enviado.
5. Desconectar → o clipe e o campo ficam desabilitados com a faixa "WhatsApp desconectado".

- [ ] **Step 7: Commit**

```bash
git add src/components/whatsapp/whatsapp-client.tsx
git commit -m "feat(whatsapp): compositor com anexo, preview e legenda (um arquivo por vez)"
```

---

## Task 5: `listStoredMediaOlderThan` + `service.runMediaRetention`

**Files:**
- Modify: `src/modules/whatsapp/repository.ts`
- Modify: `src/modules/whatsapp/repository.memory.ts`
- Modify: `src/modules/whatsapp/repository.supabase.ts`
- Modify: `src/modules/whatsapp/service.ts`
- Test: `src/modules/whatsapp/repository.memory.test.ts`, `src/modules/whatsapp/service.test.ts`

**Interfaces:**
- Consumes: `WhatsappMediaStorage.remove` (já existe); `updateMessageMedia` (já na porta).
- Produces:
  ```ts
  // repository.ts (porta)
  listStoredMediaOlderThan(
    cutoffIso: string,
  ): Promise<{ id: string; accountId: string; mediaStoragePath: string }[]>;

  // service.ts
  export async function runMediaRetention(
    repo: WhatsappRepository,
    storage: WhatsappMediaStorage,
    nowIso: string,
    retentionDays?: number, // default 30
  ): Promise<{ expired: number; errors: number }>;
  ```

- [ ] **Step 1: Teste do repo (falha)**

Adicionar em `src/modules/whatsapp/repository.memory.test.ts`:

```ts
describe("listStoredMediaOlderThan", () => {
  it("devolve só mídia 'stored' com caminho e sent_at anterior ao corte", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conv = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "C",
      contactPhone: "551199",
    });
    const stored = await repo.insertMessage("acc-1", conv.id, {
      direction: "inbound",
      body: "",
      media: { type: "image", status: "stored", mime: "image/jpeg", filename: null, storagePath: "acc-1/x/y.jpg" },
    });
    await repo.insertMessage("acc-1", conv.id, {
      direction: "inbound",
      body: "",
      media: { type: "image", status: "too_large", mime: "image/jpeg", filename: null, storagePath: null },
    });
    await repo.insertMessage("acc-1", conv.id, { direction: "inbound", body: "texto" });

    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();

    const hits = await repo.listStoredMediaOlderThan(future);
    expect(hits).toEqual([
      { id: stored.id, accountId: "acc-1", mediaStoragePath: "acc-1/x/y.jpg" },
    ]);
    expect(await repo.listStoredMediaOlderThan(past)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/whatsapp/repository.memory.test.ts -t "listStoredMediaOlderThan"`
Expected: FAIL — método não existe.

- [ ] **Step 3: Porta + impl memória + impl supabase**

`src/modules/whatsapp/repository.ts` — na interface, depois de `updateMessageMedia`:
```ts
  listStoredMediaOlderThan(
    cutoffIso: string,
  ): Promise<{ id: string; accountId: string; mediaStoragePath: string }[]>;
```

`src/modules/whatsapp/repository.memory.ts` — depois de `updateMessageMedia`:
```ts
    async listStoredMediaOlderThan(cutoffIso) {
      return [...messages.values()]
        .filter(
          (m) =>
            m.mediaStatus === "stored" &&
            m.mediaStoragePath !== null &&
            m.sentAt < cutoffIso,
        )
        .map((m) => ({
          id: m.id,
          accountId: m.accountId,
          mediaStoragePath: m.mediaStoragePath as string,
        }));
    },
```

`src/modules/whatsapp/repository.supabase.ts` — depois de `updateMessageMedia`:
```ts
    async listStoredMediaOlderThan(cutoffIso) {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("id, account_id, media_storage_path")
        .eq("media_status", "stored")
        .lt("sent_at", cutoffIso)
        .not("media_storage_path", "is", null);
      if (error) throwDbError(error);
      return data.map((r) => ({
        id: r.id,
        accountId: r.account_id,
        mediaStoragePath: r.media_storage_path as string,
      }));
    },
```
(Usa o índice parcial `whatsapp_messages_media_retention_idx` da migração 0016.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/whatsapp/repository.memory.test.ts`
Expected: PASS.

- [ ] **Step 5: Testes de `runMediaRetention` (falha)**

Em `src/modules/whatsapp/service.test.ts`: adicionar `runMediaRetention` aos imports de `./service`. Novo `describe`:

```ts
describe("runMediaRetention", () => {
  async function seedStored(
    repo: ReturnType<typeof createInMemoryWhatsappRepository>,
    storage: ReturnType<typeof createFakeWhatsappMediaStorage>,
    convId: string,
    path: string,
  ) {
    const msg = await repo.insertMessage("acc-1", convId, {
      direction: "inbound",
      body: "",
      media: { type: "image", status: "stored", mime: "image/jpeg", filename: null, storagePath: path },
    });
    await storage.upload(path, new Uint8Array([1]), "image/jpeg");
    return msg;
  }

  it("apaga o objeto e marca a mensagem como 'expired' para mídia vencida", async () => {
    const repo = createInMemoryWhatsappRepository();
    const storage = createFakeWhatsappMediaStorage();
    const conv = await repo.insertConversation("acc-1", {
      contactId: null, contactName: "C", contactPhone: "551199",
    });
    const a = await seedStored(repo, storage, conv.id, "acc-1/c/a.jpg");
    const b = await seedStored(repo, storage, conv.id, "acc-1/c/b.jpg");

    // nowIso 40 dias no futuro => corte (now - 30d) fica depois das mensagens
    const nowIso = new Date(Date.now() + 40 * 86_400_000).toISOString();
    const result = await runMediaRetention(repo, storage, nowIso);

    expect(result).toEqual({ expired: 2, errors: 0 });
    expect(storage.objects.size).toBe(0);
    const msgs = await repo.listMessages("acc-1", conv.id);
    for (const id of [a.id, b.id]) {
      const m = msgs.find((x) => x.id === id)!;
      expect(m.mediaStatus).toBe("expired");
      expect(m.mediaStoragePath).toBeNull();
    }
  });

  it("não toca em mídia 'stored' recente", async () => {
    const repo = createInMemoryWhatsappRepository();
    const storage = createFakeWhatsappMediaStorage();
    const conv = await repo.insertConversation("acc-1", {
      contactId: null, contactName: "C", contactPhone: "551199",
    });
    await seedStored(repo, storage, conv.id, "acc-1/c/a.jpg");

    const result = await runMediaRetention(repo, storage, new Date().toISOString());
    expect(result).toEqual({ expired: 0, errors: 0 });
    expect(storage.objects.size).toBe(1);
  });

  it("conta erro e mantém 'stored' quando falha ao remover um objeto", async () => {
    const repo = createInMemoryWhatsappRepository();
    const storage = createFakeWhatsappMediaStorage();
    const conv = await repo.insertConversation("acc-1", {
      contactId: null, contactName: "C", contactPhone: "551199",
    });
    const a = await seedStored(repo, storage, conv.id, "acc-1/c/a.jpg");
    storage.remove = vi.fn().mockRejectedValue(new Error("storage down"));

    const nowIso = new Date(Date.now() + 40 * 86_400_000).toISOString();
    const result = await runMediaRetention(repo, storage, nowIso);

    expect(result).toEqual({ expired: 0, errors: 1 });
    const m = (await repo.listMessages("acc-1", conv.id)).find((x) => x.id === a.id)!;
    expect(m.mediaStatus).toBe("stored");
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run src/modules/whatsapp/service.test.ts -t "runMediaRetention"`
Expected: FAIL — não exportado.

- [ ] **Step 7: Implementar `runMediaRetention`**

Em `src/modules/whatsapp/service.ts`, depois de `sendMediaMessage`:

```ts
export async function runMediaRetention(
  repo: WhatsappRepository,
  storage: WhatsappMediaStorage,
  nowIso: string,
  retentionDays = 30,
): Promise<{ expired: number; errors: number }> {
  const cutoffIso = new Date(
    Date.parse(nowIso) - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const rows = await repo.listStoredMediaOlderThan(cutoffIso);

  let expired = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      await storage.remove([row.mediaStoragePath]);
    } catch (err) {
      console.error("[whatsapp] retenção: falha ao remover objeto, mantém 'stored'", row.id, err);
      errors += 1;
      continue;
    }
    await repo.updateMessageMedia(row.accountId, row.id, { status: "expired", storagePath: null });
    expired += 1;
  }
  return { expired, errors };
}
```

- [ ] **Step 8: Rodar tudo do módulo**

Run: `npx vitest run src/modules/whatsapp/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/whatsapp/repository.ts src/modules/whatsapp/repository.memory.ts src/modules/whatsapp/repository.supabase.ts src/modules/whatsapp/repository.memory.test.ts src/modules/whatsapp/service.ts src/modules/whatsapp/service.test.ts
git commit -m "feat(whatsapp): runMediaRetention + listStoredMediaOlderThan (retenção de 30 dias)"
```

---

## Task 6: Rota `POST /api/whatsapp/media-retention`

**Files:**
- Create: `src/app/api/whatsapp/media-retention/route.ts`

**Interfaces:**
- Consumes: `createServiceRoleSupabaseClient`, `createSupabaseWhatsappRepository`, `createSupabaseWhatsappMediaStorage`, `whatsapp.runMediaRetention`; `process.env.MEDIA_RETENTION_SECRET`.

- [ ] **Step 1: Criar a rota**

`src/app/api/whatsapp/media-retention/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createSupabaseWhatsappRepository } from "@/modules/whatsapp/repository.supabase";
import { createSupabaseWhatsappMediaStorage } from "@/modules/whatsapp/storage";
import * as whatsapp from "@/modules/whatsapp/service";

export async function POST(request: Request) {
  const provided = request.headers.get("x-cron-secret");
  const expected = process.env.MEDIA_RETENTION_SECRET;
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = createServiceRoleSupabaseClient();
  const repo = createSupabaseWhatsappRepository(supabase);
  const storage = createSupabaseWhatsappMediaStorage(supabase);

  const result = await whatsapp.runMediaRetention(repo, storage, new Date().toISOString());
  console.log("[whatsapp] retenção de mídia:", result);
  return NextResponse.json({ ok: true, ...result });
}
```

Nota: `process.env.MEDIA_RETENTION_SECRET` é populado pelo shim de env do `@opennextjs/cloudflare` a partir das variáveis/secrets do Worker (mesmo mecanismo de `SUPABASE_SERVICE_ROLE_KEY`). Sem a env var, a rota responde 401 (fecha por padrão).

- [ ] **Step 2: Verificar tipo/lint/build**

Run: `npx tsc --noEmit && npx eslint src/app/api/whatsapp/media-retention/route.ts && npm run build`
Expected: sem erros; a rota aparece no output do build.

- [ ] **Step 3: Smoke-test local**

```bash
# .env.local com MEDIA_RETENTION_SECRET=teste-local
npm run dev
curl -s -X POST http://localhost:3000/api/whatsapp/media-retention -H "x-cron-secret: teste-local"
# => {"ok":true,"expired":0,"errors":0}   (0/0 se não há mídia vencida)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/whatsapp/media-retention
# => 401
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/media-retention/route.ts
git commit -m "feat(whatsapp): rota /api/whatsapp/media-retention protegida por secret"
```

---

## Task 7: Cloudflare Cron Trigger — worker wrapper + wrangler

**Files:**
- Create: `worker.ts` (raiz do repo)
- Modify: `wrangler.toml`
- Modify: `.env.local.example`, `.env.production`

**Interfaces:**
- Consumes: o worker gerado por `opennextjs-cloudflare build` em `.open-next/worker.js` (default export com `fetch`; `.open-next/` é gitignored e gerado no deploy).

**Contexto:** o deploy é automático via integração Git do Cloudflare (memória `arkdoctor_deploy_readiness`), que roda o build do OpenNext e `wrangler deploy` lendo este `wrangler.toml`. O worker do OpenNext só exporta `fetch` — não `scheduled`. O wrapper adiciona `scheduled` e delega `fetch`.

- [ ] **Step 1: Gerar o worker do OpenNext e conferir os exports**

Run: `npm run pages:build`
Depois: inspecionar `.open-next/worker.js` — confirmar `export default { async fetch(...) }` e anotar quaisquer `export { ... }` nomeados (ex. classes de Durable Object). Hoje o `wrangler.toml` não faz binding de nenhum DO, então os nomeados não são exigidos, mas o wrapper vai repassá-los com `export *` por segurança.

- [ ] **Step 2: Criar `worker.ts`**

`worker.ts` na raiz:

```ts
// Entrypoint do Cloudflare Worker.
// - `fetch`: delega para o worker gerado pelo OpenNext (Next.js).
// - `scheduled`: Cron Trigger diário que dispara a retenção de mídia do WhatsApp.
//   O worker do OpenNext não exporta `scheduled`; por isso este wrapper.
import openNextWorker from "./.open-next/worker.js";

export * from "./.open-next/worker.js";

interface CronEnv {
  APP_URL: string;
  MEDIA_RETENTION_SECRET: string;
}

export default {
  fetch: (request: Request, env: unknown, ctx: unknown) =>
    (openNextWorker as { fetch: (r: Request, e: unknown, c: unknown) => Promise<Response> }).fetch(
      request,
      env,
      ctx,
    ),

  async scheduled(_event: unknown, env: CronEnv, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    ctx.waitUntil(
      fetch(`${env.APP_URL}/api/whatsapp/media-retention`, {
        method: "POST",
        headers: { "x-cron-secret": env.MEDIA_RETENTION_SECRET },
      })
        .then(async (r) => console.log("[cron] media-retention:", r.status, await r.text()))
        .catch((err) => console.error("[cron] media-retention falhou:", err)),
    );
  },
};
```

- [ ] **Step 3: Ajustar `wrangler.toml`**

Trocar a linha:
```toml
main = ".open-next/worker.js"
```
por:
```toml
main = "worker.ts"
```
Acrescentar ao fim do arquivo:
```toml
[vars]
APP_URL = "https://arkdoctor.edersonfantin98.workers.dev"

# Cron diário 04:20 UTC (~01:20 BRT) — apaga do bucket whatsapp-media a mídia
# com sent_at > 30 dias e marca a mensagem como 'expired'. Ver
# src/app/api/whatsapp/media-retention/route.ts.
[triggers]
crons = ["20 4 * * *"]
```
Confirmar o hostname real em `APP_URL` (o do Worker em produção). O secret `MEDIA_RETENTION_SECRET` **não** entra aqui — é secret do projeto Cloudflare (Step 5).

- [ ] **Step 4: Documentar as env vars**

`.env.local.example` — acrescentar:
```
# Secret que protege a rota interna de retenção de mídia do WhatsApp
# (/api/whatsapp/media-retention), chamada pelo Cron Trigger. Sem ela a rota
# responde 401. Gerar: openssl rand -base64 32
MEDIA_RETENTION_SECRET=
```
`.env.production` — acrescentar um comentário (o valor é secret, não vai no arquivo):
```
# APP_URL e o cron de retenção ficam em wrangler.toml ([vars] / [triggers]).
# MEDIA_RETENTION_SECRET é secret do projeto Cloudflare (wrangler secret put).
```

- [ ] **Step 5: Deploy manual de verificação + registrar o secret**

Uma vez (fora do fluxo automático), para criar o secret e validar o wrapper:
```bash
npx wrangler secret put MEDIA_RETENTION_SECRET   # colar o mesmo valor do painel
npm run deploy
```
Depois, no dashboard do Worker: aba **Triggers** deve mostrar o cron `20 4 * * *`. Forçar uma execução ("Trigger" / aguardar) e conferir nos **Logs** a linha `[cron] media-retention: 200 {"ok":true,...}`.

- [ ] **Step 6: Verificar que o `fetch` normal não regrediu**

Abrir o site em produção após o deploy: navegação, login e a inbox do WhatsApp funcionando (o wrapper não pode ter quebrado o `fetch` do OpenNext).

- [ ] **Step 7: Commit**

```bash
git add worker.ts wrangler.toml .env.local.example .env.production
git commit -m "feat(whatsapp): Cron Trigger diário de retenção de mídia (worker wrapper + scheduled)"
```

---

## Self-Review

**1. Spec coverage** (seção "Item 2 — Mídia" → "Envio (UI)", "Renderização (UI)"; seção "Cron de retenção"):

| Requisito do spec | Task |
|---|---|
| Botão de anexo (clipe) ao lado do texto | Task 4 |
| Preview: miniatura p/ imagem, ícone + nome p/ os demais | Task 4 |
| Campo opcional de legenda + botão "Enviar" | Task 4 |
| Um arquivo por vez | Task 4 (estado `attachment: File \| null`) |
| Validação de 16 MB no cliente antes de subir, mensagem clara | Task 4 Step 3 |
| `logMessageAction` ganha caminho de mídia (FormData) → sobe no bucket, chama `sendMedia`, grava outbound `stored` | Tasks 2 + 3 (`sendWhatsappMediaAction` + `sendMediaMessage`) |
| `provider.sendMedia(accountId, toPhone, input {type, dataBase64\|url, filename?, caption?})` | Task 1 (usamos `dataBase64`; `url` não é necessário) |
| Endpoint `/send/media` confirmado contra API real | Feito nesta rodada — doc ops seção 5 |
| Renderização de imagem/áudio/vídeo/documento + marcadores `too_large`/`expired` + legenda | **já entregue no Plano 2a** (`MediaBubble` em `whatsapp-client.tsx`) — nada a fazer |
| URL assinada na listagem | **já entregue no Plano 2a** (`getConversationMessagesAction`) |
| CSP: domínio do Supabase Storage em `img-src`/`media-src` | já feito no 2a; Task 3 só acrescenta `blob:` p/ o preview local |
| Cron diário → `POST /api/whatsapp/media-retention` protegido por secret | Tasks 6 + 7 |
| Config do cron no arquivo de config do Cloudflare Workers | Task 7 (`wrangler.toml [triggers]`) |
| Seleciona `stored` + `sent_at < now() - 30d`, usa o índice parcial | Task 5 (`listStoredMediaOlderThan`) |
| Para cada: apaga objeto, depois seta `storage_path = null`, `status = 'expired'` | Task 5 (`runMediaRetention`) |
| Erro ao apagar um objeto não trava os demais; loga e segue | Task 5 (try/catch por linha, conta `errors`, mantém `stored`) |
| Idempotente | Task 5 (após `expired` a linha sai do filtro; 2ª execução não acha nada) |
| Testes de seleção e de transição p/ `expired` | Task 5 Steps 1 e 5 |

**2. Placeholder scan:** sem TBD/TODO. Todo passo de código tem bloco concreto. O único ponto a confirmar em runtime é o hostname de `APP_URL` (Task 7 Step 3) e os exports nomeados de `.open-next/worker.js` (Task 7 Step 1) — ambos são verificações, não lacunas de design.

**3. Type consistency:**
- `sendMedia(accountId, toPhone, { type, dataBase64, filename, caption })` → idêntico na interface `UazapiProvider` (Task 1), no `type SendMediaFn` (Task 2) e na chamada da action (Task 3).
- `sendMediaMessage(repo, storage, sendMedia, accountId, conversationId, { type, bytes, mime, filename, caption })` → mesma assinatura no teste (Task 2 Step 5), na impl (Task 2 Step 7) e na action (Task 3).
- `runMediaRetention(repo, storage, nowIso, retentionDays?)` → `{ expired, errors }` em teste (Task 5 Step 5) e impl (Task 5 Step 7).
- `listStoredMediaOlderThan(cutoffIso) → { id, accountId, mediaStoragePath }[]` → porta, memória, supabase e teste batem.
- `updateMessageMedia(accountId, messageId, { status, storagePath })` → assinatura pré-existente, usada sem alteração.
- Retorno da action: `{ ok: true } | { ok: false; error: string }` — o cliente (Task 4) só lê `result.ok` e `result.error`.

---

## Execução

Depois deste plano, o **Plano 3** (importar histórico) fica como último item da sequência do spec. Ele reaproveita `parseWebhookPayload`/extração de mensagem (a refatorar para função pura) e a migração `0016`, ambos já prontos.
