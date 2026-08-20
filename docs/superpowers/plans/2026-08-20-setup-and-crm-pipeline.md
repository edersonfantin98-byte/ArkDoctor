# Setup + CRM/Pipeline (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the ArkDoctor Next.js project on the agreed stack and implement the CRM/Pipeline module end-to-end (contacts, configurable pipeline stages, deals, kanban UI) as the first working, deployable slice of the product.

**Architecture:** Next.js App Router + TypeScript, Tailwind + shadcn/ui for UI, Supabase (Postgres + Auth) for data/auth with RLS enforced by `account_id`. The CRM module is built as: domain types → a `CrmRepository` interface with an in-memory implementation for fast unit tests → a `service` layer holding business rules (validated with Zod, tested against the in-memory repository) → a `SupabaseCrmRepository` implementation → thin Next.js Server Actions wiring the authenticated account to the service layer → UI (kanban with `dnd-kit`, search, dialogs, panels). This lets all business-rule tests (Vitest) run fast with no live database, per the PRD's testing decisions.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS + shadcn/ui, `@supabase/supabase-js` + `@supabase/ssr`, Zod, `dnd-kit`, Vitest + React Testing Library, Cloudflare Pages via OpenNext adapter.

**Spec:**
- `docs/superpowers/specs/2026-08-20-arkdoctor-arquitetura-design.md` (shared architecture/setup)
- `docs/superpowers/specs/2026-08-20-arkdoctor-crm-pipeline-design.md` (CRM/Pipeline, Fase 1)

## Global Constraints

- All domain tables carry `account_id` and are protected by Row Level Security policies of the form `account_id IN (SELECT account_id FROM account_users WHERE user_id = auth.uid())` (arquitetura spec).
- No self-service signup/password-reset UI — only a login page (arquitetura spec).
- No ORM — data access goes through the Supabase JS client, wrapped by `modules/crm`'s repository (arquitetura spec + CRM spec).
- Migrations are hand-written SQL files under `supabase/migrations/`, applied via the Supabase CLI (arquitetura spec).
- Each domain module (`modules/<name>`) owns its tables; other modules call its exported functions, never its tables directly (arquitetura spec).
- Every account has, from creation, the 6 default pipeline stages: Novo Lead, Em Negociação, Agendado, Atendido (kind `normal`), Follow-up (kind `follow_up`), Perdido (kind `lost`) (CRM spec).
- `follow_up` and `lost` stages always exist, are always last in `position` order, and can only be renamed — never reordered, created again, or deleted. `normal` stages can be created, renamed, reordered, and deleted (CRM spec).
- Deleting a `normal` stage is blocked if any open Deal (`closed_at IS NULL`) is in it (CRM spec).
- A Contact has at most one open Deal at a time (CRM spec).
- Moving a Deal into a `kind = 'lost'` stage sets `closed_at = now()`; moving it out of `lost` clears `closed_at` (implicit reopen). Moving a Deal to the stage it's already in is a no-op — no history row is written (CRM spec).
- `deal_stage_history` rows are never deleted, including for closed Deals (CRM spec).

---

## Part A — Project Setup

### Task 1: Scaffold Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.eslintrc` (or `eslint.config.mjs`), `.gitignore`

**Interfaces:**
- Produces: `src/app/` as the App Router root; `@/*` import alias resolving to `src/*`.

- [ ] **Step 1: Run the Next.js scaffolder**

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --eslint --use-npm
```

The directory already has `CLAUDE.md`, `docs/`, `.git/`, `.claude/`. If the CLI warns about a non-empty directory, confirm to proceed — it only writes new files and won't touch the existing ones.

- [ ] **Step 2: Verify the dev server boots**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000` with no errors in the terminal. Stop it (Ctrl+C) once confirmed.

- [ ] **Step 3: Verify the production build works**

Run: `npm run build`
Expected: build completes with exit code 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project"
```

---

### Task 2: Install and configure shadcn/ui

**Files:**
- Create: `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/label.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/card.tsx`

**Interfaces:**
- Produces: `cn()` helper in `src/lib/utils.ts`; shadcn primitives under `src/components/ui/*` used by all later UI tasks.

- [ ] **Step 1: Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
```

Expected: creates `components.json` and `src/lib/utils.ts` with no prompts (defaults accepted via `-d`).

- [ ] **Step 2: Add the components this plan needs**

```bash
npx shadcn@latest add button input textarea label dialog card
```

Expected: `src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `dialog.tsx`, `card.tsx` created.

- [ ] **Step 3: Verify the build still passes**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add shadcn/ui components"
```

---

### Task 3: Configure Vitest and React Testing Library

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `src/lib/utils.test.ts`
- Modify: `package.json` (add `test` script and devDependencies)

**Interfaces:**
- Produces: `npm test` running Vitest once; `npm run test:watch` for watch mode.

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add test scripts to `package.json`**

Add under `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a smoke test**

Create `src/lib/utils.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });
});
```

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: configure Vitest and React Testing Library"
```

---

### Task 4: Supabase client scaffolding

**Files:**
- Create: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `.env.local.example`
- Modify: `.gitignore` (ensure `.env.local` is ignored — `create-next-app` already adds this, verify)

**Interfaces:**
- Produces: `createBrowserSupabaseClient()` (client components), `createServerSupabaseClient()` (Server Components/Actions, async — reads/writes cookies), both typed with the (not-yet-generated) `Database` type from `src/lib/supabase/database.types.ts` (created in Task 6).

- [ ] **Step 1: Install Supabase packages**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Create `.env.local.example`**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 3: Create a placeholder `Database` type**

Create `src/lib/supabase/database.types.ts`:

```typescript
// Regenerated in Task 6 via `supabase gen types typescript` once migrations exist.
export type Database = Record<string, unknown>;
```

- [ ] **Step 4: Create the browser client**

Create `src/lib/supabase/browser.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 5: Create the server client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component with no request context to write to — safe to ignore.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 6: Verify the build still passes**

Run: `npm run build`
Expected: exit code 0 (env vars are only read at request time, so a build with empty values still succeeds).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add Supabase client scaffolding"
```

---

### Task 5: Baseline migration — accounts, users, RLS helper

**Files:**
- Create: `supabase/migrations/0001_accounts.sql`

**Interfaces:**
- Produces: `accounts` and `account_users` tables, used by every later migration's RLS policies.

- [ ] **Step 1: Install the Supabase CLI if not already available**

Run: `npx supabase --version`
Expected: prints a version. If not found, `npm install -D supabase` and re-run via `npx supabase --version`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0001_accounts.sql`:

```sql
create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table account_users (
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  primary key (account_id, user_id)
);

alter table accounts enable row level security;
alter table account_users enable row level security;

create policy "account members can read their account"
  on accounts for select
  using (id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can read their membership rows"
  on account_users for select
  using (user_id = auth.uid());
```

- [ ] **Step 3: Apply the migration against the linked Supabase project**

Run: `npx supabase link --project-ref <your-project-ref>` (once, if not already linked), then `npx supabase db push`
Expected: CLI reports the migration applied with no errors.

- [ ] **Step 4: Verify the tables exist**

Run: `npx supabase db execute --sql "select table_name from information_schema.tables where table_name in ('accounts', 'account_users');"` (or run the same query in the Supabase SQL editor)
Expected: both table names returned.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): add accounts and account_users tables with RLS"
```

---

### Task 6: CRM migration — contacts, pipeline_stages, deals, deal_stage_history

**Files:**
- Create: `supabase/migrations/0002_crm.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated, no longer a placeholder)

**Interfaces:**
- Produces: `contacts`, `pipeline_stages`, `deals`, `deal_stage_history` tables with RLS; a `seed_default_pipeline_stages(account_id uuid)` SQL function used when an account is created.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0002_crm.sql`:

```sql
create table contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  phone text not null,
  origin text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type pipeline_stage_kind as enum ('normal', 'follow_up', 'lost');

create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  kind pipeline_stage_kind not null default 'normal',
  position integer not null
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  stage_id uuid not null references pipeline_stages(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  from_stage_id uuid references pipeline_stages(id),
  to_stage_id uuid not null references pipeline_stages(id),
  moved_at timestamptz not null default now()
);

alter table contacts enable row level security;
alter table pipeline_stages enable row level security;
alter table deals enable row level security;
alter table deal_stage_history enable row level security;

create policy "account members can manage contacts"
  on contacts for all
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage pipeline_stages"
  on pipeline_stages for all
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage deals"
  on deals for all
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage deal_stage_history"
  on deal_stage_history for all
  using (
    deal_id in (
      select id from deals where account_id in (
        select account_id from account_users where user_id = auth.uid()
      )
    )
  )
  with check (
    deal_id in (
      select id from deals where account_id in (
        select account_id from account_users where user_id = auth.uid()
      )
    )
  );

create function seed_default_pipeline_stages(target_account_id uuid)
returns void
language sql
as $$
  insert into pipeline_stages (account_id, name, kind, position) values
    (target_account_id, 'Novo Lead', 'normal', 0),
    (target_account_id, 'Em Negociação', 'normal', 1),
    (target_account_id, 'Agendado', 'normal', 2),
    (target_account_id, 'Atendido', 'normal', 3),
    (target_account_id, 'Follow-up', 'follow_up', 4),
    (target_account_id, 'Perdido', 'lost', 5);
$$;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: CLI reports the migration applied with no errors.

- [ ] **Step 3: Verify the tables and function exist**

Run: `npx supabase db execute --sql "select table_name from information_schema.tables where table_name in ('contacts', 'pipeline_stages', 'deals', 'deal_stage_history');"`
Expected: all four table names returned.

- [ ] **Step 4: Regenerate the TypeScript types**

Run: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
Expected: file is rewritten with real `Database` types (no longer the Task 4 placeholder); `npm run build` still exits 0.

- [ ] **Step 5: Write the manual account-provisioning script**

The architecture spec's auth flow has the developer create each Supabase Auth user manually, then create the matching `Account` + `account_users` row + seed the account's default pipeline stages. Create `supabase/seed_account.sql` as a copy-paste template for that one-off, per-account setup:

```sql
-- Run manually once per new account, after creating the user in the Supabase Auth dashboard.
-- Replace the two placeholders below, then run this whole file in the Supabase SQL editor.

with new_account as (
  insert into accounts (name) values ('<nome da clínica/profissional>') returning id
)
insert into account_users (account_id, user_id, role)
select id, '<auth-user-uuid-do-painel-supabase>', 'owner' from new_account;

select seed_default_pipeline_stages(
  (select account_id from account_users order by account_id desc limit 1)
);
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add CRM tables with RLS and manual account-provisioning seed script"
```

---

## Part B — CRM Domain Logic (TDD, no live database)

### Task 7: CRM domain types and validation schemas

**Files:**
- Create: `src/modules/crm/types.ts`, `src/modules/crm/schemas.ts`

**Interfaces:**
- Produces: `StageKind`, `PipelineStage`, `Contact`, `Deal`, `DealStageHistoryEntry`, `DealWithContact` types; `createContactInputSchema`, `updateContactInputSchema` Zod schemas — consumed by every later CRM task.

- [ ] **Step 1: Install Zod**

```bash
npm install zod
```

- [ ] **Step 2: Write the domain types**

Create `src/modules/crm/types.ts`:

```typescript
export type StageKind = "normal" | "follow_up" | "lost";

export interface PipelineStage {
  id: string;
  accountId: string;
  name: string;
  kind: StageKind;
  position: number;
}

export interface Contact {
  id: string;
  accountId: string;
  name: string;
  phone: string;
  origin: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Deal {
  id: string;
  accountId: string;
  contactId: string;
  stageId: string;
  createdAt: string;
  closedAt: string | null;
}

export interface DealStageHistoryEntry {
  id: string;
  dealId: string;
  fromStageId: string | null;
  toStageId: string;
  movedAt: string;
}

export interface DealWithContact extends Deal {
  contact: Contact;
}
```

- [ ] **Step 3: Write the validation schemas**

Create `src/modules/crm/schemas.ts`:

```typescript
import { z } from "zod";

export const createContactInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  phone: z.string().trim().min(8, "Telefone inválido"),
  origin: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
});

export type CreateContactInput = z.infer<typeof createContactInputSchema>;

export const updateContactInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(8).optional(),
  origin: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

export type UpdateContactInput = z.infer<typeof updateContactInputSchema>;
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(crm): add domain types and validation schemas"
```

---

### Task 8: CrmRepository interface and in-memory implementation

**Files:**
- Create: `src/modules/crm/repository.ts`, `src/modules/crm/repository.memory.ts`, `src/modules/crm/repository.memory.test.ts`

**Interfaces:**
- Consumes: types from `src/modules/crm/types.ts` (Task 7).
- Produces: `CrmRepository` interface and `createInMemoryCrmRepository()` factory — consumed by every service task (9–14) as their data-access dependency.

- [ ] **Step 1: Write the failing test for the in-memory repository's core round-trip**

Create `src/modules/crm/repository.memory.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createInMemoryCrmRepository } from "./repository.memory";

describe("createInMemoryCrmRepository", () => {
  it("seeds the 6 default stages for an account and returns them ordered by position", async () => {
    const repo = createInMemoryCrmRepository();
    const stages = await repo.getStages("acc-1");

    expect(stages.map((s) => s.name)).toEqual([
      "Novo Lead",
      "Em Negociação",
      "Agendado",
      "Atendido",
      "Follow-up",
      "Perdido",
    ]);
    expect(stages.map((s) => s.kind)).toEqual([
      "normal",
      "normal",
      "normal",
      "normal",
      "follow_up",
      "lost",
    ]);
  });

  it("inserts and retrieves a contact scoped to its account", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await repo.insertContact("acc-1", { name: "Ana", phone: "11999990000" });

    expect(contact.name).toBe("Ana");
    expect(contact.accountId).toBe("acc-1");

    const found = await repo.searchContacts("acc-1", "Ana");
    expect(found).toHaveLength(1);

    const foundOtherAccount = await repo.searchContacts("acc-2", "Ana");
    expect(foundOtherAccount).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- repository.memory`
Expected: FAIL — `./repository.memory` module not found.

- [ ] **Step 3: Write the `CrmRepository` interface**

Create `src/modules/crm/repository.ts`:

```typescript
import type {
  Contact,
  Deal,
  DealStageHistoryEntry,
  DealWithContact,
  PipelineStage,
} from "./types";

export interface CrmRepository {
  getStages(accountId: string): Promise<PipelineStage[]>;
  getStage(accountId: string, stageId: string): Promise<PipelineStage | null>;
  insertStage(accountId: string, name: string, position: number): Promise<PipelineStage>;
  renameStage(accountId: string, stageId: string, name: string): Promise<PipelineStage>;
  reorderNormalStages(accountId: string, orderedIds: string[]): Promise<void>;
  deleteStage(accountId: string, stageId: string): Promise<void>;
  countOpenDealsInStage(accountId: string, stageId: string): Promise<number>;

  insertContact(
    accountId: string,
    input: { name: string; phone: string; origin?: string; notes?: string },
  ): Promise<Contact>;
  updateContact(
    accountId: string,
    contactId: string,
    input: { name?: string; phone?: string; origin?: string | null; notes?: string | null },
  ): Promise<Contact>;
  searchContacts(accountId: string, query: string): Promise<Contact[]>;

  insertDeal(accountId: string, contactId: string, stageId: string): Promise<Deal>;
  getDeal(accountId: string, dealId: string): Promise<Deal | null>;
  getOpenDealForContact(accountId: string, contactId: string): Promise<Deal | null>;
  getDealsForContact(accountId: string, contactId: string): Promise<Deal[]>;
  updateDealStage(
    accountId: string,
    dealId: string,
    stageId: string,
    closedAt: string | null,
  ): Promise<Deal>;
  getDealsWithContactsByStage(accountId: string): Promise<Map<string, DealWithContact[]>>;

  insertDealHistory(
    dealId: string,
    fromStageId: string | null,
    toStageId: string,
  ): Promise<DealStageHistoryEntry>;
  getDealHistory(dealId: string): Promise<DealStageHistoryEntry[]>;
}
```

- [ ] **Step 4: Write the in-memory implementation**

Create `src/modules/crm/repository.memory.ts`:

```typescript
import type { CrmRepository } from "./repository";
import type {
  Contact,
  Deal,
  DealStageHistoryEntry,
  DealWithContact,
  PipelineStage,
  StageKind,
} from "./types";

const DEFAULT_STAGES: { name: string; kind: StageKind }[] = [
  { name: "Novo Lead", kind: "normal" },
  { name: "Em Negociação", kind: "normal" },
  { name: "Agendado", kind: "normal" },
  { name: "Atendido", kind: "normal" },
  { name: "Follow-up", kind: "follow_up" },
  { name: "Perdido", kind: "lost" },
];

export function createInMemoryCrmRepository(): CrmRepository {
  const stages = new Map<string, PipelineStage>();
  const contacts = new Map<string, Contact>();
  const deals = new Map<string, Deal>();
  const history: DealStageHistoryEntry[] = [];
  const seededAccounts = new Set<string>();

  function ensureSeeded(accountId: string) {
    if (seededAccounts.has(accountId)) return;
    seededAccounts.add(accountId);
    DEFAULT_STAGES.forEach((stage, index) => {
      const id = crypto.randomUUID();
      stages.set(id, { id, accountId, name: stage.name, kind: stage.kind, position: index });
    });
  }

  function stagesForAccount(accountId: string): PipelineStage[] {
    ensureSeeded(accountId);
    return [...stages.values()]
      .filter((s) => s.accountId === accountId)
      .sort((a, b) => a.position - b.position);
  }

  return {
    async getStages(accountId) {
      return stagesForAccount(accountId);
    },

    async getStage(accountId, stageId) {
      const stage = stages.get(stageId);
      return stage && stage.accountId === accountId ? stage : null;
    },

    async insertStage(accountId, name, position) {
      ensureSeeded(accountId);
      const id = crypto.randomUUID();
      const stage: PipelineStage = { id, accountId, name, kind: "normal", position };
      stages.set(id, stage);
      return stage;
    },

    async renameStage(accountId, stageId, name) {
      const stage = stages.get(stageId);
      if (!stage || stage.accountId !== accountId) throw new Error("Stage not found");
      const updated = { ...stage, name };
      stages.set(stageId, updated);
      return updated;
    },

    async reorderNormalStages(accountId, orderedIds) {
      orderedIds.forEach((id, index) => {
        const stage = stages.get(id);
        if (!stage || stage.accountId !== accountId || stage.kind !== "normal") {
          throw new Error("Invalid stage in reorder list");
        }
        stages.set(id, { ...stage, position: index });
      });
    },

    async deleteStage(accountId, stageId) {
      const stage = stages.get(stageId);
      if (!stage || stage.accountId !== accountId) throw new Error("Stage not found");
      stages.delete(stageId);
    },

    async countOpenDealsInStage(accountId, stageId) {
      return [...deals.values()].filter(
        (d) => d.accountId === accountId && d.stageId === stageId && d.closedAt === null,
      ).length;
    },

    async insertContact(accountId, input) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const contact: Contact = {
        id,
        accountId,
        name: input.name,
        phone: input.phone,
        origin: input.origin ?? null,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      contacts.set(id, contact);
      return contact;
    },

    async updateContact(accountId, contactId, input) {
      const contact = contacts.get(contactId);
      if (!contact || contact.accountId !== accountId) throw new Error("Contact not found");
      const updated: Contact = {
        ...contact,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.origin !== undefined ? { origin: input.origin } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedAt: new Date().toISOString(),
      };
      contacts.set(contactId, updated);
      return updated;
    },

    async searchContacts(accountId, query) {
      const q = query.trim().toLowerCase();
      return [...contacts.values()].filter(
        (c) =>
          c.accountId === accountId &&
          (c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)),
      );
    },

    async insertDeal(accountId, contactId, stageId) {
      const id = crypto.randomUUID();
      const deal: Deal = {
        id,
        accountId,
        contactId,
        stageId,
        createdAt: new Date().toISOString(),
        closedAt: null,
      };
      deals.set(id, deal);
      return deal;
    },

    async getDeal(accountId, dealId) {
      const deal = deals.get(dealId);
      return deal && deal.accountId === accountId ? deal : null;
    },

    async getOpenDealForContact(accountId, contactId) {
      return (
        [...deals.values()].find(
          (d) => d.accountId === accountId && d.contactId === contactId && d.closedAt === null,
        ) ?? null
      );
    },

    async getDealsForContact(accountId, contactId) {
      return [...deals.values()].filter(
        (d) => d.accountId === accountId && d.contactId === contactId,
      );
    },

    async updateDealStage(accountId, dealId, stageId, closedAt) {
      const deal = deals.get(dealId);
      if (!deal || deal.accountId !== accountId) throw new Error("Deal not found");
      const updated: Deal = { ...deal, stageId, closedAt };
      deals.set(dealId, updated);
      return updated;
    },

    async getDealsWithContactsByStage(accountId) {
      const result = new Map<string, DealWithContact[]>();
      for (const deal of deals.values()) {
        if (deal.accountId !== accountId) continue;
        const contact = contacts.get(deal.contactId);
        if (!contact) continue;
        const list = result.get(deal.stageId) ?? [];
        list.push({ ...deal, contact });
        result.set(deal.stageId, list);
      }
      return result;
    },

    async insertDealHistory(dealId, fromStageId, toStageId) {
      const entry: DealStageHistoryEntry = {
        id: crypto.randomUUID(),
        dealId,
        fromStageId,
        toStageId,
        movedAt: new Date().toISOString(),
      };
      history.push(entry);
      return entry;
    },

    async getDealHistory(dealId) {
      return history.filter((h) => h.dealId === dealId).sort((a, b) => a.movedAt.localeCompare(b.movedAt));
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- repository.memory`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(crm): add CrmRepository interface and in-memory implementation"
```

---

### Task 9: Service — `createContact`

**Files:**
- Create: `src/modules/crm/service.ts`, `src/modules/crm/service.test.ts`

**Interfaces:**
- Consumes: `CrmRepository` (Task 8), `createContactInputSchema` (Task 7).
- Produces: `createContact(repo: CrmRepository, accountId: string, input: unknown): Promise<Contact>` — used by Task 16 (Server Actions) and reused by the WhatsApp module in a later phase.

- [ ] **Step 1: Write the failing test**

Create `src/modules/crm/service.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createInMemoryCrmRepository } from "./repository.memory";
import { createContact } from "./service";

describe("createContact", () => {
  it("creates a contact and an initial deal in the first stage", async () => {
    const repo = createInMemoryCrmRepository();

    const contact = await createContact(repo, "acc-1", {
      name: "Ana",
      phone: "11999990000",
    });

    expect(contact.name).toBe("Ana");

    const stages = await repo.getStages("acc-1");
    const dealsByStage = await repo.getDealsWithContactsByStage("acc-1");
    const firstStageDeals = dealsByStage.get(stages[0].id) ?? [];

    expect(firstStageDeals).toHaveLength(1);
    expect(firstStageDeals[0].contact.id).toBe(contact.id);
  });

  it("rejects a contact with an empty name", async () => {
    const repo = createInMemoryCrmRepository();

    await expect(
      createContact(repo, "acc-1", { name: "", phone: "11999990000" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- service.test`
Expected: FAIL — `./service` module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `src/modules/crm/service.ts`:

```typescript
import type { CrmRepository } from "./repository";
import { createContactInputSchema } from "./schemas";
import type { Contact } from "./types";

export async function createContact(
  repo: CrmRepository,
  accountId: string,
  rawInput: unknown,
): Promise<Contact> {
  const input = createContactInputSchema.parse(rawInput);
  const contact = await repo.insertContact(accountId, input);

  const stages = await repo.getStages(accountId);
  const firstStage = stages[0];
  const deal = await repo.insertDeal(accountId, contact.id, firstStage.id);
  await repo.insertDealHistory(deal.id, null, firstStage.id);

  return contact;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(crm): add createContact service"
```

---

### Task 10: Service — `searchContacts` and `updateContact`

**Files:**
- Modify: `src/modules/crm/service.ts`, `src/modules/crm/service.test.ts`

**Interfaces:**
- Produces: `searchContacts(repo, accountId, query: string): Promise<Contact[]>`, `updateContact(repo, accountId, contactId, input: unknown): Promise<Contact>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/crm/service.test.ts`:

```typescript
import { searchContacts, updateContact } from "./service";

describe("searchContacts", () => {
  it("matches by partial name and by phone", async () => {
    const repo = createInMemoryCrmRepository();
    await createContact(repo, "acc-1", { name: "Ana Silva", phone: "11999990000" });
    await createContact(repo, "acc-1", { name: "Beatriz", phone: "11988887777" });

    expect(await searchContacts(repo, "acc-1", "ana")).toHaveLength(1);
    expect(await searchContacts(repo, "acc-1", "11988887777")).toHaveLength(1);
    expect(await searchContacts(repo, "acc-1", "carla")).toHaveLength(0);
  });
});

describe("updateContact", () => {
  it("updates the provided fields only", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    const updated = await updateContact(repo, "acc-1", contact.id, { notes: "Prefere manhã" });

    expect(updated.name).toBe("Ana");
    expect(updated.notes).toBe("Prefere manhã");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- service.test`
Expected: FAIL — `searchContacts`/`updateContact` not exported.

- [ ] **Step 3: Implement**

Append to `src/modules/crm/service.ts`:

```typescript
import { updateContactInputSchema } from "./schemas";

export async function searchContacts(
  repo: CrmRepository,
  accountId: string,
  query: string,
): Promise<Contact[]> {
  return repo.searchContacts(accountId, query);
}

export async function updateContact(
  repo: CrmRepository,
  accountId: string,
  contactId: string,
  rawInput: unknown,
): Promise<Contact> {
  const input = updateContactInputSchema.parse(rawInput);
  return repo.updateContact(accountId, contactId, input);
}
```

(Add the `updateContactInputSchema` import next to the existing `createContactInputSchema` import at the top of the file.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(crm): add searchContacts and updateContact services"
```

---

### Task 11: Service — `listPipeline`

**Files:**
- Modify: `src/modules/crm/service.ts`, `src/modules/crm/service.test.ts`

**Interfaces:**
- Produces: `listPipeline(repo, accountId): Promise<{ stage: PipelineStage; deals: DealWithContact[] }[]>` — consumed by the `/pipeline` page (Task 18).

- [ ] **Step 1: Write the failing test**

Append to `src/modules/crm/service.test.ts`:

```typescript
import { listPipeline } from "./service";

describe("listPipeline", () => {
  it("returns every stage in position order, each with its deals", async () => {
    const repo = createInMemoryCrmRepository();
    await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    const pipeline = await listPipeline(repo, "acc-1");

    expect(pipeline).toHaveLength(6);
    expect(pipeline[0].stage.name).toBe("Novo Lead");
    expect(pipeline[0].deals).toHaveLength(1);
    expect(pipeline[1].deals).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- service.test`
Expected: FAIL — `listPipeline` not exported.

- [ ] **Step 3: Implement**

Append to `src/modules/crm/service.ts`:

```typescript
import type { DealWithContact, PipelineStage } from "./types";

export async function listPipeline(
  repo: CrmRepository,
  accountId: string,
): Promise<{ stage: PipelineStage; deals: DealWithContact[] }[]> {
  const stages = await repo.getStages(accountId);
  const dealsByStage = await repo.getDealsWithContactsByStage(accountId);

  return stages.map((stage) => ({
    stage,
    deals: dealsByStage.get(stage.id) ?? [],
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(crm): add listPipeline service"
```

---

### Task 12: Service — `moveDeal`

**Files:**
- Modify: `src/modules/crm/service.ts`, `src/modules/crm/service.test.ts`

**Interfaces:**
- Produces: `moveDeal(repo, accountId, dealId: string, toStageId: string): Promise<Deal>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/crm/service.test.ts`:

```typescript
import { moveDeal } from "./service";

describe("moveDeal", () => {
  async function setup() {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });
    const stages = await repo.getStages("acc-1");
    const dealsByStage = await repo.getDealsWithContactsByStage("acc-1");
    const deal = (dealsByStage.get(stages[0].id) ?? [])[0];
    return { repo, contact, stages, deal };
  }

  it("moves a deal to a new stage and records history", async () => {
    const { repo, stages, deal } = await setup();

    const moved = await moveDeal(repo, "acc-1", deal.id, stages[1].id);

    expect(moved.stageId).toBe(stages[1].id);
    const history = await repo.getDealHistory(deal.id);
    expect(history).toHaveLength(2); // initial creation + this move
    expect(history[1].fromStageId).toBe(stages[0].id);
    expect(history[1].toStageId).toBe(stages[1].id);
  });

  it("is a no-op when moving to the same stage", async () => {
    const { repo, stages, deal } = await setup();

    await moveDeal(repo, "acc-1", deal.id, stages[0].id);

    const history = await repo.getDealHistory(deal.id);
    expect(history).toHaveLength(1); // only the initial creation entry
  });

  it("sets closedAt when the deal enters the lost stage", async () => {
    const { repo, stages, deal } = await setup();
    const lostStage = stages.find((s) => s.kind === "lost")!;

    const moved = await moveDeal(repo, "acc-1", deal.id, lostStage.id);

    expect(moved.closedAt).not.toBeNull();
  });

  it("clears closedAt when the deal leaves the lost stage", async () => {
    const { repo, stages, deal } = await setup();
    const lostStage = stages.find((s) => s.kind === "lost")!;

    await moveDeal(repo, "acc-1", deal.id, lostStage.id);
    const reopened = await moveDeal(repo, "acc-1", deal.id, stages[0].id);

    expect(reopened.closedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- service.test`
Expected: FAIL — `moveDeal` not exported.

- [ ] **Step 3: Implement**

Append to `src/modules/crm/service.ts`:

```typescript
import type { Deal } from "./types";

export async function moveDeal(
  repo: CrmRepository,
  accountId: string,
  dealId: string,
  toStageId: string,
): Promise<Deal> {
  const deal = await repo.getDeal(accountId, dealId);
  if (!deal) throw new Error("Deal not found");

  if (deal.stageId === toStageId) {
    return deal;
  }

  const toStage = await repo.getStage(accountId, toStageId);
  if (!toStage) throw new Error("Stage not found");

  const closedAt = toStage.kind === "lost" ? new Date().toISOString() : null;
  const updated = await repo.updateDealStage(accountId, dealId, toStageId, closedAt);
  await repo.insertDealHistory(dealId, deal.stageId, toStageId);

  return updated;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(crm): add moveDeal service"
```

---

### Task 13: Service — stage management (`createStage`, `renameStage`, `reorderStages`, `deleteStage`)

**Files:**
- Modify: `src/modules/crm/service.ts`, `src/modules/crm/service.test.ts`

**Interfaces:**
- Produces: `createStage(repo, accountId, name: string): Promise<PipelineStage>`, `renameStage(repo, accountId, stageId, name): Promise<PipelineStage>`, `reorderStages(repo, accountId, orderedIds: string[]): Promise<void>`, `deleteStage(repo, accountId, stageId): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/crm/service.test.ts`:

```typescript
import { createStage, deleteStage, moveDeal as moveDealForTest, renameStage, reorderStages } from "./service";

describe("createStage", () => {
  it("appends a new normal stage after the last normal stage, before Follow-up", async () => {
    const repo = createInMemoryCrmRepository();

    const stage = await createStage(repo, "acc-1", "Retorno de Orçamento");

    const stages = await repo.getStages("acc-1");
    const followUpIndex = stages.findIndex((s) => s.kind === "follow_up");
    const newStageIndex = stages.findIndex((s) => s.id === stage.id);

    expect(newStageIndex).toBeLessThan(followUpIndex);
  });
});

describe("renameStage", () => {
  it("renames any stage, including special kinds", async () => {
    const repo = createInMemoryCrmRepository();
    const stages = await repo.getStages("acc-1");
    const lostStage = stages.find((s) => s.kind === "lost")!;

    const renamed = await renameStage(repo, "acc-1", lostStage.id, "Sem Interesse");

    expect(renamed.name).toBe("Sem Interesse");
    expect(renamed.kind).toBe("lost");
  });
});

describe("reorderStages", () => {
  it("rejects a special-kind stage id in the reorder list", async () => {
    const repo = createInMemoryCrmRepository();
    const stages = await repo.getStages("acc-1");
    const lostStage = stages.find((s) => s.kind === "lost")!;

    await expect(reorderStages(repo, "acc-1", [lostStage.id])).rejects.toThrow();
  });
});

describe("deleteStage", () => {
  it("blocks deletion when the stage has an open deal", async () => {
    const repo = createInMemoryCrmRepository();
    await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });
    const stages = await repo.getStages("acc-1");

    await expect(deleteStage(repo, "acc-1", stages[0].id)).rejects.toThrow();
  });

  it("allows deletion when the stage has no open deals", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });
    const stages = await repo.getStages("acc-1");
    const dealsByStage = await repo.getDealsWithContactsByStage("acc-1");
    const deal = (dealsByStage.get(stages[0].id) ?? [])[0];
    await moveDealForTest(repo, "acc-1", deal.id, stages[1].id);

    await expect(deleteStage(repo, "acc-1", stages[0].id)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- service.test`
Expected: FAIL — `createStage`/`renameStage`/`reorderStages`/`deleteStage` not exported.

- [ ] **Step 3: Implement**

Append to `src/modules/crm/service.ts`:

```typescript
import type { PipelineStage } from "./types";

export async function createStage(
  repo: CrmRepository,
  accountId: string,
  name: string,
): Promise<PipelineStage> {
  const stages = await repo.getStages(accountId);
  const normalStages = stages.filter((s) => s.kind === "normal");

  const stage = await repo.insertStage(accountId, name, normalStages.length);
  await repo.reorderNormalStages(accountId, [...normalStages.map((s) => s.id), stage.id]);

  return stage;
}

export async function renameStage(
  repo: CrmRepository,
  accountId: string,
  stageId: string,
  name: string,
): Promise<PipelineStage> {
  return repo.renameStage(accountId, stageId, name);
}

export async function reorderStages(
  repo: CrmRepository,
  accountId: string,
  orderedIds: string[],
): Promise<void> {
  const stages = await repo.getStages(accountId);
  const byId = new Map(stages.map((s) => [s.id, s]));

  for (const id of orderedIds) {
    const stage = byId.get(id);
    if (!stage || stage.kind !== "normal") {
      throw new Error("reorderStages only accepts normal stages");
    }
  }

  await repo.reorderNormalStages(accountId, orderedIds);
}

export async function deleteStage(
  repo: CrmRepository,
  accountId: string,
  stageId: string,
): Promise<void> {
  const stage = await repo.getStage(accountId, stageId);
  if (!stage) throw new Error("Stage not found");
  if (stage.kind !== "normal") throw new Error("Only normal stages can be deleted");

  const openCount = await repo.countOpenDealsInStage(accountId, stageId);
  if (openCount > 0) {
    throw new Error("Cannot delete a stage with open deals");
  }

  await repo.deleteStage(accountId, stageId);
}
```

`createStage` only ever touches `normal` stage positions via `reorderNormalStages`; `follow_up`/`lost` positions are fixed by each repository implementation at "after all normal stages" — the in-memory repo from Task 8 already guarantees this since it never repositions special stages, and the Supabase repo (Task 15) follows the same rule.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test`
Expected: 14 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(crm): add stage management services"
```

---

### Task 14: Service — `reopenDeal`

**Files:**
- Modify: `src/modules/crm/service.ts`, `src/modules/crm/service.test.ts`

**Interfaces:**
- Produces: `reopenDeal(repo, accountId, contactId: string): Promise<Deal>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/crm/service.test.ts`:

```typescript
import { reopenDeal } from "./service";

describe("reopenDeal", () => {
  it("creates a new deal for a contact with no open deal", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });
    const stages = await repo.getStages("acc-1");
    const dealsByStage = await repo.getDealsWithContactsByStage("acc-1");
    const firstDeal = (dealsByStage.get(stages[0].id) ?? [])[0];
    await moveDeal(repo, "acc-1", firstDeal.id, stages.find((s) => s.kind === "lost")!.id);

    const newDeal = await reopenDeal(repo, "acc-1", contact.id);

    expect(newDeal.id).not.toBe(firstDeal.id);
    expect(newDeal.stageId).toBe(stages[0].id);

    const allDeals = await repo.getDealsForContact("acc-1", contact.id);
    expect(allDeals).toHaveLength(2);
  });

  it("rejects reopening when a deal is already open", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    await expect(reopenDeal(repo, "acc-1", contact.id)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- service.test`
Expected: FAIL — `reopenDeal` not exported.

- [ ] **Step 3: Implement**

Append to `src/modules/crm/service.ts`:

```typescript
export async function reopenDeal(
  repo: CrmRepository,
  accountId: string,
  contactId: string,
): Promise<Deal> {
  const openDeal = await repo.getOpenDealForContact(accountId, contactId);
  if (openDeal) throw new Error("Contact already has an open deal");

  const stages = await repo.getStages(accountId);
  const firstStage = stages[0];
  const deal = await repo.insertDeal(accountId, contactId, firstStage.id);
  await repo.insertDealHistory(deal.id, null, firstStage.id);

  return deal;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test`
Expected: 16 passed.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests passed (repository.memory + service + utils).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(crm): add reopenDeal service"
```

---

## Part C — Supabase Wiring

### Task 15: SupabaseCrmRepository implementation

**Files:**
- Create: `src/modules/crm/repository.supabase.ts`

**Interfaces:**
- Consumes: `CrmRepository` interface (Task 8), Supabase server client (Task 4), generated `Database` type (Task 6).
- Produces: `createSupabaseCrmRepository(supabase: SupabaseClient<Database>): CrmRepository` — used by Server Actions (Task 16). Not unit tested (thin adapter over the already-tested service layer); correctness is verified manually through the UI in Tasks 17–23 against the real database.

- [ ] **Step 1: Implement the adapter**

Create `src/modules/crm/repository.supabase.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CrmRepository } from "./repository";
import type {
  Contact,
  Deal,
  DealStageHistoryEntry,
  DealWithContact,
  PipelineStage,
} from "./types";

function toContact(row: Database["public"]["Tables"]["contacts"]["Row"]): Contact {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    phone: row.phone,
    origin: row.origin,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStage(row: Database["public"]["Tables"]["pipeline_stages"]["Row"]): PipelineStage {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    kind: row.kind,
    position: row.position,
  };
}

function toDeal(row: Database["public"]["Tables"]["deals"]["Row"]): Deal {
  return {
    id: row.id,
    accountId: row.account_id,
    contactId: row.contact_id,
    stageId: row.stage_id,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

function toHistory(
  row: Database["public"]["Tables"]["deal_stage_history"]["Row"],
): DealStageHistoryEntry {
  return {
    id: row.id,
    dealId: row.deal_id,
    fromStageId: row.from_stage_id,
    toStageId: row.to_stage_id,
    movedAt: row.moved_at,
  };
}

export function createSupabaseCrmRepository(
  supabase: SupabaseClient<Database>,
): CrmRepository {
  return {
    async getStages(accountId) {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("account_id", accountId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data.map(toStage);
    },

    async getStage(accountId, stageId) {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", stageId)
        .maybeSingle();
      if (error) throw error;
      return data ? toStage(data) : null;
    },

    async insertStage(accountId, name, position) {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .insert({ account_id: accountId, name, kind: "normal", position })
        .select("*")
        .single();
      if (error) throw error;
      return toStage(data);
    },

    async renameStage(accountId, stageId, name) {
      const { data, error } = await supabase
        .from("pipeline_stages")
        .update({ name })
        .eq("account_id", accountId)
        .eq("id", stageId)
        .select("*")
        .single();
      if (error) throw error;
      return toStage(data);
    },

    async reorderNormalStages(accountId, orderedIds) {
      for (const [index, id] of orderedIds.entries()) {
        const { error } = await supabase
          .from("pipeline_stages")
          .update({ position: index })
          .eq("account_id", accountId)
          .eq("id", id)
          .eq("kind", "normal");
        if (error) throw error;
      }
    },

    async deleteStage(accountId, stageId) {
      const { error } = await supabase
        .from("pipeline_stages")
        .delete()
        .eq("account_id", accountId)
        .eq("id", stageId);
      if (error) throw error;
    },

    async countOpenDealsInStage(accountId, stageId) {
      const { count, error } = await supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .eq("stage_id", stageId)
        .is("closed_at", null);
      if (error) throw error;
      return count ?? 0;
    },

    async insertContact(accountId, input) {
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          account_id: accountId,
          name: input.name,
          phone: input.phone,
          origin: input.origin ?? null,
          notes: input.notes ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return toContact(data);
    },

    async updateContact(accountId, contactId, input) {
      const { data, error } = await supabase
        .from("contacts")
        .update({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.origin !== undefined ? { origin: input.origin } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", accountId)
        .eq("id", contactId)
        .select("*")
        .single();
      if (error) throw error;
      return toContact(data);
    },

    async searchContacts(accountId, query) {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("account_id", accountId)
        .or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
      if (error) throw error;
      return data.map(toContact);
    },

    async insertDeal(accountId, contactId, stageId) {
      const { data, error } = await supabase
        .from("deals")
        .insert({ account_id: accountId, contact_id: contactId, stage_id: stageId })
        .select("*")
        .single();
      if (error) throw error;
      return toDeal(data);
    },

    async getDeal(accountId, dealId) {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", dealId)
        .maybeSingle();
      if (error) throw error;
      return data ? toDeal(data) : null;
    },

    async getOpenDealForContact(accountId, contactId) {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .is("closed_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? toDeal(data) : null;
    },

    async getDealsForContact(accountId, contactId) {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_id", contactId);
      if (error) throw error;
      return data.map(toDeal);
    },

    async updateDealStage(accountId, dealId, stageId, closedAt) {
      const { data, error } = await supabase
        .from("deals")
        .update({ stage_id: stageId, closed_at: closedAt })
        .eq("account_id", accountId)
        .eq("id", dealId)
        .select("*")
        .single();
      if (error) throw error;
      return toDeal(data);
    },

    async getDealsWithContactsByStage(accountId) {
      const { data, error } = await supabase
        .from("deals")
        .select("*, contact:contacts(*)")
        .eq("account_id", accountId);
      if (error) throw error;

      const result = new Map<string, DealWithContact[]>();
      for (const row of data) {
        const deal = toDeal(row);
        const contact = toContact(row.contact);
        const list = result.get(deal.stageId) ?? [];
        list.push({ ...deal, contact });
        result.set(deal.stageId, list);
      }
      return result;
    },

    async insertDealHistory(dealId, fromStageId, toStageId) {
      const { data, error } = await supabase
        .from("deal_stage_history")
        .insert({ deal_id: dealId, from_stage_id: fromStageId, to_stage_id: toStageId })
        .select("*")
        .single();
      if (error) throw error;
      return toHistory(data);
    },

    async getDealHistory(dealId) {
      const { data, error } = await supabase
        .from("deal_stage_history")
        .select("*")
        .eq("deal_id", dealId)
        .order("moved_at", { ascending: true });
      if (error) throw error;
      return data.map(toHistory);
    },
  };
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: exit code 0. (Type errors here usually mean the generated `Database` type from Task 6, Step 4 doesn't match the column names used above — fix any mismatches before proceeding.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(crm): add SupabaseCrmRepository"
```

---

### Task 16: Account resolution helper and CRM Server Actions

**Files:**
- Create: `src/lib/supabase/account.ts`, `src/app/pipeline/actions.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient` (Task 4), `createSupabaseCrmRepository` (Task 15), all `modules/crm/service.ts` functions (Tasks 9–14).
- Produces: `getCurrentAccountId(supabase): Promise<string>`; Server Actions `createContactAction`, `updateContactAction`, `searchContactsAction`, `listPipelineAction`, `moveDealAction`, `createStageAction`, `renameStageAction`, `reorderStagesAction`, `deleteStageAction`, `reopenDealAction` — consumed directly by the UI tasks (18–23).

- [ ] **Step 1: Write the account resolution helper**

Create `src/lib/supabase/account.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export async function getCurrentAccountId(
  supabase: SupabaseClient<Database>,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("account_users")
    .select("account_id")
    .eq("user_id", user.id)
    .single();
  if (error) throw error;

  return data.account_id;
}
```

- [ ] **Step 2: Write the Server Actions**

Create `src/app/pipeline/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import * as crm from "@/modules/crm/service";

async function getRepoAndAccount() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const repo = createSupabaseCrmRepository(supabase);
  return { repo, accountId };
}

export async function createContactAction(input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const contact = await crm.createContact(repo, accountId, input);
  revalidatePath("/pipeline");
  return contact;
}

export async function updateContactAction(contactId: string, input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const contact = await crm.updateContact(repo, accountId, contactId, input);
  revalidatePath("/pipeline");
  return contact;
}

export async function searchContactsAction(query: string) {
  const { repo, accountId } = await getRepoAndAccount();
  return crm.searchContacts(repo, accountId, query);
}

export async function listPipelineAction() {
  const { repo, accountId } = await getRepoAndAccount();
  return crm.listPipeline(repo, accountId);
}

export async function moveDealAction(dealId: string, toStageId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const deal = await crm.moveDeal(repo, accountId, dealId, toStageId);
  revalidatePath("/pipeline");
  return deal;
}

export async function createStageAction(name: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const stage = await crm.createStage(repo, accountId, name);
  revalidatePath("/pipeline");
  return stage;
}

export async function renameStageAction(stageId: string, name: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const stage = await crm.renameStage(repo, accountId, stageId, name);
  revalidatePath("/pipeline");
  return stage;
}

export async function reorderStagesAction(orderedIds: string[]) {
  const { repo, accountId } = await getRepoAndAccount();
  await crm.reorderStages(repo, accountId, orderedIds);
  revalidatePath("/pipeline");
}

export async function deleteStageAction(stageId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  await crm.deleteStage(repo, accountId, stageId);
  revalidatePath("/pipeline");
}

export async function reopenDealAction(contactId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const deal = await crm.reopenDeal(repo, accountId, contactId);
  revalidatePath("/pipeline");
  return deal;
}
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(crm): wire Server Actions to the CRM service layer"
```

---

## Part D — Auth and UI

### Task 17: Login page and session middleware

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`, `middleware.ts`

**Interfaces:**
- Produces: `/login` route; `middleware.ts` refreshing the Supabase session cookie on every request and redirecting unauthenticated users from `/pipeline` to `/login`.

- [ ] **Step 1: Write the login Server Action**

Create `src/app/login/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/pipeline");
}
```

- [ ] **Step 2: Write the login page**

Create `src/app/login/page.tsx`:

```tsx
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={loginAction} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Entrar</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        <Button type="submit" className="w-full">
          Entrar
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Write the session-refresh middleware**

Create `middleware.ts` (repo root):

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && request.nextUrl.pathname.startsWith("/pipeline")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/pipeline/:path*"],
};
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, visit `http://localhost:3000/pipeline` while logged out.
Expected: redirected to `/login`. After a successful login (using credentials created manually in the Supabase Auth dashboard per the architecture spec), redirected to `/pipeline`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(auth): add login page and session middleware"
```

---

### Task 18: `/pipeline` page skeleton (kanban, read-only)

**Files:**
- Create: `src/app/pipeline/page.tsx`, `src/components/pipeline/kanban-board.tsx`, `src/components/pipeline/deal-card.tsx`

**Interfaces:**
- Consumes: `listPipelineAction` (Task 16).
- Produces: `<KanbanBoard columns={...} />` — extended with drag-and-drop in Task 19.

- [ ] **Step 1: Write the deal card**

Create `src/components/pipeline/deal-card.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import type { DealWithContact } from "@/modules/crm/types";

export function DealCard({ deal }: { deal: DealWithContact }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="font-medium">{deal.contact.name}</p>
        <p className="text-sm text-muted-foreground">{deal.contact.phone}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write the kanban board (read-only for now)**

Create `src/components/pipeline/kanban-board.tsx`:

```tsx
import { DealCard } from "./deal-card";
import type { PipelineStage, DealWithContact } from "@/modules/crm/types";

export interface PipelineColumn {
  stage: PipelineStage;
  deals: DealWithContact[];
}

export function KanbanBoard({ columns }: { columns: PipelineColumn[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto p-4">
      {columns.map(({ stage, deals }) => (
        <div key={stage.id} className="w-64 shrink-0">
          <h2 className="mb-2 font-semibold">{stage.name}</h2>
          <div className="space-y-2">
            {deals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

Create `src/app/pipeline/page.tsx`:

```tsx
import { listPipelineAction } from "./actions";
import { KanbanBoard } from "@/components/pipeline/kanban-board";

export default async function PipelinePage() {
  const columns = await listPipelineAction();

  return (
    <main>
      <h1 className="p-4 text-2xl font-bold">Pipeline</h1>
      <KanbanBoard columns={columns} />
    </main>
  );
}
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, log in, visit `/pipeline`.
Expected: 6 columns rendered in the seeded order (Novo Lead … Perdido), each showing its deals.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(pipeline): add read-only kanban board"
```

---

### Task 19: Drag-and-drop with `dnd-kit`, wired to `moveDeal`

**Files:**
- Modify: `src/components/pipeline/kanban-board.tsx`, `src/components/pipeline/deal-card.tsx`
- Create: `src/components/pipeline/kanban-column.tsx`, `src/components/pipeline/move-deal-menu.tsx`

**Interfaces:**
- Consumes: `moveDealAction` (Task 16).
- Produces: draggable `DealCard`, droppable `KanbanColumn`; a `MoveDealMenu` fallback for touch/small screens.

- [ ] **Step 1: Install `dnd-kit`**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Add the "move to" dropdown fallback**

Create `src/components/pipeline/move-deal-menu.tsx`:

```tsx
"use client";

import { moveDealAction } from "@/app/pipeline/actions";
import type { PipelineStage } from "@/modules/crm/types";

export function MoveDealMenu({
  dealId,
  currentStageId,
  stages,
}: {
  dealId: string;
  currentStageId: string;
  stages: PipelineStage[];
}) {
  return (
    <select
      className="mt-2 w-full rounded border p-1 text-sm"
      value={currentStageId}
      onChange={(e) => moveDealAction(dealId, e.target.value)}
    >
      {stages.map((stage) => (
        <option key={stage.id} value={stage.id}>
          {stage.name}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: Make the deal card draggable**

Replace `src/components/pipeline/deal-card.tsx`:

```tsx
"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { MoveDealMenu } from "./move-deal-menu";
import type { DealWithContact, PipelineStage } from "@/modules/crm/types";

export function DealCard({
  deal,
  stages,
}: {
  deal: DealWithContact;
  stages: PipelineStage[];
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: deal.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
    >
      <Card>
        <CardContent className="p-3">
          <div {...listeners} className="cursor-grab">
            <p className="font-medium">{deal.contact.name}</p>
            <p className="text-sm text-muted-foreground">{deal.contact.phone}</p>
          </div>
          <MoveDealMenu dealId={deal.id} currentStageId={deal.stageId} stages={stages} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Make each column droppable**

Create `src/components/pipeline/kanban-column.tsx`:

```tsx
"use client";

import { useDroppable } from "@dnd-kit/core";
import { DealCard } from "./deal-card";
import type { PipelineStage, DealWithContact } from "@/modules/crm/types";

export function KanbanColumn({
  stage,
  deals,
  allStages,
}: {
  stage: PipelineStage;
  deals: DealWithContact[];
  allStages: PipelineStage[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 rounded p-2 ${isOver ? "bg-accent" : ""}`}
    >
      <h2 className="mb-2 font-semibold">{stage.name}</h2>
      <div className="space-y-2">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} stages={allStages} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire drag end to `moveDealAction` in the board**

Replace `src/components/pipeline/kanban-board.tsx`:

```tsx
"use client";

import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { moveDealAction } from "@/app/pipeline/actions";
import type { PipelineStage, DealWithContact } from "@/modules/crm/types";

export interface PipelineColumn {
  stage: PipelineStage;
  deals: DealWithContact[];
}

export function KanbanBoard({ columns }: { columns: PipelineColumn[] }) {
  const allStages = columns.map((c) => c.stage);

  function handleDragEnd(event: DragEndEvent) {
    const dealId = event.active.id as string;
    const toStageId = event.over?.id as string | undefined;
    if (!toStageId) return;
    moveDealAction(dealId, toStageId);
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-4">
        {columns.map(({ stage, deals }) => (
          <KanbanColumn key={stage.id} stage={stage} deals={deals} allStages={allStages} />
        ))}
      </div>
    </DndContext>
  );
}
```

- [ ] **Step 6: Verify manually**

Run: `npm run dev`, visit `/pipeline`, drag a card to another column.
Expected: card moves and stays after a page refresh (confirms the Server Action persisted the move). Also test the "move to" dropdown on a card — same effect.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(pipeline): add drag-and-drop and move-to fallback for deals"
```

---

### Task 20: Search bar

**Files:**
- Create: `src/components/pipeline/contact-search.tsx`
- Modify: `src/app/pipeline/page.tsx`

**Interfaces:**
- Consumes: `searchContactsAction` (Task 16).

- [ ] **Step 1: Write the search bar**

Create `src/components/pipeline/contact-search.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { searchContactsAction } from "@/app/pipeline/actions";
import type { Contact } from "@/modules/crm/types";

export function ContactSearch({ onResults }: { onResults: (contacts: Contact[] | null) => void }) {
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    setQuery(value);
    if (!value.trim()) {
      onResults(null);
      return;
    }
    startTransition(async () => {
      const results = await searchContactsAction(value);
      onResults(results);
    });
  }

  return (
    <Input
      placeholder="Buscar por nome ou telefone"
      value={query}
      onChange={(e) => handleChange(e.target.value)}
      aria-busy={isPending}
      className="max-w-sm"
    />
  );
}
```

- [ ] **Step 2: Wire it into the pipeline page**

The board is server-rendered from `listPipelineAction`; search needs client-side filtering. Modify `src/app/pipeline/page.tsx`:

```tsx
import { listPipelineAction } from "./actions";
import { PipelineClient } from "@/components/pipeline/pipeline-client";

export default async function PipelinePage() {
  const columns = await listPipelineAction();

  return (
    <main>
      <h1 className="p-4 text-2xl font-bold">Pipeline</h1>
      <PipelineClient initialColumns={columns} />
    </main>
  );
}
```

Create `src/components/pipeline/pipeline-client.tsx` as the client-side container that owns search state and filters `columns` before passing them to `KanbanBoard`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { KanbanBoard, type PipelineColumn } from "./kanban-board";
import { ContactSearch } from "./contact-search";
import type { Contact } from "@/modules/crm/types";

export function PipelineClient({ initialColumns }: { initialColumns: PipelineColumn[] }) {
  const [matchingContactIds, setMatchingContactIds] = useState<Set<string> | null>(null);

  function handleResults(contacts: Contact[] | null) {
    setMatchingContactIds(contacts ? new Set(contacts.map((c) => c.id)) : null);
  }

  const filteredColumns = useMemo(() => {
    if (!matchingContactIds) return initialColumns;
    return initialColumns.map((col) => ({
      ...col,
      deals: col.deals.filter((deal) => matchingContactIds.has(deal.contact.id)),
    }));
  }, [initialColumns, matchingContactIds]);

  return (
    <div>
      <div className="px-4">
        <ContactSearch onResults={handleResults} />
      </div>
      <KanbanBoard columns={filteredColumns} />
    </div>
  );
}
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`, visit `/pipeline`, type a name into the search box.
Expected: only matching cards remain visible across columns; clearing the box restores all cards.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(pipeline): add contact search"
```

---

### Task 21: New contact dialog

**Files:**
- Create: `src/components/pipeline/new-contact-dialog.tsx`
- Modify: `src/components/pipeline/pipeline-client.tsx`

**Interfaces:**
- Consumes: `createContactAction` (Task 16).

- [ ] **Step 1: Write the dialog**

Create `src/components/pipeline/new-contact-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createContactAction } from "@/app/pipeline/actions";

export function NewContactDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      await createContactAction({
        name: String(formData.get("name") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        origin: String(formData.get("origin") ?? "") || undefined,
        notes: String(formData.get("notes") ?? "") || undefined,
      });
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar contato");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Novo contato</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo contato</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" name="phone" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="origin">Origem</Label>
            <Input id="origin" name="origin" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" />
          </div>
          <Button type="submit" className="w-full">
            Salvar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it into the pipeline client**

Modify `src/components/pipeline/pipeline-client.tsx`: add `import { NewContactDialog } from "./new-contact-dialog";` and `import { useRouter } from "next/navigation";`, then inside the component add `const router = useRouter();` and render `<NewContactDialog onCreated={() => router.refresh()} />` next to `<ContactSearch .../>` in the header row (wrap both in a `flex items-center justify-between` div).

- [ ] **Step 3: Verify manually**

Run: `npm run dev`, visit `/pipeline`, click "Novo contato", submit the form.
Expected: dialog closes, the new card appears in the "Novo Lead" column without a manual page reload.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(pipeline): add new contact dialog"
```

---

### Task 22: Contact detail panel (history, notes, previous deals, reopen)

**Files:**
- Create: `src/components/pipeline/contact-detail-dialog.tsx`
- Modify: `src/components/pipeline/deal-card.tsx`, `src/app/pipeline/actions.ts`

**Interfaces:**
- Consumes: `updateContactAction`, `reopenDealAction` (Task 16); needs a new read action for a single contact's deal history.
- Produces: `getContactDetailAction(contactId): Promise<{ contact: Contact; deals: (Deal & { history: DealStageHistoryEntry[] })[] }>`.

- [ ] **Step 1: Add the detail-fetching Server Action**

Append to `src/app/pipeline/actions.ts`:

```typescript
export async function getContactDetailAction(contactId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const deals = await repo.getDealsForContact(accountId, contactId);
  const dealsWithHistory = await Promise.all(
    deals.map(async (deal) => ({
      ...deal,
      history: await repo.getDealHistory(deal.id),
    })),
  );
  return { deals: dealsWithHistory };
}
```

- [ ] **Step 2: Write the detail dialog**

Create `src/components/pipeline/contact-detail-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getContactDetailAction,
  reopenDealAction,
  updateContactAction,
} from "@/app/pipeline/actions";
import type { Deal, DealStageHistoryEntry, DealWithContact } from "@/modules/crm/types";

export function ContactDetailDialog({
  deal,
  open,
  onOpenChange,
  onChanged,
}: {
  deal: DealWithContact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState(deal?.contact.notes ?? "");
  const [allDeals, setAllDeals] = useState<(Deal & { history: DealStageHistoryEntry[] })[]>([]);

  useEffect(() => {
    setNotes(deal?.contact.notes ?? "");
    if (deal) {
      getContactDetailAction(deal.contact.id).then(({ deals }) => setAllDeals(deals));
    }
  }, [deal]);

  if (!deal) return null;

  async function handleSaveNotes() {
    await updateContactAction(deal!.contact.id, { notes });
    onChanged();
  }

  async function handleReopen() {
    await reopenDealAction(deal!.contact.id);
    onChanged();
    onOpenChange(false);
  }

  const hasOpenDeal = allDeals.some((d) => d.closedAt === null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{deal.contact.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{deal.contact.phone}</p>

        <div className="space-y-1">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          <Button size="sm" onClick={handleSaveNotes}>
            Salvar notas
          </Button>
        </div>

        <div>
          <h3 className="font-semibold">Negociações</h3>
          {allDeals.map((d) => (
            <div key={d.id} className="mt-2 rounded border p-2 text-sm">
              <p>{d.closedAt ? `Encerrada em ${new Date(d.closedAt).toLocaleDateString()}` : "Em andamento"}</p>
              <ul className="ml-4 list-disc">
                {d.history.map((h) => (
                  <li key={h.id}>{new Date(h.movedAt).toLocaleString()} → estágio {h.toStageId}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {!hasOpenDeal && (
          <Button variant="outline" onClick={handleReopen}>
            Reabrir negociação
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Open the dialog from a card click**

Modify `src/components/pipeline/deal-card.tsx` to accept an `onClick` prop and call it from a button/click handler on the card's content (not on the drag handle area), and thread that through `KanbanColumn` → `KanbanBoard` → `PipelineClient`, which owns the selected-deal state and renders one `<ContactDetailDialog>`.

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, click a card, edit notes and save, confirm the change persists after reopening the dialog. Move a deal to "Perdido", open its contact, click "Reabrir negociação", confirm a new card appears in "Novo Lead" and the old one shows as closed in history.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(pipeline): add contact detail dialog with history and reopen"
```

---

### Task 23: Stage settings panel

**Files:**
- Create: `src/components/pipeline/stage-settings-dialog.tsx`
- Modify: `src/components/pipeline/pipeline-client.tsx`

**Interfaces:**
- Consumes: `createStageAction`, `renameStageAction`, `reorderStagesAction`, `deleteStageAction` (Task 16).

- [ ] **Step 1: Write the settings dialog**

Create `src/components/pipeline/stage-settings-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createStageAction,
  deleteStageAction,
  renameStageAction,
  reorderStagesAction,
} from "@/app/pipeline/actions";
import type { PipelineStage } from "@/modules/crm/types";

export function StageSettingsDialog({
  stages,
  onChanged,
}: {
  stages: PipelineStage[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const normalStages = stages.filter((s) => s.kind === "normal");

  async function handleCreate() {
    if (!newStageName.trim()) return;
    await createStageAction(newStageName.trim());
    setNewStageName("");
    onChanged();
  }

  async function handleRename(stageId: string, name: string) {
    await renameStageAction(stageId, name);
    onChanged();
  }

  async function handleDelete(stageId: string) {
    setError(null);
    try {
      await deleteStageAction(stageId);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover estágio");
    }
  }

  async function moveUp(index: number) {
    if (index === 0) return;
    const ids = normalStages.map((s) => s.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    await reorderStagesAction(ids);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Configurar estágios</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estágios do pipeline</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="space-y-2">
          {stages.map((stage, index) => (
            <div key={stage.id} className="flex items-center gap-2">
              <Input
                defaultValue={stage.name}
                onBlur={(e) => {
                  if (e.target.value !== stage.name) handleRename(stage.id, e.target.value);
                }}
              />
              {stage.kind === "normal" && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => moveUp(index)}>
                    ↑
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(stage.id)}>
                    Remover
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Input
            placeholder="Novo estágio"
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
          />
          <Button onClick={handleCreate}>Adicionar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it into the pipeline client**

Modify `src/components/pipeline/pipeline-client.tsx`: import `StageSettingsDialog`, render it in the header row next to `NewContactDialog`, passing `stages={initialColumns.map((c) => c.stage)}` and `onChanged={() => router.refresh()}`.

- [ ] **Step 3: Verify manually**

Run: `npm run dev`, open "Configurar estágios": rename a normal stage, add a new one, try deleting a stage that has an open deal (expect the error message), move a deal out and delete it successfully, reorder two normal stages and confirm the kanban column order updates after refresh.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(pipeline): add stage settings panel"
```

---

## Part E — Deploy

### Task 24: Cloudflare Pages deploy via OpenNext

**Files:**
- Create: `open-next.config.ts`, `wrangler.toml`
- Modify: `package.json` (add `pages:build` and `deploy` scripts)

**Interfaces:**
- Produces: `npm run pages:build` generating the Cloudflare-compatible output; `npm run deploy` publishing it.

- [ ] **Step 1: Install the OpenNext Cloudflare adapter**

```bash
npm install -D @opennextjs/cloudflare wrangler
```

- [ ] **Step 2: Add the OpenNext config**

Create `open-next.config.ts`:

```typescript
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
```

- [ ] **Step 3: Add the Wrangler config**

Create `wrangler.toml`:

```toml
name = "arkdoctor"
compatibility_date = "2026-08-20"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = ".open-next/assets"
```

- [ ] **Step 4: Add build/deploy scripts**

Add under `"scripts"` in `package.json`:

```json
"pages:build": "opennextjs-cloudflare build",
"deploy": "opennextjs-cloudflare build && wrangler pages deploy .open-next/assets"
```

- [ ] **Step 5: Verify the Cloudflare build succeeds locally**

Run: `npm run pages:build`
Expected: exit code 0, `.open-next/assets` directory created.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: configure Cloudflare Pages deploy via OpenNext"
```

Deploying to the live Cloudflare project (`wrangler pages deploy`) and setting the `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` secrets in the Cloudflare dashboard are manual, one-time operator actions — do not run `npm run deploy` as part of this plan without the user's explicit go-ahead, since it publishes to a shared environment.

---

## Self-Review Notes

- **Spec coverage:** All CRM spec sections are covered — schema (Task 6), server actions (Tasks 9–14 + 16), UI/routes (Tasks 17–23), edge cases (no-op same-stage move, blocked stage deletion, reopen-when-open rejected — all covered by Task 12/13/14 tests), and the arquitetura spec's setup, auth, RLS, and deploy requirements (Tasks 1–6, 17, 24).
- **Type consistency:** `CrmRepository` (Task 8) is implemented identically by `repository.memory.ts` (Task 8) and `repository.supabase.ts` (Task 15); `service.ts` functions (Tasks 9–14) are the only consumers of the interface and are exercised by both the test suite (via the in-memory repo) and the UI (via the Supabase repo) with no divergence in signatures.
- **Deferred to Fase 4:** `createContact` is intentionally reusable by the WhatsApp module later — no changes needed to this plan's Task 9 for that to work.
