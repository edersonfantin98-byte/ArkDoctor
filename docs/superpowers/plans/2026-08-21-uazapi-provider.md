# Uazapi Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real `UazapiProvider` implementing the existing `WhatsappProvider` interface — connect via real QR code, send messages, receive them via a signed webhook — selectable per account alongside the existing fake provider, with no changes to the rest of the app.

**Architecture:** `src/modules/whatsapp/provider.uazapi.ts` implements `WhatsappProvider` (plus one Uazapi-specific extra method, `getQrCode`, used only by the UI) by calling the real Uazapi REST API via `fetch`. Credentials (subdomain, instance token, a per-account webhook secret) live in `whatsapp_connections.config` (jsonb). The inbound webhook route gains a shared-secret check since it's now reachable by a real external service. All business logic (auto-create contact/lead, mark-as-read, etc.) is untouched — this plan only adds a second provider implementation and the UI to configure/connect it.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript, `fetch` (no HTTP client library — matches the rest of the codebase, which has none), Vitest with `vi.stubGlobal("fetch", ...)` for provider tests (no real network calls in automated tests).

**Spec:** `docs/superpowers/specs/2026-08-21-uazapi-provider-design.md`

## Global Constraints

- **Hard prerequisite:** `docs/superpowers/plans/2026-08-21-whatsapp-provider-adapter.md` must be fully implemented first — this plan builds directly on `WhatsappProvider`, `WhatsappRepository`, `handleInboundMessage`, the webhook route, and the connection-status actions/UI it produces. Do not start this plan until that one is merged and green.
- No real Uazapi credentials are available during this implementation — provider tests must mock `fetch` (`vi.stubGlobal`), never call the real API. Manual end-to-end verification against the real Uazapi API is optional and deferred to whenever the account's subdomain/token are in hand (noted per-task where relevant).
- Run `npm run test`, `npx tsc --noEmit`, and `npm run lint` after every task.
- Uazapi's `hibernated` instance state maps to our `"disconnected"` — do not add a 4th value to `ConnectionStatus`.
- `NEXT_PUBLIC_APP_URL` (the public URL this app is reachable at) must be set in `.env.local` for the webhook auto-registration in Task 3 to produce a working URL — during local development without a public tunnel, webhook registration will silently point at an unreachable URL; that's expected and doesn't block anything else in this plan (Uazapi will just be unable to deliver inbound messages until a real public URL is configured).

---

### Task 1: Database migration — `qr_code` column

**Files:**
- Create: `supabase/migrations/0008_whatsapp_qr_code.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated via CLI)

**Interfaces:** None — pure schema change, consumed by Task 2.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0008_whatsapp_qr_code.sql
alter table whatsapp_connections add column qr_code text;
```

- [ ] **Step 2: Apply and regenerate types**

```bash
npx supabase db push
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_whatsapp_qr_code.sql src/lib/supabase/database.types.ts
git commit -m "feat(whatsapp): add qr_code column to whatsapp_connections"
```

---

### Task 2: Connection config and QR code storage

**Files:**
- Modify: `src/modules/whatsapp/types.ts`
- Modify: `src/modules/whatsapp/repository.ts`
- Modify: `src/modules/whatsapp/repository.memory.ts`
- Modify: `src/modules/whatsapp/repository.supabase.ts`
- Test: `src/modules/whatsapp/repository.memory.test.ts`

**Interfaces:**
- Changes: `WhatsappConnection` gains `qrCode: string | null` and `config: Record<string, string> | null`.
- Produces: `WhatsappRepository.updateConnectionConfig(accountId: string, provider: string, config: Record<string, string>): Promise<WhatsappConnection>`, `WhatsappRepository.updateConnectionQrCode(accountId: string, qrCode: string | null): Promise<WhatsappConnection>`.
- Changes: `upsertConnectionStatus` (from the prior plan) now preserves `qrCode`/`config` instead of dropping them.

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/whatsapp/repository.memory.test.ts`:

```typescript
  it("stores and returns provider config, and preserves it across status updates", async () => {
    const repo = createInMemoryWhatsappRepository();

    const withConfig = await repo.updateConnectionConfig("acc-1", "uazapi", {
      subdomain: "minhaclinica",
      token: "abc123",
      webhookSecret: "sekret",
    });
    expect(withConfig.provider).toBe("uazapi");
    expect(withConfig.config).toEqual({
      subdomain: "minhaclinica",
      token: "abc123",
      webhookSecret: "sekret",
    });

    await repo.upsertConnectionStatus("acc-1", "connecting", null);
    const afterStatusChange = await repo.getConnection("acc-1");
    expect(afterStatusChange?.config).toEqual({
      subdomain: "minhaclinica",
      token: "abc123",
      webhookSecret: "sekret",
    });
  });

  it("stores and clears the QR code", async () => {
    const repo = createInMemoryWhatsappRepository();

    const withQr = await repo.updateConnectionQrCode("acc-1", "data:image/png;base64,abc");
    expect(withQr.qrCode).toBe("data:image/png;base64,abc");

    const cleared = await repo.updateConnectionQrCode("acc-1", null);
    expect(cleared.qrCode).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/whatsapp/repository.memory.test.ts`
Expected: FAIL — `updateConnectionConfig`/`updateConnectionQrCode` don't exist yet.

- [ ] **Step 3: Extend the type**

In `src/modules/whatsapp/types.ts`, replace the `WhatsappConnection` interface:

```typescript
export interface WhatsappConnection {
  accountId: string;
  provider: string;
  status: ConnectionStatus;
  connectedAt: string | null;
  qrCode: string | null;
  config: Record<string, string> | null;
}
```

- [ ] **Step 4: Add to the repository interface**

In `src/modules/whatsapp/repository.ts`, add after `upsertConnectionStatus`:

```typescript
  updateConnectionConfig(
    accountId: string,
    provider: string,
    config: Record<string, string>,
  ): Promise<WhatsappConnection>;
  updateConnectionQrCode(accountId: string, qrCode: string | null): Promise<WhatsappConnection>;
```

- [ ] **Step 5: Implement in the memory repository**

In `src/modules/whatsapp/repository.memory.ts`, replace the existing `upsertConnectionStatus` method to preserve the new fields:

```typescript
    async upsertConnectionStatus(accountId, status, connectedAt) {
      const existing = connections.get(accountId);
      const connection: WhatsappConnection = {
        accountId,
        provider: existing?.provider ?? "fake",
        status,
        connectedAt,
        qrCode: existing?.qrCode ?? null,
        config: existing?.config ?? null,
      };
      connections.set(accountId, connection);
      return connection;
    },
```

Add after it:

```typescript
    async updateConnectionConfig(accountId, provider, config) {
      const existing = connections.get(accountId);
      const connection: WhatsappConnection = {
        accountId,
        provider,
        status: existing?.status ?? "disconnected",
        connectedAt: existing?.connectedAt ?? null,
        qrCode: existing?.qrCode ?? null,
        config,
      };
      connections.set(accountId, connection);
      return connection;
    },

    async updateConnectionQrCode(accountId, qrCode) {
      const existing = connections.get(accountId);
      const connection: WhatsappConnection = {
        accountId,
        provider: existing?.provider ?? "fake",
        status: existing?.status ?? "disconnected",
        connectedAt: existing?.connectedAt ?? null,
        qrCode,
        config: existing?.config ?? null,
      };
      connections.set(accountId, connection);
      return connection;
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/modules/whatsapp/repository.memory.test.ts`
Expected: PASS

- [ ] **Step 7: Implement in the Supabase repository**

In `src/modules/whatsapp/repository.supabase.ts`, replace the `toConnection` mapper:

```typescript
function toConnection(
  row: Database["public"]["Tables"]["whatsapp_connections"]["Row"],
): WhatsappConnection {
  return {
    accountId: row.account_id,
    provider: row.provider,
    status: row.status as ConnectionStatus,
    connectedAt: row.connected_at,
    qrCode: row.qr_code,
    config: row.config as Record<string, string> | null,
  };
}
```

Add after `upsertConnectionStatus`:

```typescript
    async updateConnectionConfig(accountId, provider, config) {
      const { data, error } = await supabase
        .from("whatsapp_connections")
        .upsert({ account_id: accountId, provider, config }, { onConflict: "account_id" })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toConnection(data);
    },

    async updateConnectionQrCode(accountId, qrCode) {
      const { data, error } = await supabase
        .from("whatsapp_connections")
        .upsert({ account_id: accountId, qr_code: qrCode }, { onConflict: "account_id" })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toConnection(data);
    },
```

- [ ] **Step 8: Run full suite and typecheck**

```bash
npm run test
npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add src/modules/whatsapp/types.ts src/modules/whatsapp/repository.ts src/modules/whatsapp/repository.memory.ts src/modules/whatsapp/repository.supabase.ts src/modules/whatsapp/repository.memory.test.ts
git commit -m "feat(whatsapp): store provider config and QR code on the connection"
```

---

### Task 3: `UazapiProvider`

**Files:**
- Create: `src/modules/whatsapp/provider.uazapi.ts`
- Test: `src/modules/whatsapp/provider.uazapi.test.ts`
- Modify: `src/modules/whatsapp/provider.ts` (register in the factory)

**Interfaces:**
- Produces: `UazapiProvider extends WhatsappProvider { getQrCode(accountId: string): Promise<string | null> }`, `createUazapiProvider(repo: WhatsappRepository): UazapiProvider`, `normalizeWhatsappJid(jid: string): string`.
- Changes: `getWhatsappProvider(providerName, repo)` gains an `"uazapi"` branch.
- Consumes: `WhatsappRepository.getConnection`/`upsertConnectionStatus`/`updateConnectionQrCode`/`updateConnectionConfig` from Task 2.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/modules/whatsapp/provider.uazapi.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { createUazapiProvider, normalizeWhatsappJid } from "./provider.uazapi";

describe("normalizeWhatsappJid", () => {
  it("strips the JID suffix, leaving only the phone number", () => {
    expect(normalizeWhatsappJid("5511999999999@s.whatsapp.net")).toBe("5511999999999");
    expect(normalizeWhatsappJid("5511999999999")).toBe("5511999999999");
  });
});

describe("UazapiProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function seedConfig(repo: ReturnType<typeof createInMemoryWhatsappRepository>) {
    await repo.updateConnectionConfig("acc-1", "uazapi", {
      subdomain: "minhaclinica",
      token: "abc123",
      webhookSecret: "sekret",
    });
  }

  it("throws when connect is called without a saved config", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createUazapiProvider(repo);
    await expect(provider.connect("acc-1")).rejects.toThrow();
  });

  it("saves the QR code and sets status to connecting on connect", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ qrcode: "data:image/png;base64,abc" }),
    });

    const provider = createUazapiProvider(repo);
    await provider.connect("acc-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://minhaclinica.uazapi.com/instance/connect",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ token: "abc123" }),
      }),
    );
    expect(await provider.getQrCode("acc-1")).toBe("data:image/png;base64,abc");
    const connection = await repo.getConnection("acc-1");
    expect(connection?.status).toBe("connecting");
  });

  it("maps the hibernated status to disconnected", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "hibernated" }) });

    const provider = createUazapiProvider(repo);
    const status = await provider.getConnectionStatus("acc-1");

    expect(status).toBe("disconnected");
  });

  it("sends a text message and returns the providerMessageId from the response", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "msg-123" }) });

    const provider = createUazapiProvider(repo);
    const result = await provider.sendMessage("acc-1", "5511999999999", "Olá!");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://minhaclinica.uazapi.com/send/text",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ number: "5511999999999", text: "Olá!" }),
      }),
    );
    expect(result.providerMessageId).toBe("msg-123");
  });

  it("clears the connection status and QR code on disconnect", async () => {
    const repo = createInMemoryWhatsappRepository();
    await seedConfig(repo);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await repo.updateConnectionQrCode("acc-1", "data:image/png;base64,abc");

    const provider = createUazapiProvider(repo);
    await provider.disconnect("acc-1");

    const connection = await repo.getConnection("acc-1");
    expect(connection?.status).toBe("disconnected");
    expect(connection?.qrCode).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/whatsapp/provider.uazapi.test.ts`
Expected: FAIL — `Cannot find module './provider.uazapi'`

- [ ] **Step 3: Implement the Uazapi provider**

```typescript
// src/modules/whatsapp/provider.uazapi.ts
import type { WhatsappRepository } from "./repository";
import type { WhatsappProvider } from "./provider";
import type { ConnectionStatus, WhatsappConnection } from "./types";

export interface UazapiProvider extends WhatsappProvider {
  getQrCode(accountId: string): Promise<string | null>;
}

export function normalizeWhatsappJid(jid: string): string {
  return jid.split("@")[0];
}

interface UazapiConfig {
  subdomain: string;
  token: string;
  webhookSecret: string;
}

function getConfig(connection: WhatsappConnection | null): UazapiConfig {
  const config = connection?.config;
  if (!config?.subdomain || !config?.token) {
    throw new Error("Configure o subdomínio e o token da Uazapi antes de conectar");
  }
  return {
    subdomain: config.subdomain,
    token: config.token,
    webhookSecret: config.webhookSecret ?? "",
  };
}

function baseUrl(subdomain: string): string {
  return `https://${subdomain}.uazapi.com`;
}

export function createUazapiProvider(repo: WhatsappRepository): UazapiProvider {
  return {
    async connect(accountId) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      await fetch(`${baseUrl(config.subdomain)}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({
          url: `${appUrl}/api/whatsapp/webhook/${accountId}?secret=${config.webhookSecret}`,
          events: ["messages"],
          excludeMessages: ["wasSentByApi"],
        }),
      });

      const response = await fetch(`${baseUrl(config.subdomain)}/instance/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("Falha ao conectar com a Uazapi");
      const data = await response.json();

      await repo.upsertConnectionStatus(accountId, "connecting", null);
      await repo.updateConnectionQrCode(accountId, data.qrcode ?? data.qrCode ?? null);
    },

    async disconnect(accountId) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      await fetch(`${baseUrl(config.subdomain)}/instance/disconnect`, {
        method: "POST",
        headers: { token: config.token },
      });

      await repo.upsertConnectionStatus(accountId, "disconnected", null);
      await repo.updateConnectionQrCode(accountId, null);
    },

    async getConnectionStatus(accountId) {
      const connection = await repo.getConnection(accountId);
      if (!connection?.config) return "disconnected";
      const config = getConfig(connection);

      const response = await fetch(`${baseUrl(config.subdomain)}/instance/status`, {
        method: "GET",
        headers: { token: config.token },
      });
      if (!response.ok) return "disconnected";
      const data = await response.json();
      const rawStatus: string = data.status ?? "disconnected";
      const mapped: ConnectionStatus = rawStatus === "hibernated" ? "disconnected" : (rawStatus as ConnectionStatus);

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

      const response = await fetch(`${baseUrl(config.subdomain)}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({ number: toPhone, text: body }),
      });
      if (!response.ok) throw new Error("Falha ao enviar mensagem pela Uazapi");
      const data = await response.json();
      return { providerMessageId: data.id ?? data.messageid ?? "" };
    },

    async getQrCode(accountId) {
      const connection = await repo.getConnection(accountId);
      return connection?.qrCode ?? null;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/whatsapp/provider.uazapi.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Register in the factory**

In `src/modules/whatsapp/provider.ts`, add the import and branch:

```typescript
import { createUazapiProvider } from "./provider.uazapi";
```

```typescript
export function getWhatsappProvider(
  providerName: string,
  repo: WhatsappRepository,
): WhatsappProvider {
  if (providerName === "fake") return createFakeWhatsappProvider(repo);
  if (providerName === "uazapi") return createUazapiProvider(repo);
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
git add src/modules/whatsapp/provider.uazapi.ts src/modules/whatsapp/provider.uazapi.test.ts src/modules/whatsapp/provider.ts
git commit -m "feat(whatsapp): add UazapiProvider (connect/status/send against the real API)"
```

---

### Task 4: Webhook — shared-secret check and real Uazapi payload parsing

**Files:**
- Modify: `src/modules/whatsapp/service.ts`
- Modify: `src/app/api/whatsapp/webhook/[accountId]/route.ts`
- Test: `src/modules/whatsapp/service.test.ts`

**Interfaces:**
- Produces: `isValidWebhookSecret(connection: WhatsappConnection | null, providedSecret: string | null): boolean`.
- Produces: `parseWebhookPayload(body: unknown): { fromPhone: string; fromName?: string; body: string } | null` — accepts either the real Uazapi `WebhookEvent` envelope (`{ event: "messages", data: { sender, senderName, text, fromMe, isGroup } }`) or the flat `{ fromPhone, fromName, body }` shape used for manual/fake-provider testing; returns `null` for anything else (unrecognized shape, group messages, or messages the API itself sent).
- Consumes: `normalizeWhatsappJid` from `./provider.uazapi` (Task 3).

Both functions are plain, pure logic — testable directly without mocking HTTP, matching the design spec's testing section.

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/whatsapp/service.test.ts` — add the import:

```typescript
import { normalizeWhatsappJid } from "./provider.uazapi";
```

And add two new `describe` blocks:

```typescript
describe("isValidWebhookSecret", () => {
  it("allows the request through when no secret has been configured yet", () => {
    expect(isValidWebhookSecret(null, null)).toBe(true);
    expect(
      isValidWebhookSecret(
        {
          accountId: "acc-1",
          provider: "fake",
          status: "disconnected",
          connectedAt: null,
          qrCode: null,
          config: null,
        },
        null,
      ),
    ).toBe(true);
  });

  it("rejects when a secret is configured but missing or wrong", () => {
    const connection = {
      accountId: "acc-1",
      provider: "uazapi",
      status: "connected" as const,
      connectedAt: null,
      qrCode: null,
      config: { subdomain: "x", token: "y", webhookSecret: "correct-secret" },
    };
    expect(isValidWebhookSecret(connection, null)).toBe(false);
    expect(isValidWebhookSecret(connection, "wrong-secret")).toBe(false);
    expect(isValidWebhookSecret(connection, "correct-secret")).toBe(true);
  });
});

describe("parseWebhookPayload", () => {
  it("parses the real Uazapi messages envelope", () => {
    const result = parseWebhookPayload({
      event: "messages",
      instance: "inst-1",
      data: {
        sender: "5511999999999@s.whatsapp.net",
        senderName: "Carla Souza",
        text: "Oi, gostaria de agendar",
        fromMe: false,
        isGroup: false,
      },
    });
    expect(result).toEqual({
      fromPhone: "5511999999999",
      fromName: "Carla Souza",
      body: "Oi, gostaria de agendar",
    });
  });

  it("ignores messages sent by the API itself", () => {
    const result = parseWebhookPayload({
      event: "messages",
      data: { sender: "5511999999999@s.whatsapp.net", text: "oi", fromMe: true, isGroup: false },
    });
    expect(result).toBeNull();
  });

  it("ignores group messages", () => {
    const result = parseWebhookPayload({
      event: "messages",
      data: { sender: "123@g.us", text: "oi", fromMe: false, isGroup: true },
    });
    expect(result).toBeNull();
  });

  it("parses the flat shape used for manual/fake-provider testing", () => {
    const result = parseWebhookPayload({
      fromPhone: "5511999999999",
      fromName: "Carla Souza",
      body: "Oi",
    });
    expect(result).toEqual({ fromPhone: "5511999999999", fromName: "Carla Souza", body: "Oi" });
  });

  it("returns null for an unrecognized shape", () => {
    expect(parseWebhookPayload({ foo: "bar" })).toBeNull();
    expect(parseWebhookPayload(null)).toBeNull();
  });
});
```

Update the `import { ... } from "./service"` line at the top of the file to include the two new functions:

```typescript
import {
  startConversation,
  logMessage,
  getConversationMessages,
  handleInboundMessage,
  getConnectionStatus,
  connectWhatsapp,
  disconnectWhatsapp,
  resetUnreadCount,
  isValidWebhookSecret,
  parseWebhookPayload,
} from "./service";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/whatsapp/service.test.ts`
Expected: FAIL — `isValidWebhookSecret`/`parseWebhookPayload` aren't exported yet.

- [ ] **Step 3: Implement both functions**

In `src/modules/whatsapp/service.ts`, add the import:

```typescript
import { normalizeWhatsappJid } from "./provider.uazapi";
import type { WhatsappConnection } from "./types";
```

Add the functions:

```typescript
export function isValidWebhookSecret(
  connection: WhatsappConnection | null,
  providedSecret: string | null,
): boolean {
  const expectedSecret = connection?.config?.webhookSecret;
  if (!expectedSecret) return true;
  return providedSecret === expectedSecret;
}

export function parseWebhookPayload(
  body: unknown,
): { fromPhone: string; fromName?: string; body: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const payload = body as Record<string, unknown>;

  if (payload.event === "messages") {
    const data = payload.data;
    if (typeof data !== "object" || data === null) return null;
    const eventData = data as Record<string, unknown>;
    if (eventData.fromMe === true || eventData.isGroup === true) return null;
    if (typeof eventData.sender !== "string" || typeof eventData.text !== "string") return null;
    return {
      fromPhone: normalizeWhatsappJid(eventData.sender),
      fromName: typeof eventData.senderName === "string" ? eventData.senderName : undefined,
      body: eventData.text,
    };
  }

  if (typeof payload.fromPhone === "string" && typeof payload.body === "string") {
    return {
      fromPhone: payload.fromPhone,
      fromName: typeof payload.fromName === "string" ? payload.fromName : undefined,
      body: payload.body,
    };
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/whatsapp/service.test.ts`
Expected: PASS

- [ ] **Step 5: Rewrite the webhook route to use both functions**

Replace the full contents of `src/app/api/whatsapp/webhook/[accountId]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createSupabaseWhatsappRepository } from "@/modules/whatsapp/repository.supabase";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
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

  const message = await whatsapp.handleInboundMessage(
    whatsappRepo,
    {
      findContactByPhone: (accId, phone) => crm.findContactByPhone(crmRepo, accId, phone),
      createContact: (accId, input) => crm.createContact(crmRepo, accId, input),
    },
    accountId,
    parsed,
  );

  return NextResponse.json({ ok: true, messageId: message.id });
}
```

`{ ok: true, skipped: true }` (not a 400) for unrecognized/filtered payloads matches how the real Uazapi webhook will also deliver event types other than plain inbound text (e.g. `messages_update`, group messages) once more events are enabled later — those should be silently accepted, not treated as errors.

- [ ] **Step 6: Run full suite, typecheck**

```bash
npm run test
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/whatsapp/service.ts src/modules/whatsapp/service.test.ts "src/app/api/whatsapp/webhook/[accountId]/route.ts"
git commit -m "feat(whatsapp): validate webhook secret and parse the real Uazapi payload shape"
```

---

### Task 5: Actions — save config, use the configured provider

**Files:**
- Modify: `src/app/(app)/whatsapp/actions.ts`

**Interfaces:**
- Produces: `saveUazapiConfigAction(subdomain: string, token: string): Promise<WhatsappConnection>`, `getUazapiQrCodeAction(): Promise<string | null>`, `getWhatsappConnectionAction(): Promise<WhatsappConnection | null>`.
- Changes: `getConnectionStatusAction`, `connectWhatsappAction`, `disconnectWhatsappAction`, `logMessageAction` now resolve the provider from the account's saved `connection.provider` instead of hardcoding `"fake"`.

- [ ] **Step 1: Update the provider-resolving actions**

In `src/app/(app)/whatsapp/actions.ts`, add the import:

```typescript
import { createUazapiProvider } from "@/modules/whatsapp/provider.uazapi";
```

Replace `getConnectionStatusAction`, `connectWhatsappAction`, `disconnectWhatsappAction`, and `logMessageAction` (all four currently call `getWhatsappProvider("fake", repo)`):

```typescript
export async function getConnectionStatusAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const connection = await repo.getConnection(accountId);
  const provider = getWhatsappProvider(connection?.provider ?? "fake", repo);
  return whatsapp.getConnectionStatus(provider, accountId);
}

export async function connectWhatsappAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const connection = await repo.getConnection(accountId);
  const provider = getWhatsappProvider(connection?.provider ?? "fake", repo);
  await whatsapp.connectWhatsapp(provider, accountId);
  revalidatePath("/whatsapp");
}

export async function disconnectWhatsappAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const connection = await repo.getConnection(accountId);
  const provider = getWhatsappProvider(connection?.provider ?? "fake", repo);
  await whatsapp.disconnectWhatsapp(provider, accountId);
  revalidatePath("/whatsapp");
}

export async function logMessageAction(conversationId: string, input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const connection = await repo.getConnection(accountId);
  const provider = getWhatsappProvider(connection?.provider ?? "fake", repo);
  const message = await whatsapp.logMessage(repo, provider, accountId, conversationId, input);
  revalidatePath("/whatsapp");
  return message;
}
```

- [ ] **Step 2: Add the config, QR code, and connection-detail actions**

Add at the end of the file:

```typescript
export async function saveUazapiConfigAction(subdomain: string, token: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const existing = await repo.getConnection(accountId);
  const webhookSecret = existing?.config?.webhookSecret ?? crypto.randomUUID();
  const connection = await repo.updateConnectionConfig(accountId, "uazapi", {
    subdomain,
    token,
    webhookSecret,
  });
  revalidatePath("/whatsapp");
  return connection;
}

export async function getUazapiQrCodeAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const provider = createUazapiProvider(repo);
  return provider.getQrCode(accountId);
}

export async function getWhatsappConnectionAction() {
  const { repo, accountId } = await getRepoAndAccount();
  return repo.getConnection(accountId);
}
```

- [ ] **Step 3: Run full suite, typecheck, lint**

```bash
npm run test
npx tsc --noEmit
npm run lint
```

Expected: all green — this task only rewires existing actions and adds new ones; no test file changes needed (these actions aren't unit-tested directly, same as the rest of `actions.ts` in this codebase — they're thin wiring over already-tested service functions).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/whatsapp/actions.ts"
git commit -m "feat(whatsapp): resolve the configured provider per account; add Uazapi config actions"
```

---

### Task 6: UI — config dialog and QR code connect flow

**Files:**
- Modify: `src/components/whatsapp/whatsapp-client.tsx`

**Interfaces:** None new — consumes `saveUazapiConfigAction`, `getUazapiQrCodeAction`, `getWhatsappConnectionAction` from Task 5.

- [ ] **Step 1: Import the new actions and types**

In `src/components/whatsapp/whatsapp-client.tsx`, update the actions import (this already includes the prior plan's connection actions):

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
  getWhatsappConnectionAction,
} from "@/app/(app)/whatsapp/actions";
import type { Conversation, Message, WhatsappConnection } from "@/modules/whatsapp/types";
```

- [ ] **Step 2: Add a config dialog component**

Add above the `WhatsappClient` export, after `NewConversationDialog`:

```tsx
function UazapiConfigDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await saveUazapiConfigAction(subdomain.trim(), token.trim());
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
      <DialogTrigger render={<Button variant="outline">Configurar Uazapi</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar Uazapi</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-2">
          <Input
            placeholder="Subdomínio (ex: minhaclinica)"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
          />
          <Input
            placeholder="Token da instância"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button onClick={handleSave} disabled={saving || !subdomain.trim() || !token.trim()}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Replace connection state with the full connection object, add QR polling**

Replace the connection-status state/effects added by the prior plan's Task 10 (the `connectionStatus`/`togglingConnection` state and the mount effect):

```typescript
  const [connection, setConnection] = useState<WhatsappConnection | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [togglingConnection, setTogglingConnection] = useState(false);

  const refreshConnection = useCallback(async () => {
    const [conn, status] = await Promise.all([
      getWhatsappConnectionAction(),
      getConnectionStatusAction(),
    ]);
    setConnection(conn);
    if (conn?.provider === "uazapi" && status === "connecting") {
      setQrCode(await getUazapiQrCodeAction());
    } else {
      setQrCode(null);
    }
  }, []);

  useEffect(() => {
    refreshConnection();
  }, [refreshConnection]);

  useEffect(() => {
    if (connection?.provider !== "uazapi" || connection?.status !== "connecting") return;
    const interval = setInterval(refreshConnection, 3000);
    return () => clearInterval(interval);
  }, [connection?.provider, connection?.status, refreshConnection]);

  async function handleToggleConnection() {
    setTogglingConnection(true);
    try {
      if (connection?.status === "connected") {
        await disconnectWhatsappAction();
      } else {
        await connectWhatsappAction();
      }
      await refreshConnection();
    } finally {
      setTogglingConnection(false);
    }
  }
```

Add `useCallback` to the React import at the top of the file:

```typescript
import { useCallback, useEffect, useState } from "react";
```

- [ ] **Step 4: Update the header row — badge, connect button, config dialog, QR code**

Replace the header `<div className="flex items-center justify-between gap-2">...</div>` block (the one added by the prior plan's Task 10, showing the badge/connect button/new-conversation-dialog):

```tsx
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            className={
              connection?.status === "connected"
                ? "bg-[#25D366]/10 text-[#188a44]"
                : "bg-muted text-muted-foreground"
            }
          >
            {connection?.status === "connected" ? "Conectado" : "Desconectado"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={togglingConnection || !connection?.config}
            title={!connection?.config ? "Configure a Uazapi antes de conectar" : undefined}
            onClick={handleToggleConnection}
          >
            {connection?.status === "connected" ? "Desconectar" : "Conectar"}
          </Button>
          <UazapiConfigDialog onSaved={refreshConnection} />
        </div>
        <NewConversationDialog onCreated={handleConversationCreated} />
      </div>
      {qrCode && (
        <div className="flex flex-col items-center gap-2 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">
            Escaneie o QR code no WhatsApp do celular para conectar
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR code is a data: URL from the provider, not an optimizable static asset */}
          <img src={qrCode} alt="QR code de conexão do WhatsApp" className="size-48" />
        </div>
      )}
```

- [ ] **Step 5: Run full suite, typecheck, lint**

```bash
npm run test
npx tsc --noEmit
npm run lint
```

Expected: all green, same 13 pre-existing lint errors as before (no new ones).

- [ ] **Step 6: Visual verification**

```bash
agent-browser open http://localhost:3000/whatsapp
agent-browser wait --load networkidle
agent-browser wait 500
agent-browser screenshot task6-uazapi-config.png
```

Read the screenshot: should show "Desconectado", a disabled "Conectar" button (no config saved yet), and a "Configurar Uazapi" button. Click "Configurar Uazapi" (`agent-browser find role button click --name "Configurar Uazapi"`), fill in a fake subdomain/token, save, and confirm the "Conectar" button becomes enabled. Actually connecting requires a real Uazapi subdomain/token — without one, clicking "Conectar" will fail when the provider calls the real API; that's expected until real credentials are available, and doesn't block this step (the goal here is confirming the config dialog and button-enablement logic work, not a live connection).

- [ ] **Step 7: Commit**

```bash
git add src/components/whatsapp/whatsapp-client.tsx
git commit -m "feat(whatsapp): add Uazapi config dialog and QR code connect flow"
```
