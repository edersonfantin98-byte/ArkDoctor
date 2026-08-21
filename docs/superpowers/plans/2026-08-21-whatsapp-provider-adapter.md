# WhatsApp Provider Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the WhatsApp Inbox from a manual conversation log into a real inbox wired to a provider-adapter interface — inbound messages arrive via a webhook and auto-create contacts/leads in the pipeline, outbound messages go through the adapter, and the UI shows real connection status.

**Architecture:** A `WhatsappProvider` interface (`connect`/`disconnect`/`getConnectionStatus`/`sendMessage`) decouples the rest of the app from the concrete messaging provider. This round implements only a `fake` provider (no real network calls) — real providers (Uazapi, official WhatsApp Business API) are future work once credentials exist, per the design spec. Inbound messages land on a new webhook route, get parsed into a provider-agnostic shape, and flow through a single testable service function (`handleInboundMessage`) that reuses the CRM's existing `createContact` (which already creates a pipeline Deal as a side effect — no new pipeline code needed).

**Tech Stack:** Next.js 16 (App Router) route handlers, TypeScript, Zod, Supabase (Postgres + `@supabase/ssr` for the app, `@supabase/supabase-js` service-role client for the webhook), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-21-whatsapp-provider-adapter-design.md`

## Global Constraints

- Only the `fake` provider is implemented in this plan. Real providers (Uazapi, official API) are explicitly out of scope until real credentials exist — do not write untested network integration code against them.
- `crm.createContact` (`src/modules/crm/service.ts:5-19`) already creates a Deal in the first pipeline stage as a side effect when a contact is created — the inbound-message flow must reuse this function, not duplicate deal-creation logic.
- Run `npm run test`, `npx tsc --noEmit`, and `npm run lint` after every task — do not move to the next task with a red test suite or a new type error (13 pre-existing `react-hooks/set-state-in-effect` lint errors are unrelated and already there — don't fix those, just don't add new ones).
- The webhook route (Task 7) needs a Supabase **service-role** key, since it has no logged-in user session and RLS would otherwise reject it. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (Supabase dashboard → Project Settings → API → `service_role` secret) before manually testing that route against the real database — it will compile and the rest of the app is unaffected either way, but that one route fails at runtime without it.
- The Supabase CLI is already linked to this project (`nrfpjqrirmqktnnfqqex`) — migration tasks can run `npx supabase db push` directly.

---

### Task 1: Database migration — `whatsapp_connections`

**Files:**
- Create: `supabase/migrations/0007_whatsapp_connections.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated via CLI, not hand-edited)

**Interfaces:** None — pure schema change. Table shape consumed by Task 4's repository code.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0007_whatsapp_connections.sql
create table whatsapp_connections (
  account_id uuid primary key references accounts(id) on delete cascade,
  provider text not null default 'fake',
  status text not null default 'disconnected' check (status in ('disconnected', 'connecting', 'connected')),
  connected_at timestamptz,
  config jsonb
);

alter table whatsapp_connections enable row level security;

create policy "account members can manage whatsapp_connections"
  on whatsapp_connections for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));
```

`config` is reserved (unused today) for real-provider credentials later, same pattern as the already-reserved `appointment_id` column in `financial_entries`.

- [ ] **Step 2: Apply the migration and regenerate types**

```bash
npx supabase db push
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

Expected: `database.types.ts` now contains a `whatsapp_connections` table entry (`account_id`, `provider`, `status`, `connected_at`, `config`).

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors (nothing references the new table yet).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_whatsapp_connections.sql src/lib/supabase/database.types.ts
git commit -m "feat(whatsapp): add whatsapp_connections table"
```

---

### Task 2: CRM — `findContactByPhone`

**Files:**
- Modify: `src/modules/crm/repository.ts`
- Modify: `src/modules/crm/repository.memory.ts`
- Modify: `src/modules/crm/repository.supabase.ts`
- Modify: `src/modules/crm/service.ts`
- Test: `src/modules/crm/repository.memory.test.ts`
- Test: `src/modules/crm/service.test.ts`

**Interfaces:**
- Produces: `CrmRepository.findContactByPhone(accountId: string, phone: string): Promise<Contact | null>` — exact match, unlike the existing fuzzy `searchContacts`.
- Produces: `findContactByPhone(repo: CrmRepository, accountId: string, phone: string): Promise<Contact | null>` (service-layer thin wrapper, same pattern as `searchContacts`/`countNewContacts` in `src/modules/crm/service.ts`).

- [ ] **Step 1: Write the failing repository test**

Add to `src/modules/crm/repository.memory.test.ts`, right after the `"inserts and retrieves a contact scoped to its account"` test:

```typescript
  it("finds a contact by exact phone match, scoped to the account", async () => {
    const repo = createInMemoryCrmRepository();
    await repo.insertContact("acc-1", { name: "Ana", phone: "11999990000" });

    const found = await repo.findContactByPhone("acc-1", "11999990000");
    expect(found?.name).toBe("Ana");

    const notFound = await repo.findContactByPhone("acc-1", "00000000000");
    expect(notFound).toBeNull();

    const wrongAccount = await repo.findContactByPhone("acc-2", "11999990000");
    expect(wrongAccount).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/crm/repository.memory.test.ts`
Expected: FAIL — `repo.findContactByPhone is not a function`

- [ ] **Step 3: Add to the repository interface**

In `src/modules/crm/repository.ts`, add right after `searchContacts`:

```typescript
  findContactByPhone(accountId: string, phone: string): Promise<Contact | null>;
```

- [ ] **Step 4: Implement in the memory repository**

In `src/modules/crm/repository.memory.ts`, add right after `searchContacts`:

```typescript
    async findContactByPhone(accountId, phone) {
      return (
        [...contacts.values()].find((c) => c.accountId === accountId && c.phone === phone) ?? null
      );
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/crm/repository.memory.test.ts`
Expected: PASS

- [ ] **Step 6: Implement in the Supabase repository**

In `src/modules/crm/repository.supabase.ts`, add right after `searchContacts`:

```typescript
    async findContactByPhone(accountId, phone) {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("account_id", accountId)
        .eq("phone", phone)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toContact(data) : null;
    },
```

- [ ] **Step 7: Write the failing service test**

In `src/modules/crm/service.test.ts`, replace the existing import block:

```typescript
import {
  countNewContacts,
  createContact,
  createStage,
  deleteStage,
  findContactByPhone,
  getOpenDealForContact,
  getStages,
  listPipeline,
  moveDeal,
  renameStage,
  reorderStages,
  reopenDeal,
  searchContacts,
  updateContact,
} from "./service";
```

Then add a new `describe` block:

```typescript
describe("findContactByPhone", () => {
  it("delegates to the repository", async () => {
    const repo = createInMemoryCrmRepository();
    await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    const found = await findContactByPhone(repo, "acc-1", "11999990000");
    expect(found?.name).toBe("Ana");

    const notFound = await findContactByPhone(repo, "acc-1", "00000000000");
    expect(notFound).toBeNull();
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npx vitest run src/modules/crm/service.test.ts`
Expected: FAIL — `findContactByPhone is not a function` (not exported from `./service` yet)

- [ ] **Step 9: Implement the service wrapper**

In `src/modules/crm/service.ts`, add right after `searchContacts`:

```typescript
export async function findContactByPhone(
  repo: CrmRepository,
  accountId: string,
  phone: string,
): Promise<Contact | null> {
  return repo.findContactByPhone(accountId, phone);
}
```

- [ ] **Step 10: Run full suite and typecheck**

```bash
npm run test
npx tsc --noEmit
```

- [ ] **Step 11: Commit**

```bash
git add src/modules/crm/repository.ts src/modules/crm/repository.memory.ts src/modules/crm/repository.supabase.ts src/modules/crm/service.ts src/modules/crm/repository.memory.test.ts src/modules/crm/service.test.ts
git commit -m "feat(crm): add findContactByPhone for exact phone lookup"
```

---

### Task 3: Whatsapp repository — conversation-by-phone lookup and unread count

**Files:**
- Modify: `src/modules/whatsapp/repository.ts`
- Modify: `src/modules/whatsapp/repository.memory.ts`
- Modify: `src/modules/whatsapp/repository.supabase.ts`
- Test: `src/modules/whatsapp/repository.memory.test.ts`

**Interfaces:**
- Produces: `WhatsappRepository.getConversationByPhone(accountId: string, phone: string): Promise<Conversation | null>`
- Produces: `WhatsappRepository.incrementUnreadCount(accountId: string, conversationId: string): Promise<void>`
- Produces: `WhatsappRepository.resetUnreadCount(accountId: string, conversationId: string): Promise<void>`

No schema change needed — these operate on the existing `whatsapp_conversations` columns (`contact_phone`, `unread_count`).

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/whatsapp/repository.memory.test.ts`, inside the existing `describe("createInMemoryWhatsappRepository", ...)` block:

```typescript
  it("finds a conversation by exact phone match, scoped to the account", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });

    const found = await repo.getConversationByPhone("acc-1", "51991234477");
    expect(found?.id).toBe(conversation.id);

    const notFound = await repo.getConversationByPhone("acc-1", "00000000000");
    expect(notFound).toBeNull();
  });

  it("increments and resets the unread count for a conversation", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });

    await repo.incrementUnreadCount("acc-1", conversation.id);
    await repo.incrementUnreadCount("acc-1", conversation.id);
    const afterIncrement = await repo.getConversation("acc-1", conversation.id);
    expect(afterIncrement?.unreadCount).toBe(2);

    await repo.resetUnreadCount("acc-1", conversation.id);
    const afterReset = await repo.getConversation("acc-1", conversation.id);
    expect(afterReset?.unreadCount).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/whatsapp/repository.memory.test.ts`
Expected: FAIL — the three new methods don't exist yet.

- [ ] **Step 3: Add to the repository interface**

In `src/modules/whatsapp/repository.ts`, add after `insertConversation`:

```typescript
  getConversationByPhone(accountId: string, phone: string): Promise<Conversation | null>;
```

And at the end of the interface (after `touchConversation`):

```typescript
  incrementUnreadCount(accountId: string, conversationId: string): Promise<void>;
  resetUnreadCount(accountId: string, conversationId: string): Promise<void>;
```

- [ ] **Step 4: Implement in the memory repository**

In `src/modules/whatsapp/repository.memory.ts`, add after `insertConversation`:

```typescript
    async getConversationByPhone(accountId, phone) {
      return (
        [...conversations.values()].find(
          (c) => c.accountId === accountId && c.contactPhone === phone,
        ) ?? null
      );
    },
```

And after `touchConversation`:

```typescript
    async incrementUnreadCount(accountId, conversationId) {
      const c = conversations.get(conversationId);
      if (!c || c.accountId !== accountId) return;
      conversations.set(conversationId, { ...c, unreadCount: c.unreadCount + 1 });
    },

    async resetUnreadCount(accountId, conversationId) {
      const c = conversations.get(conversationId);
      if (!c || c.accountId !== accountId) return;
      conversations.set(conversationId, { ...c, unreadCount: 0 });
    },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/modules/whatsapp/repository.memory.test.ts`
Expected: PASS

- [ ] **Step 6: Implement in the Supabase repository**

In `src/modules/whatsapp/repository.supabase.ts`, add after `insertConversation`:

```typescript
    async getConversationByPhone(accountId, phone) {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_phone", phone)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toConversation(data) : null;
    },
```

And after `touchConversation`:

```typescript
    async incrementUnreadCount(accountId, conversationId) {
      const { data: current, error: fetchError } = await supabase
        .from("whatsapp_conversations")
        .select("unread_count")
        .eq("account_id", accountId)
        .eq("id", conversationId)
        .maybeSingle();
      if (fetchError) throwDbError(fetchError);
      if (!current) return;
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ unread_count: current.unread_count + 1 })
        .eq("account_id", accountId)
        .eq("id", conversationId);
      if (error) throwDbError(error);
    },

    async resetUnreadCount(accountId, conversationId) {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ unread_count: 0 })
        .eq("account_id", accountId)
        .eq("id", conversationId);
      if (error) throwDbError(error);
    },
```

- [ ] **Step 7: Run full suite and typecheck**

```bash
npm run test
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/whatsapp/repository.ts src/modules/whatsapp/repository.memory.ts src/modules/whatsapp/repository.supabase.ts src/modules/whatsapp/repository.memory.test.ts
git commit -m "feat(whatsapp): add getConversationByPhone and unread-count tracking"
```

---

### Task 4: Whatsapp repository — connection state

**Files:**
- Modify: `src/modules/whatsapp/types.ts`
- Modify: `src/modules/whatsapp/repository.ts`
- Modify: `src/modules/whatsapp/repository.memory.ts`
- Modify: `src/modules/whatsapp/repository.supabase.ts`
- Test: `src/modules/whatsapp/repository.memory.test.ts`

**Interfaces:**
- Produces (`types.ts`): `ConnectionStatus = "disconnected" | "connecting" | "connected"`, `WhatsappConnection { accountId: string; provider: string; status: ConnectionStatus; connectedAt: string | null }`.
- Produces: `WhatsappRepository.getConnection(accountId: string): Promise<WhatsappConnection | null>` — `null` means no row exists yet (never connected).
- Produces: `WhatsappRepository.upsertConnectionStatus(accountId: string, status: ConnectionStatus, connectedAt: string | null): Promise<WhatsappConnection>`.

- [ ] **Step 1: Write the failing test**

Add to `src/modules/whatsapp/repository.memory.test.ts`:

```typescript
  it("returns null for a connection that hasn't been set up, then reflects upserts", async () => {
    const repo = createInMemoryWhatsappRepository();

    expect(await repo.getConnection("acc-1")).toBeNull();

    const connected = await repo.upsertConnectionStatus(
      "acc-1",
      "connected",
      "2026-08-21T10:00:00.000Z",
    );
    expect(connected.status).toBe("connected");
    expect(connected.connectedAt).toBe("2026-08-21T10:00:00.000Z");

    const disconnected = await repo.upsertConnectionStatus("acc-1", "disconnected", null);
    expect(disconnected.status).toBe("disconnected");
    expect(disconnected.connectedAt).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/whatsapp/repository.memory.test.ts`
Expected: FAIL — `repo.getConnection is not a function`

- [ ] **Step 3: Add the types**

In `src/modules/whatsapp/types.ts`, add at the end of the file:

```typescript
export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface WhatsappConnection {
  accountId: string;
  provider: string;
  status: ConnectionStatus;
  connectedAt: string | null;
}
```

- [ ] **Step 4: Add to the repository interface**

In `src/modules/whatsapp/repository.ts`, update the import and add the two methods at the end of the interface:

```typescript
import type { Conversation, Message, WhatsappConnection, ConnectionStatus } from "./types";
```

```typescript
  getConnection(accountId: string): Promise<WhatsappConnection | null>;
  upsertConnectionStatus(
    accountId: string,
    status: ConnectionStatus,
    connectedAt: string | null,
  ): Promise<WhatsappConnection>;
```

- [ ] **Step 5: Implement in the memory repository**

In `src/modules/whatsapp/repository.memory.ts`, add a `connections` map alongside `conversations`/`messages`, and the two methods at the end of the returned object:

```typescript
import type { Conversation, Message, WhatsappConnection } from "./types";
```

```typescript
  const connections = new Map<string, WhatsappConnection>();
```

(place this line next to the existing `const conversations = new Map...` / `const messages = new Map...` declarations)

```typescript
    async getConnection(accountId) {
      return connections.get(accountId) ?? null;
    },

    async upsertConnectionStatus(accountId, status, connectedAt) {
      const existing = connections.get(accountId);
      const connection: WhatsappConnection = {
        accountId,
        provider: existing?.provider ?? "fake",
        status,
        connectedAt,
      };
      connections.set(accountId, connection);
      return connection;
    },
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/modules/whatsapp/repository.memory.test.ts`
Expected: PASS

- [ ] **Step 7: Implement in the Supabase repository**

In `src/modules/whatsapp/repository.supabase.ts`, add a `toConnection` mapper next to `toConversation`/`toMessage`:

```typescript
import type { Conversation, Message, MessageDirection, WhatsappConnection, ConnectionStatus } from "./types";
```

```typescript
function toConnection(
  row: Database["public"]["Tables"]["whatsapp_connections"]["Row"],
): WhatsappConnection {
  return {
    accountId: row.account_id,
    provider: row.provider,
    status: row.status as ConnectionStatus,
    connectedAt: row.connected_at,
  };
}
```

And add the two methods at the end of the returned object:

```typescript
    async getConnection(accountId) {
      const { data, error } = await supabase
        .from("whatsapp_connections")
        .select("*")
        .eq("account_id", accountId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toConnection(data) : null;
    },

    async upsertConnectionStatus(accountId, status, connectedAt) {
      const { data, error } = await supabase
        .from("whatsapp_connections")
        .upsert(
          { account_id: accountId, status, connected_at: connectedAt },
          { onConflict: "account_id" },
        )
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
git commit -m "feat(whatsapp): add connection-state tracking to the repository"
```

---

### Task 5: Provider adapter interface + fake provider

**Files:**
- Create: `src/modules/whatsapp/provider.ts`
- Create: `src/modules/whatsapp/provider.fake.ts`
- Test: `src/modules/whatsapp/provider.test.ts`

**Interfaces:**
- Produces (`provider.ts`): `WhatsappProvider` interface — `connect(accountId): Promise<void>`, `disconnect(accountId): Promise<void>`, `getConnectionStatus(accountId): Promise<ConnectionStatus>`, `sendMessage(accountId, toPhone, body): Promise<{ providerMessageId: string }>`. `getWhatsappProvider(providerName: string, repo: WhatsappRepository): WhatsappProvider`.
- Produces (`provider.fake.ts`): `createFakeWhatsappProvider(repo: WhatsappRepository): WhatsappProvider`.
- Consumes: `WhatsappRepository.getConnection`/`upsertConnectionStatus` from Task 4.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/modules/whatsapp/provider.test.ts
import { describe, it, expect } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { createFakeWhatsappProvider } from "./provider.fake";
import { getWhatsappProvider } from "./provider";

describe("fake whatsapp provider", () => {
  it("reflects connected/disconnected status after connect/disconnect", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);

    expect(await provider.getConnectionStatus("acc-1")).toBe("disconnected");

    await provider.connect("acc-1");
    expect(await provider.getConnectionStatus("acc-1")).toBe("connected");

    await provider.disconnect("acc-1");
    expect(await provider.getConnectionStatus("acc-1")).toBe("disconnected");
  });

  it("returns a providerMessageId when sending", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);

    const result = await provider.sendMessage("acc-1", "51991234477", "Olá!");
    expect(result.providerMessageId).toBeTruthy();
  });
});

describe("getWhatsappProvider", () => {
  it("resolves the fake provider by name", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = getWhatsappProvider("fake", repo);
    expect(await provider.getConnectionStatus("acc-1")).toBe("disconnected");
  });

  it("throws for an unknown provider name", () => {
    const repo = createInMemoryWhatsappRepository();
    expect(() => getWhatsappProvider("unknown", repo)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/whatsapp/provider.test.ts`
Expected: FAIL — `Cannot find module './provider'` / `'./provider.fake'`

- [ ] **Step 3: Write the provider interface and factory**

```typescript
// src/modules/whatsapp/provider.ts
import type { WhatsappRepository } from "./repository";
import type { ConnectionStatus } from "./types";
import { createFakeWhatsappProvider } from "./provider.fake";

export interface WhatsappProvider {
  connect(accountId: string): Promise<void>;
  disconnect(accountId: string): Promise<void>;
  getConnectionStatus(accountId: string): Promise<ConnectionStatus>;
  sendMessage(
    accountId: string,
    toPhone: string,
    body: string,
  ): Promise<{ providerMessageId: string }>;
}

export function getWhatsappProvider(
  providerName: string,
  repo: WhatsappRepository,
): WhatsappProvider {
  if (providerName === "fake") return createFakeWhatsappProvider(repo);
  throw new Error(`Provedor de WhatsApp desconhecido: ${providerName}`);
}
```

- [ ] **Step 4: Write the fake provider**

```typescript
// src/modules/whatsapp/provider.fake.ts
import type { WhatsappRepository } from "./repository";
import type { WhatsappProvider } from "./provider";

export function createFakeWhatsappProvider(repo: WhatsappRepository): WhatsappProvider {
  return {
    async connect(accountId) {
      await repo.upsertConnectionStatus(accountId, "connected", new Date().toISOString());
    },

    async disconnect(accountId) {
      await repo.upsertConnectionStatus(accountId, "disconnected", null);
    },

    async getConnectionStatus(accountId) {
      const connection = await repo.getConnection(accountId);
      return connection?.status ?? "disconnected";
    },

    async sendMessage(_accountId, _toPhone, _body) {
      return { providerMessageId: crypto.randomUUID() };
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/modules/whatsapp/provider.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Run full suite and typecheck**

```bash
npm run test
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/whatsapp/provider.ts src/modules/whatsapp/provider.fake.ts src/modules/whatsapp/provider.test.ts
git commit -m "feat(whatsapp): add WhatsappProvider adapter interface and fake provider"
```

---

### Task 6: `handleInboundMessage` service function

**Files:**
- Modify: `src/modules/whatsapp/service.ts`
- Modify: `src/modules/crm/service.ts` (no code change — already has `createContact`/`findContactByPhone` from Task 2)
- Test: `src/modules/whatsapp/service.test.ts`

**Interfaces:**
- Produces: `handleInboundMessage(whatsappRepo: WhatsappRepository, crmDeps: { findContactByPhone: (accountId: string, phone: string) => Promise<{ id: string; name: string } | null>; createContact: (accountId: string, input: { name: string; phone: string }) => Promise<{ id: string; name: string }> }, accountId: string, input: { fromPhone: string; fromName?: string; body: string }): Promise<Message>`.
- Consumes: `crm.findContactByPhone`, `crm.createContact` from `src/modules/crm/service.ts` (Task 2 and pre-existing); `WhatsappRepository.getConversationByPhone`/`incrementUnreadCount` from Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/whatsapp/service.test.ts` — update the imports at the top and add a new `describe` block:

```typescript
import { describe, it, expect, vi } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { createInMemoryCrmRepository } from "../crm/repository.memory";
import * as crm from "../crm/service";
import { startConversation, logMessage, getConversationMessages, handleInboundMessage } from "./service";
```

(replace the existing top-of-file imports with the above — `vi` and the two CRM imports are new)

```typescript
function buildCrmDeps(crmRepo: ReturnType<typeof createInMemoryCrmRepository>) {
  return {
    findContactByPhone: (accountId: string, phone: string) =>
      crm.findContactByPhone(crmRepo, accountId, phone),
    createContact: (accountId: string, input: { name: string; phone: string }) =>
      crm.createContact(crmRepo, accountId, input),
  };
}

describe("handleInboundMessage", () => {
  it("creates a new contact and conversation for an unknown phone number", async () => {
    const whatsappRepo = createInMemoryWhatsappRepository();
    const crmRepo = createInMemoryCrmRepository();

    const message = await handleInboundMessage(whatsappRepo, buildCrmDeps(crmRepo), "acc-1", {
      fromPhone: "51991234477",
      fromName: "Carla Souza",
      body: "Oi, gostaria de agendar uma consulta",
    });

    expect(message.direction).toBe("inbound");
    expect(message.body).toBe("Oi, gostaria de agendar uma consulta");

    const contacts = await crmRepo.searchContacts("acc-1", "Carla");
    expect(contacts).toHaveLength(1);
    expect(contacts[0].phone).toBe("51991234477");

    const stages = await crmRepo.getStages("acc-1");
    const dealsByStage = await crmRepo.getDealsWithContactsByStage("acc-1");
    expect(dealsByStage.get(stages[0].id) ?? []).toHaveLength(1);

    const conversation = await whatsappRepo.getConversationByPhone("acc-1", "51991234477");
    expect(conversation?.unreadCount).toBe(1);
  });

  it("reuses an existing contact and conversation for a known phone number", async () => {
    const whatsappRepo = createInMemoryWhatsappRepository();
    const crmRepo = createInMemoryCrmRepository();
    const existingContact = await crmRepo.insertContact("acc-1", {
      name: "Rafael Prado",
      phone: "51998765432",
    });
    const existingConversation = await whatsappRepo.insertConversation("acc-1", {
      contactId: existingContact.id,
      contactName: existingContact.name,
      contactPhone: existingContact.phone,
    });

    await handleInboundMessage(whatsappRepo, buildCrmDeps(crmRepo), "acc-1", {
      fromPhone: "51998765432",
      body: "Posso remarcar?",
    });

    const contacts = await crmRepo.searchContacts("acc-1", "Rafael");
    expect(contacts).toHaveLength(1);

    const conversation = await whatsappRepo.getConversation("acc-1", existingConversation.id);
    expect(conversation?.unreadCount).toBe(1);

    const messages = await whatsappRepo.listMessages("acc-1", existingConversation.id);
    expect(messages).toHaveLength(1);
  });

  it("falls back to the phone number as the contact name when none is given", async () => {
    const whatsappRepo = createInMemoryWhatsappRepository();
    const crmRepo = createInMemoryCrmRepository();

    await handleInboundMessage(whatsappRepo, buildCrmDeps(crmRepo), "acc-1", {
      fromPhone: "51999998888",
      body: "Oi",
    });

    const contacts = await crmRepo.searchContacts("acc-1", "51999998888");
    expect(contacts[0].name).toBe("51999998888");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/whatsapp/service.test.ts`
Expected: FAIL — `handleInboundMessage is not a function` (not exported yet). Some existing tests in this file may also fail to compile until Step 3 lands — that's expected mid-step.

- [ ] **Step 3: Implement `handleInboundMessage`**

In `src/modules/whatsapp/service.ts`, add:

```typescript
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
  input: { fromPhone: string; fromName?: string; body: string },
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
  }

  const message = await whatsappRepo.insertMessage(accountId, conversation.id, {
    direction: "inbound",
    body: input.body,
  });
  await whatsappRepo.touchConversation(accountId, conversation.id, input.body, message.sentAt);
  await whatsappRepo.incrementUnreadCount(accountId, conversation.id);

  return message;
}
```

Add the `WhatsappRepository` type import at the top of the file if not already present:

```typescript
import type { WhatsappRepository } from "./repository";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/whatsapp/service.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones)

- [ ] **Step 5: Run full suite and typecheck**

```bash
npm run test
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/whatsapp/service.ts src/modules/whatsapp/service.test.ts
git commit -m "feat(whatsapp): add handleInboundMessage (auto-creates contact/lead for unknown numbers)"
```

---

### Task 7: Webhook route handler

**Files:**
- Create: `src/lib/supabase/service-role.ts`
- Create: `src/app/api/whatsapp/webhook/[accountId]/route.ts`

**Interfaces:**
- Produces (`service-role.ts`): `createServiceRoleSupabaseClient(): SupabaseClient<Database>` — uses `SUPABASE_SERVICE_ROLE_KEY` (server-only env var, no `NEXT_PUBLIC_` prefix), bypasses RLS.
- Consumes: `handleInboundMessage` from Task 6, `crm.findContactByPhone`/`crm.createContact` from Task 2, `createSupabaseWhatsappRepository`/`createSupabaseCrmRepository` (pre-existing).

This task has no automated test — Next.js route handlers aren't unit-tested elsewhere in this repo (no request/response mocking infrastructure exists), and the actual business logic is already covered by Task 6's tests. This task is wiring; verify manually per Step 4.

- [ ] **Step 1: Write the service-role Supabase client**

```typescript
// src/lib/supabase/service-role.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function createServiceRoleSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
```

- [ ] **Step 2: Add the env var placeholder**

If `.env.local` exists, add a line (leave the value blank or add the real key if you have it):

```
SUPABASE_SERVICE_ROLE_KEY=
```

Do not commit `.env.local` (it should already be gitignored — verify with `git status` that it doesn't appear).

- [ ] **Step 3: Write the webhook route**

```typescript
// src/app/api/whatsapp/webhook/[accountId]/route.ts
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
  const body = await request.json();

  const fromPhone = typeof body.fromPhone === "string" ? body.fromPhone : null;
  const messageBody = typeof body.body === "string" ? body.body : null;
  if (!fromPhone || !messageBody) {
    return NextResponse.json({ error: "fromPhone e body são obrigatórios" }, { status: 400 });
  }
  const fromName = typeof body.fromName === "string" ? body.fromName : undefined;

  const supabase = createServiceRoleSupabaseClient();
  const whatsappRepo = createSupabaseWhatsappRepository(supabase);
  const crmRepo = createSupabaseCrmRepository(supabase);

  const message = await whatsapp.handleInboundMessage(
    whatsappRepo,
    {
      findContactByPhone: (accId, phone) => crm.findContactByPhone(crmRepo, accId, phone),
      createContact: (accId, input) => crm.createContact(crmRepo, accId, input),
    },
    accountId,
    { fromPhone, fromName, body: messageBody },
  );

  return NextResponse.json({ ok: true, messageId: message.id });
}
```

- [ ] **Step 4: Manual verification (requires `SUPABASE_SERVICE_ROLE_KEY` set)**

Find a real account ID (from the `accounts` table, e.g. via Supabase dashboard or `select id from accounts;`), then with the dev server running:

```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook/<accountId> \
  -H "Content-Type: application/json" \
  -d '{"fromPhone": "51991234477", "fromName": "Teste Curl", "body": "Mensagem de teste"}'
```

Expected: `{"ok":true,"messageId":"..."}`, and a new conversation with "Teste Curl" appears in the WhatsApp inbox UI with an unread badge. If `SUPABASE_SERVICE_ROLE_KEY` isn't set yet, this step will fail at runtime with an auth error — that's expected; note it in the completion summary rather than skipping silently, and revisit once the key is available.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/service-role.ts "src/app/api/whatsapp/webhook/[accountId]/route.ts"
git commit -m "feat(whatsapp): add inbound webhook route"
```

---

### Task 8: Outbound send — wire the provider into `logMessage`

**Files:**
- Modify: `src/modules/whatsapp/service.ts`
- Modify: `src/app/(app)/whatsapp/actions.ts`
- Test: `src/modules/whatsapp/service.test.ts`

**Interfaces:**
- Changes: `logMessage(repo: WhatsappRepository, provider: WhatsappProvider, accountId: string, conversationId: string, rawInput: unknown): Promise<Message>` — signature gains a `provider` parameter (was `logMessage(repo, accountId, conversationId, rawInput)`).
- Consumes: `WhatsappProvider.sendMessage` from Task 5.

- [ ] **Step 1: Update the existing tests for the new signature and write the new test**

In `src/modules/whatsapp/service.test.ts`, add the fake-provider import:

```typescript
import { createFakeWhatsappProvider } from "./provider.fake";
```

Replace the two existing tests in the top-level `describe("whatsapp service", ...)` block:

```typescript
  it("rejects logging a message on a conversation that doesn't exist", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    await expect(
      logMessage(repo, provider, "acc-1", "does-not-exist", { direction: "outbound", body: "oi" }),
    ).rejects.toThrow("Conversa não encontrada");
  });

  it("updates the conversation preview when a message is logged", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    await logMessage(repo, provider, "acc-1", conversation.id, {
      direction: "outbound",
      body: "Confirmado!",
    });
    const messages = await getConversationMessages(repo, "acc-1", conversation.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe("Confirmado!");
  });

  it("calls the provider to send an outbound message before logging it", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });

    const sendSpy = vi.spyOn(provider, "sendMessage");

    await logMessage(repo, provider, "acc-1", conversation.id, {
      direction: "outbound",
      body: "Confirmado!",
    });

    expect(sendSpy).toHaveBeenCalledWith("acc-1", "51991234477", "Confirmado!");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/whatsapp/service.test.ts`
Expected: FAIL — `logMessage` still takes 4 args, not 5; the new test fails because `sendMessage` is never called.

- [ ] **Step 3: Update `logMessage`**

In `src/modules/whatsapp/service.ts`, replace the existing `logMessage` function:

```typescript
export async function logMessage(
  repo: WhatsappRepository,
  provider: WhatsappProvider,
  accountId: string,
  conversationId: string,
  rawInput: unknown,
) {
  const input = logMessageInputSchema.parse(rawInput);
  const conversation = await repo.getConversation(accountId, conversationId);
  if (!conversation) throw new Error("Conversa não encontrada");

  if (input.direction === "outbound") {
    await provider.sendMessage(accountId, conversation.contactPhone, input.body);
  }

  const message = await repo.insertMessage(accountId, conversationId, input);
  await repo.touchConversation(accountId, conversationId, input.body, message.sentAt);
  return message;
}
```

Add the `WhatsappProvider` type import at the top of the file:

```typescript
import type { WhatsappProvider } from "./provider";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/whatsapp/service.test.ts`
Expected: PASS

- [ ] **Step 5: Update the action to build and pass the provider**

In `src/app/(app)/whatsapp/actions.ts`, add the import:

```typescript
import { getWhatsappProvider } from "@/modules/whatsapp/provider";
```

Replace `logMessageAction`:

```typescript
export async function logMessageAction(conversationId: string, input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const provider = getWhatsappProvider("fake", repo);
  const message = await whatsapp.logMessage(repo, provider, accountId, conversationId, input);
  revalidatePath("/whatsapp");
  return message;
}
```

- [ ] **Step 6: Run full suite, typecheck, lint**

```bash
npm run test
npx tsc --noEmit
npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/whatsapp/service.ts src/modules/whatsapp/service.test.ts "src/app/(app)/whatsapp/actions.ts"
git commit -m "feat(whatsapp): send outbound messages through the provider adapter"
```

---

### Task 9: Connection status service functions and actions

**Files:**
- Modify: `src/modules/whatsapp/service.ts`
- Modify: `src/app/(app)/whatsapp/actions.ts`
- Test: `src/modules/whatsapp/service.test.ts`

**Interfaces:**
- Produces: `getConnectionStatus(provider: WhatsappProvider, accountId: string): Promise<ConnectionStatus>`, `connectWhatsapp(provider: WhatsappProvider, accountId: string): Promise<void>`, `disconnectWhatsapp(provider: WhatsappProvider, accountId: string): Promise<void>`, `resetUnreadCount(repo: WhatsappRepository, accountId: string, conversationId: string): Promise<void>`.
- Produces (actions): `getConnectionStatusAction(): Promise<ConnectionStatus>`, `connectWhatsappAction(): Promise<void>`, `disconnectWhatsappAction(): Promise<void>`, `resetUnreadCountAction(conversationId: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/whatsapp/service.test.ts`:

```typescript
describe("connection status", () => {
  it("connects, reports connected, then disconnects", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);

    expect(await getConnectionStatus(provider, "acc-1")).toBe("disconnected");
    await connectWhatsapp(provider, "acc-1");
    expect(await getConnectionStatus(provider, "acc-1")).toBe("connected");
    await disconnectWhatsapp(provider, "acc-1");
    expect(await getConnectionStatus(provider, "acc-1")).toBe("disconnected");
  });
});

describe("resetUnreadCount", () => {
  it("zeroes the unread count for a conversation", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    await repo.incrementUnreadCount("acc-1", conversation.id);

    await resetUnreadCount(repo, "acc-1", conversation.id);

    const updated = await repo.getConversation("acc-1", conversation.id);
    expect(updated?.unreadCount).toBe(0);
  });
});
```

Update the import line at the top of the file to include the four new functions:

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
} from "./service";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/whatsapp/service.test.ts`
Expected: FAIL — the four functions aren't exported yet.

- [ ] **Step 3: Implement the service functions**

In `src/modules/whatsapp/service.ts`, add:

```typescript
export async function getConnectionStatus(provider: WhatsappProvider, accountId: string) {
  return provider.getConnectionStatus(accountId);
}

export async function connectWhatsapp(provider: WhatsappProvider, accountId: string) {
  await provider.connect(accountId);
}

export async function disconnectWhatsapp(provider: WhatsappProvider, accountId: string) {
  await provider.disconnect(accountId);
}

export async function resetUnreadCount(
  repo: WhatsappRepository,
  accountId: string,
  conversationId: string,
) {
  await repo.resetUnreadCount(accountId, conversationId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/whatsapp/service.test.ts`
Expected: PASS

- [ ] **Step 5: Add the actions**

In `src/app/(app)/whatsapp/actions.ts`, add:

```typescript
export async function getConnectionStatusAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const provider = getWhatsappProvider("fake", repo);
  return whatsapp.getConnectionStatus(provider, accountId);
}

export async function connectWhatsappAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const provider = getWhatsappProvider("fake", repo);
  await whatsapp.connectWhatsapp(provider, accountId);
  revalidatePath("/whatsapp");
}

export async function disconnectWhatsappAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const provider = getWhatsappProvider("fake", repo);
  await whatsapp.disconnectWhatsapp(provider, accountId);
  revalidatePath("/whatsapp");
}

export async function resetUnreadCountAction(conversationId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  await whatsapp.resetUnreadCount(repo, accountId, conversationId);
  revalidatePath("/whatsapp");
}
```

- [ ] **Step 6: Run full suite and typecheck**

```bash
npm run test
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/whatsapp/service.ts src/modules/whatsapp/service.test.ts "src/app/(app)/whatsapp/actions.ts"
git commit -m "feat(whatsapp): add connection status and mark-as-read service functions"
```

---

### Task 10: UI — connection status badge and mark-as-read

**Files:**
- Modify: `src/components/whatsapp/whatsapp-client.tsx`

**Interfaces:** None new — consumes `getConnectionStatusAction`, `connectWhatsappAction`, `disconnectWhatsappAction`, `resetUnreadCountAction` from Task 9.

- [ ] **Step 1: Import the new actions and type**

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
} from "@/app/(app)/whatsapp/actions";
import type { Conversation, Message, ConnectionStatus } from "@/modules/whatsapp/types";
```

(replace the existing `import type { Conversation, Message } from "@/modules/whatsapp/types";` line with the one above)

- [ ] **Step 2: Add connection status state and handlers**

In `WhatsappClient`, add after the existing `sendError` state declaration:

```typescript
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [togglingConnection, setTogglingConnection] = useState(false);

  useEffect(() => {
    getConnectionStatusAction().then(setConnectionStatus);
  }, []);

  async function handleToggleConnection() {
    setTogglingConnection(true);
    try {
      if (connectionStatus === "connected") {
        await disconnectWhatsappAction();
      } else {
        await connectWhatsappAction();
      }
      setConnectionStatus(await getConnectionStatusAction());
    } finally {
      setTogglingConnection(false);
    }
  }
```

- [ ] **Step 3: Replace the hardcoded "Conectado" badge**

Replace:

```tsx
      <div className="flex items-center justify-between gap-2">
        <Badge className="bg-[#25D366]/10 text-[#188a44]">Conectado</Badge>
        <NewConversationDialog onCreated={handleConversationCreated} />
      </div>
```

with:

```tsx
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            className={
              connectionStatus === "connected"
                ? "bg-[#25D366]/10 text-[#188a44]"
                : "bg-muted text-muted-foreground"
            }
          >
            {connectionStatus === "connected" ? "Conectado" : "Desconectado"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={togglingConnection}
            onClick={handleToggleConnection}
          >
            {connectionStatus === "connected" ? "Desconectar" : "Conectar"}
          </Button>
        </div>
        <NewConversationDialog onCreated={handleConversationCreated} />
      </div>
```

- [ ] **Step 4: Mark conversation as read when opened**

Replace the message-loading effect:

```typescript
  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    setMessagesError(null);
    getConversationMessagesAction(selectedConversationId)
      .then((data) => {
        if (!cancelled) setMessages(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setMessagesError(
            err instanceof Error ? err.message : "Erro ao carregar mensagens",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedConversationId]);
```

with:

```typescript
  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    setMessagesError(null);
    (async () => {
      try {
        const data = await getConversationMessagesAction(selectedConversationId);
        if (cancelled) return;
        setMessages(data);
        await resetUnreadCountAction(selectedConversationId);
        if (cancelled) return;
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedConversationId ? { ...c, unreadCount: 0 } : c)),
        );
      } catch (err) {
        if (!cancelled) {
          setMessagesError(err instanceof Error ? err.message : "Erro ao carregar mensagens");
        }
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedConversationId]);
```

- [ ] **Step 5: Run full suite, typecheck, lint**

```bash
npm run test
npx tsc --noEmit
npm run lint
```

Expected: all pass; lint stays at the same 13 pre-existing errors (no new ones — the new async work is inside an IIFE inside the effect, not a synchronous `setState` call in the effect body, matching the pattern already used elsewhere in this same file).

- [ ] **Step 6: Visual verification**

```bash
agent-browser open http://localhost:3000/whatsapp
agent-browser wait --load networkidle
agent-browser wait 500
agent-browser screenshot task10-whatsapp-connection.png
```

Read the screenshot: badge should show "Desconectado" with a "Conectar" button initially. Click "Conectar" (via `agent-browser find role button click --name "Conectar"`), re-screenshot, and confirm it flips to "Conectado" / "Desconectar". If a conversation has an unread badge (from Task 7's webhook test), clicking it should make the unread count disappear.

- [ ] **Step 7: Commit**

```bash
git add src/components/whatsapp/whatsapp-client.tsx
git commit -m "feat(whatsapp): show real connection status and mark conversations as read"
```
