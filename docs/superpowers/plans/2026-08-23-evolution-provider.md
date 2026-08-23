# Evolution API Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third `WhatsappProvider` — `EvolutionProvider` — that talks to a self-hosted Evolution API instance (open-source, Baileys-based, no per-message or subscription cost), selectable per account alongside the existing `fake` and `uazapi` providers, with no changes to the rest of the app.

**Architecture:** `src/modules/whatsapp/provider.evolution.ts` implements `WhatsappProvider` (plus one Evolution-specific extra method, `getQrCode`, used only by the UI) by calling the Evolution API REST endpoints via `fetch`. Credentials (`baseUrl`, `instanceName`, `apiKey`, a per-account webhook secret) live in `whatsapp_connections.config` (jsonb) — the same column the Uazapi provider already uses, no schema change needed. `parseWebhookPayload` (`src/modules/whatsapp/service.ts`) gains a third recognized shape (Evolution's `messages.upsert` envelope) alongside the two it already handles; the webhook route itself doesn't change, since it already delegates entirely to that function. The UI gains a second "Configurar Evolution API" dialog next to the existing "Configurar Uazapi" one, and the existing QR-code polling logic is generalized to cover both real providers instead of only `"uazapi"`.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript, `fetch` (no HTTP client library — matches the rest of the codebase), Vitest with `vi.stubGlobal("fetch", ...)` for provider tests (no real network calls in automated tests).

**Spec:** `docs/superpowers/specs/2026-08-23-evolution-provider-design.md`

## Global Constraints

- No real Evolution API server is available during this implementation — provider tests must mock `fetch` (`vi.stubGlobal`), never call a real API. Manual end-to-end verification (real QR scan, real webhook delivery) is deferred to whenever the user has an Evolution API instance actually running (e.g. on Oracle Cloud Free Tier) and is explicitly out of scope for this plan's automated tasks.
- Two details of the Evolution API were **not confirmed** against a live instance during research (flagged in the spec): the exact body shape of `POST /webhook/set/{instanceName}`, and the exact endpoint for disconnecting a session (`DELETE /instance/logout/{instanceName}`). Implement them as specified below, but do not treat their exact shape as load-bearing for any test assertion beyond "the right URL and method were called" — don't over-assert on request bodies for these two calls the way later tasks do for well-documented endpoints (`create`, `connect`, `connectionState`, `sendText`).
- Reuse `normalizeWhatsappJid` from `./provider.uazapi` — do not write a second JID-stripping function.
- `whatsapp_connections.config` and `.qr_code` already exist (added when the Uazapi provider was built) — no migration in this plan.
- Run `npm run test`, `npx tsc --noEmit`, and `npm run lint` after every task.
- `NEXT_PUBLIC_APP_URL` must be set in `.env.local` for the webhook auto-registration in Task 1 to produce a working URL — same pre-existing constraint as the Uazapi provider, not new to this plan.

---

### Task 1: `EvolutionProvider`

**Files:**
- Create: `src/modules/whatsapp/provider.evolution.ts`
- Test: `src/modules/whatsapp/provider.evolution.test.ts`
- Modify: `src/modules/whatsapp/provider.ts` (register in the factory)

**Interfaces:**
- Produces: `EvolutionProvider extends WhatsappProvider { getQrCode(accountId: string): Promise<string | null> }`, `createEvolutionProvider(repo: WhatsappRepository): EvolutionProvider`.
- Changes: `getWhatsappProvider(providerName, repo)` gains an `"evolution"` branch.
- Consumes: `WhatsappRepository.getConnection`/`upsertConnectionStatus`/`updateConnectionQrCode`/`updateConnectionConfig` (all already exist — no repository changes in this plan).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/modules/whatsapp/provider.evolution.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { createEvolutionProvider } from "./provider.evolution";

describe("EvolutionProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedConfig(repo: ReturnType<typeof createInMemoryWhatsappRepository>) {
    await repo.updateConnectionConfig("acc-1", "evolution", {
      baseUrl: "https://evolution.minhaclinica.com",
      instanceName: "arkdoctor",
      apiKey: "global-key-123",
      webhookSecret: "sekret",
    });
  }

  it("throws when connect is called without a saved config", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createEvolutionProvider(repo);
    await expect(provider.connect("acc-1")).rejects.toThrow();
  });

  it("creates the instance and saves its QR code when it doesn't exist yet", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/webhook/set/arkdoctor")) return Promise.reject(new Error("network error"));
      if (url.endsWith("/instance/connectionState/arkdoctor")) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      if (url.endsWith("/instance/create")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ qrcode: { base64: "data:image/png;base64,new-instance" } }),
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const provider = createEvolutionProvider(repo);
    await provider.connect("acc-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://evolution.minhaclinica.com/instance/create",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "global-key-123" }),
        body: JSON.stringify({
          instanceName: "arkdoctor",
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      }),
    );
    expect(await provider.getQrCode("acc-1")).toBe("data:image/png;base64,new-instance");
    const connection = await repo.getConnection("acc-1");
    expect(connection?.status).toBe("connecting");
  });

  it("fetches a fresh QR code when the instance already exists", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/webhook/set/arkdoctor")) return Promise.resolve({ ok: true, json: async () => ({}) });
      if (url.endsWith("/instance/connectionState/arkdoctor")) {
        return Promise.resolve({ ok: true, json: async () => ({ instance: { state: "close" } }) });
      }
      if (url.endsWith("/instance/connect/arkdoctor")) {
        return Promise.resolve({ ok: true, json: async () => ({ qrcode: "data:image/png;base64,existing" }) });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const provider = createEvolutionProvider(repo);
    await provider.connect("acc-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://evolution.minhaclinica.com/instance/connect/arkdoctor",
      expect.objectContaining({ method: "GET", headers: expect.objectContaining({ apikey: "global-key-123" }) }),
    );
    expect(await provider.getQrCode("acc-1")).toBe("data:image/png;base64,existing");
  });

  it("still connects when webhook registration fails at the transport level", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/webhook/set/arkdoctor")) return Promise.reject(new Error("getaddrinfo ENOTFOUND"));
      if (url.endsWith("/instance/connectionState/arkdoctor")) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      if (url.endsWith("/instance/create")) {
        return Promise.resolve({ ok: true, json: async () => ({ qrcode: { base64: "data:image/png;base64,ok" } }) });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const provider = createEvolutionProvider(repo);
    await provider.connect("acc-1");

    const connection = await repo.getConnection("acc-1");
    expect(connection?.status).toBe("connecting");
  });

  it("maps connection states: open to connected, close to disconnected, connecting to connecting", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    const provider = createEvolutionProvider(repo);

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ instance: { state: "open" } }) });
    expect(await provider.getConnectionStatus("acc-1")).toBe("connected");

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ instance: { state: "close" } }) });
    expect(await provider.getConnectionStatus("acc-1")).toBe("disconnected");

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ instance: { state: "connecting" } }) });
    expect(await provider.getConnectionStatus("acc-1")).toBe("connecting");
  });

  it("clears the QR code once the status comes back connected", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    await repo.updateConnectionQrCode("acc-1", "data:image/png;base64,stale");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ instance: { state: "open" } }) });

    const provider = createEvolutionProvider(repo);
    await provider.getConnectionStatus("acc-1");

    expect(await provider.getQrCode("acc-1")).toBeNull();
  });

  it("sends a text message and returns the providerMessageId from the response", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: "msg-123", remoteJid: "5511999999999@s.whatsapp.net" } }),
    });

    const provider = createEvolutionProvider(repo);
    const result = await provider.sendMessage("acc-1", "5511999999999", "Olá!");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://evolution.minhaclinica.com/message/sendText/arkdoctor",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "global-key-123" }),
        body: JSON.stringify({ number: "5511999999999", text: "Olá!" }),
      }),
    );
    expect(result.providerMessageId).toBe("msg-123");
  });

  it("clears the connection status and QR code on disconnect", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    await repo.updateConnectionQrCode("acc-1", "data:image/png;base64,abc");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    const provider = createEvolutionProvider(repo);
    await provider.disconnect("acc-1");

    const connection = await repo.getConnection("acc-1");
    expect(connection?.status).toBe("disconnected");
    expect(connection?.qrCode).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/whatsapp/provider.evolution.test.ts`
Expected: FAIL — `Cannot find module './provider.evolution'`

- [ ] **Step 3: Implement the Evolution API provider**

```typescript
// src/modules/whatsapp/provider.evolution.ts
import type { WhatsappRepository } from "./repository";
import type { WhatsappProvider } from "./provider";
import type { ConnectionStatus, WhatsappConnection } from "./types";

export interface EvolutionProvider extends WhatsappProvider {
  getQrCode(accountId: string): Promise<string | null>;
}

interface EvolutionConfig {
  baseUrl: string;
  instanceName: string;
  apiKey: string;
  webhookSecret: string;
}

function getConfig(connection: WhatsappConnection | null): EvolutionConfig {
  const config = connection?.config;
  if (!config?.baseUrl || !config?.instanceName || !config?.apiKey) {
    throw new Error("Configure a URL do servidor, o nome da instância e a API key da Evolution API antes de conectar");
  }
  return {
    baseUrl: config.baseUrl,
    instanceName: config.instanceName,
    apiKey: config.apiKey,
    webhookSecret: config.webhookSecret ?? "",
  };
}

function mapState(state: string): ConnectionStatus {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  return "disconnected";
}

export function createEvolutionProvider(repo: WhatsappRepository): EvolutionProvider {
  return {
    async connect(accountId) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);
      const headers = { "Content-Type": "application/json", apikey: config.apiKey };

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      await fetch(`${config.baseUrl}/webhook/set/${config.instanceName}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          webhook: {
            url: `${appUrl}/api/whatsapp/webhook/${accountId}?secret=${config.webhookSecret}`,
            events: ["MESSAGES_UPSERT"],
            webhook_by_events: false,
          },
        }),
      }).catch(() => {});

      const stateResponse = await fetch(`${config.baseUrl}/instance/connectionState/${config.instanceName}`, {
        method: "GET",
        headers,
      });

      let qrCode: string | null = null;
      if (!stateResponse.ok && stateResponse.status === 404) {
        const createResponse = await fetch(`${config.baseUrl}/instance/create`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            instanceName: config.instanceName,
            integration: "WHATSAPP-BAILEYS",
            qrcode: true,
          }),
        });
        if (!createResponse.ok) throw new Error("Falha ao criar a instância na Evolution API");
        const data = await createResponse.json();
        qrCode = data.qrcode?.base64 ?? null;
      } else {
        const connectResponse = await fetch(`${config.baseUrl}/instance/connect/${config.instanceName}`, {
          method: "GET",
          headers,
        });
        if (!connectResponse.ok) throw new Error("Falha ao conectar com a Evolution API");
        const data = await connectResponse.json();
        qrCode = data.qrcode ?? null;
      }

      await repo.upsertConnectionStatus(accountId, "connecting", null);
      await repo.updateConnectionQrCode(accountId, qrCode);
    },

    async disconnect(accountId) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      await fetch(`${config.baseUrl}/instance/logout/${config.instanceName}`, {
        method: "DELETE",
        headers: { apikey: config.apiKey },
      });

      await repo.upsertConnectionStatus(accountId, "disconnected", null);
      await repo.updateConnectionQrCode(accountId, null);
    },

    async getConnectionStatus(accountId) {
      const connection = await repo.getConnection(accountId);
      if (!connection?.config) return "disconnected";
      const config = getConfig(connection);

      const response = await fetch(`${config.baseUrl}/instance/connectionState/${config.instanceName}`, {
        method: "GET",
        headers: { apikey: config.apiKey },
      });
      if (!response.ok) return "disconnected";
      const data = await response.json();
      const mapped = mapState(data.instance?.state ?? "close");

      await repo.upsertConnectionStatus(
        accountId,
        mapped,
        mapped === "connected" ? new Date().toISOString() : null,
      );
      if (mapped === "connected") await repo.updateConnectionQrCode(accountId, null);
      return mapped;
    },

    async sendMessage(accountId, toPhone, body) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      const response = await fetch(`${config.baseUrl}/message/sendText/${config.instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.apiKey },
        body: JSON.stringify({ number: toPhone, text: body }),
      });
      if (!response.ok) throw new Error("Falha ao enviar mensagem pela Evolution API");
      const data = await response.json();
      return { providerMessageId: data.key?.id ?? "" };
    },

    async getQrCode(accountId) {
      const connection = await repo.getConnection(accountId);
      return connection?.qrCode ?? null;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/whatsapp/provider.evolution.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Register in the factory**

In `src/modules/whatsapp/provider.ts`, add the import and branch:

```typescript
import { createEvolutionProvider } from "./provider.evolution";
```

```typescript
export function getWhatsappProvider(
  providerName: string,
  repo: WhatsappRepository,
): WhatsappProvider {
  if (providerName === "fake") return createFakeWhatsappProvider(repo);
  if (providerName === "uazapi") return createUazapiProvider(repo);
  if (providerName === "evolution") return createEvolutionProvider(repo);
  throw new Error(`Provedor de WhatsApp desconhecido: ${providerName}`);
}
```

- [ ] **Step 6: Run full suite and typecheck**

```bash
npm run test
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/whatsapp/provider.evolution.ts src/modules/whatsapp/provider.evolution.test.ts src/modules/whatsapp/provider.ts
git commit -m "feat(whatsapp): add EvolutionProvider (self-hosted, no-cost WhatsApp connection)"
```

---

### Task 2: Webhook — parse the Evolution `messages.upsert` payload

**Files:**
- Modify: `src/modules/whatsapp/service.ts`
- Test: `src/modules/whatsapp/service.test.ts`

**Interfaces:**
- Changes: `parseWebhookPayload(body: unknown)` gains a third recognized shape — Evolution's `{ event: "messages.upsert", data: { key: { remoteJid, fromMe }, message: { conversation }, pushName } }` — alongside the two it already handles (Uazapi's `{ event: "messages", data: {...} }` and the flat `{ fromPhone, body }` shape). No changes to `isValidWebhookSecret` or the webhook route — both are already provider-agnostic.
- Consumes: `normalizeWhatsappJid` from `./provider.uazapi` (already imported in this file).

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/whatsapp/service.test.ts`, inside the existing `describe("parseWebhookPayload", ...)` block (add these as new `it` cases alongside the existing ones):

```typescript
  it("parses the Evolution API messages.upsert envelope", () => {
    const result = parseWebhookPayload({
      event: "messages.upsert",
      instance: "arkdoctor",
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false, id: "3EB0XXXXX" },
        message: { conversation: "Oi, gostaria de agendar" },
        pushName: "Carla Souza",
      },
    });
    expect(result).toEqual({
      fromPhone: "5511999999999",
      fromName: "Carla Souza",
      body: "Oi, gostaria de agendar",
    });
  });

  it("ignores messages.upsert events sent by the API itself", () => {
    const result = parseWebhookPayload({
      event: "messages.upsert",
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: true },
        message: { conversation: "oi" },
      },
    });
    expect(result).toBeNull();
  });

  it("ignores messages.upsert events from groups", () => {
    const result = parseWebhookPayload({
      event: "messages.upsert",
      data: {
        key: { remoteJid: "123456789@g.us", fromMe: false },
        message: { conversation: "oi" },
      },
    });
    expect(result).toBeNull();
  });

  it("returns null for a messages.upsert event with no text content", () => {
    const result = parseWebhookPayload({
      event: "messages.upsert",
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
        message: { imageMessage: {} },
      },
    });
    expect(result).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/whatsapp/service.test.ts`
Expected: FAIL — the `messages.upsert` cases return `null` today because `parseWebhookPayload` doesn't recognize that shape yet (falls through to the final `return null`).

- [ ] **Step 3: Extend `parseWebhookPayload`**

In `src/modules/whatsapp/service.ts`, add a new branch to `parseWebhookPayload`, before the final flat-shape check:

```typescript
  if (payload.event === "messages.upsert") {
    const data = payload.data;
    if (typeof data !== "object" || data === null) return null;
    const eventData = data as Record<string, unknown>;
    const key = eventData.key;
    if (typeof key !== "object" || key === null) return null;
    const keyData = key as Record<string, unknown>;
    if (keyData.fromMe === true) return null;
    if (typeof keyData.remoteJid !== "string" || keyData.remoteJid.endsWith("@g.us")) return null;

    const message = eventData.message;
    const body =
      typeof message === "object" && message !== null
        ? (message as Record<string, unknown>).conversation
        : undefined;
    if (typeof body !== "string") return null;

    return {
      fromPhone: normalizeWhatsappJid(keyData.remoteJid),
      fromName: typeof eventData.pushName === "string" ? eventData.pushName : undefined,
      body,
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/whatsapp/service.test.ts`
Expected: PASS

- [ ] **Step 5: Run full suite and typecheck**

```bash
npm run test
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/whatsapp/service.ts src/modules/whatsapp/service.test.ts
git commit -m "feat(whatsapp): parse the Evolution API messages.upsert webhook payload"
```

---

### Task 3: Actions — save Evolution API config, fetch its QR code

**Files:**
- Modify: `src/app/(app)/whatsapp/actions.ts`

**Interfaces:**
- Produces: `saveEvolutionConfigAction(baseUrl: string, instanceName: string, apiKey: string): Promise<void>`, `getEvolutionQrCodeAction(): Promise<string | null>`.
- Consumes: `createEvolutionProvider` (Task 1). No changes to the provider-resolving actions (`getConnectionStatusAction`, `connectWhatsappAction`, `disconnectWhatsappAction`, `logMessageAction`) — they already resolve `getWhatsappProvider(connection?.provider ?? "fake", repo)` generically, so an `"evolution"` connection is handled with zero changes there.

- [ ] **Step 1: Add the import**

In `src/app/(app)/whatsapp/actions.ts`, add alongside the existing `provider.uazapi` import:

```typescript
import { createEvolutionProvider } from "@/modules/whatsapp/provider.evolution";
```

- [ ] **Step 2: Add the two new actions**

Add at the end of the file, after `getUazapiQrCodeAction`:

```typescript
export async function saveEvolutionConfigAction(baseUrl: string, instanceName: string, apiKey: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const existing = await repo.getConnection(accountId);
  const webhookSecret = existing?.config?.webhookSecret ?? crypto.randomUUID();
  await repo.updateConnectionConfig(accountId, "evolution", {
    baseUrl,
    instanceName,
    apiKey,
    webhookSecret,
  });
  revalidatePath("/whatsapp");
}

export async function getEvolutionQrCodeAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const provider = createEvolutionProvider(repo);
  return provider.getQrCode(accountId);
}
```

- [ ] **Step 3: Run full suite, typecheck, lint**

```bash
npm run test
npx tsc --noEmit
npm run lint
```

Expected: all green — this task only adds two new actions and doesn't touch any tested code path directly (same as `saveUazapiConfigAction`/`getUazapiQrCodeAction`, which also have no dedicated test file — thin wiring over already-tested `createEvolutionProvider`/`repo.updateConnectionConfig`).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/whatsapp/actions.ts"
git commit -m "feat(whatsapp): add Evolution API config and QR code actions"
```

---

### Task 4: UI — Evolution API config dialog, generalized QR code flow

**Files:**
- Modify: `src/components/whatsapp/whatsapp-client.tsx`

**Interfaces:** None new — consumes `saveEvolutionConfigAction`, `getEvolutionQrCodeAction` from Task 3.

- [ ] **Step 1: Import the new actions**

In `src/components/whatsapp/whatsapp-client.tsx`, update the actions import:

```typescript
import {
  getConversationMessagesAction,
  logMessageAction,
  startConversationAction,
  getConnectionStatusAction,
  connectWhatsappAction,
  disconnectWhatsappAction,
  resetUnreadCountAction,
  saveUazapiConfigAction,
  getUazapiQrCodeAction,
  saveEvolutionConfigAction,
  getEvolutionQrCodeAction,
  getWhatsappConnectionAction,
} from "@/app/(app)/whatsapp/actions";
```

- [ ] **Step 2: Add the Evolution API config dialog component**

Add right after the existing `UazapiConfigDialog` function:

```tsx
function EvolutionConfigDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await saveEvolutionConfigAction(baseUrl.trim(), instanceName.trim(), apiKey.trim());
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Configurar Evolution API</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar Evolution API</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-2">
          <Input
            placeholder="URL do servidor (ex: https://evolution.seudominio.com)"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <Input
            placeholder="Nome da instância"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
          />
          <Input
            placeholder="API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button
            onClick={handleSave}
            disabled={saving || !baseUrl.trim() || !instanceName.trim() || !apiKey.trim()}
          >
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Generalize the QR-code fetch to cover both real providers**

Replace the `refreshConnection` callback:

```typescript
  const refreshConnection = useCallback(async () => {
    const [conn, status] = await Promise.all([
      getWhatsappConnectionAction(),
      getConnectionStatusAction(),
    ]);
    setConnection(conn);
    if (status === "connecting" && conn?.provider === "uazapi") {
      setQrCode(await getUazapiQrCodeAction());
    } else if (status === "connecting" && conn?.provider === "evolution") {
      setQrCode(await getEvolutionQrCodeAction());
    } else {
      setQrCode(null);
    }
  }, []);
```

Replace the polling-effect condition (the `useEffect` right below it):

```typescript
  useEffect(() => {
    const isRealProvider = connection?.provider === "uazapi" || connection?.provider === "evolution";
    if (!isRealProvider || connection?.status !== "connecting") return;
    const interval = setInterval(refreshConnection, 3000);
    return () => clearInterval(interval);
  }, [connection?.provider, connection?.status, refreshConnection]);
```

- [ ] **Step 4: Add the second config dialog to the header row**

In the header `<div className="flex items-center gap-2">` block (the one already containing the badge, the connect/disconnect button, and `<UazapiConfigDialog .../>`), add the new dialog right after it:

```tsx
          <UazapiConfigDialog onSaved={refreshConnection} />
          <EvolutionConfigDialog onSaved={refreshConnection} />
```

- [ ] **Step 5: Run full suite, typecheck, lint**

```bash
npm run test
npx tsc --noEmit
npm run lint
```

Expected: all green, same pre-existing lint errors as before this plan (no new ones).

- [ ] **Step 6: Visual verification**

```bash
agent-browser open http://localhost:3000/whatsapp
agent-browser wait --load networkidle
agent-browser wait 500
agent-browser screenshot task4-evolution-config.png
```

Read the screenshot: should show "Desconectado", a disabled "Conectar" button, and two config buttons — "Configurar Uazapi" and "Configurar Evolution API". Click "Configurar Evolution API" (`agent-browser find role button click --name "Configurar Evolution API"`), fill in a fake URL/instance name/API key, save, and confirm the "Conectar" button becomes enabled and the badge/button now reflect the `evolution` connection. Actually connecting requires a real Evolution API server — without one, clicking "Conectar" fails when the provider calls the (nonexistent) API; that's expected until a real server is running, and doesn't block this step (the goal here is confirming the config dialog and button-enablement logic work, not a live connection).

- [ ] **Step 7: Commit**

```bash
git add src/components/whatsapp/whatsapp-client.tsx
git commit -m "feat(whatsapp): add Evolution API config dialog and generalize QR code polling"
```
