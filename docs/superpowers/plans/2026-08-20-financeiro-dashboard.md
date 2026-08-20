# Financeiro/Dashboard (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Financeiro module — Procedure catalog, manual revenue/expense entries (FinancialEntry), and a dashboard with period-comparison metrics — decoupled from the not-yet-merged Agendamento/`Appointment` work.

**Architecture:** New `src/modules/finance/` domain module following the exact repository-pattern already established by `src/modules/crm/` (interface + in-memory + Supabase implementations, Zod-validated service functions). New Postgres tables `procedures` and `financial_entries` with RLS. Three new routes under `src/app/(app)/financeiro/`. The `financial_entries.appointment_id` column exists from day one (nullable, no FK yet) so the future Appointment→FinancialEntry integration needs no new migration.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, Supabase (Postgres + RLS), Vitest, Tailwind + shadcn/ui (Card, Dialog, Button, Input, Label, Textarea, Badge — no new shadcn components needed), Recharts (new dependency, per design system).

**Spec:** `docs/superpowers/specs/2026-08-20-arkdoctor-financeiro-design.md` (read alongside this plan — it has the full field-by-field rationale this plan implements).

## Global Constraints

- RLS enabled on every new table, policy pattern: `account_id in (select account_id from account_users where user_id = auth.uid())`, pinned `to authenticated` (per `0003_security_hardening.sql` convention — apply from the start, no follow-up migration needed here).
- Repository methods never throw raw Postgres/PostgREST errors to callers — log server-side, throw a generic Portuguese message (`throwDbError` pattern from `src/modules/crm/repository.supabase.ts`).
- All money values are `numeric(10,2)` in Postgres, `number` in TypeScript (Supabase returns numeric as string; repository mappers must `Number(...)` them — see Task 7).
- `occurred_at` / dashboard period boundaries are plain `date` strings (`YYYY-MM-DD`), compared lexicographically — never `Date` objects, to avoid timezone drift.
- No E2E tests (Playwright) — Vitest + React Testing Library only, per architecture doc.
- Expenses (`type = 'expense'`) can never carry a `procedure_id` — enforced at both the DB (`check` constraint) and service layer.
- Cancellation rate metric ships as a typed `{ available: false }` placeholder now — never a fake `0`.

---

## Task 1: Database schema — `procedures` and `financial_entries`

**Files:**
- Create: `supabase/migrations/0004_finance.sql`
- Modify: `src/lib/supabase/database.types.ts` (add `financial_entries` and `procedures` table types, alphabetically between `deals` and `pipeline_stages`, and `procedures` after `pipeline_stages`)

**Interfaces:**
- Produces: Postgres tables `procedures(id, account_id, name, default_price, category, active, created_at)` and `financial_entries(id, account_id, type, amount, default_amount, category, procedure_id, appointment_id, description, occurred_at, created_at)`; `Database["public"]["Tables"]["procedures"]` / `["financial_entries"]` types consumed by Task 7.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_finance.sql`:

```sql
create table procedures (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  default_price numeric(10,2) not null check (default_price > 0),
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table financial_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  type text not null check (type in ('revenue', 'expense')),
  amount numeric(10,2) not null check (amount > 0),
  default_amount numeric(10,2),
  category text,
  procedure_id uuid references procedures(id),
  -- No FK yet: the `appointments` table does not exist in this branch.
  -- Reserved for the future Appointment -> FinancialEntry integration.
  appointment_id uuid,
  description text,
  occurred_at date not null,
  created_at timestamptz not null default now(),
  constraint financial_entries_expense_no_procedure
    check (type <> 'expense' or procedure_id is null)
);

alter table procedures enable row level security;
alter table financial_entries enable row level security;

create policy "account members can manage procedures"
  on procedures for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage financial_entries"
  on financial_entries for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db push` (or `npx supabase migration up` if using local dev DB — follow whichever the repo's existing migrations 0001-0003 were applied with; check `supabase/config.toml` if unsure).
Expected: migration applies with no errors; `procedures` and `financial_entries` tables exist.

- [ ] **Step 3: Add the new table types to `database.types.ts`**

Open `src/lib/supabase/database.types.ts`. Insert a `financial_entries` entry after the `deals` entry (before `pipeline_stages`), and a `procedures` entry after `pipeline_stages` (before the closing `}` of `Tables`):

```ts
      financial_entries: {
        Row: {
          account_id: string
          amount: string
          appointment_id: string | null
          category: string | null
          created_at: string
          default_amount: string | null
          description: string | null
          id: string
          occurred_at: string
          procedure_id: string | null
          type: string
        }
        Insert: {
          account_id: string
          amount: number
          appointment_id?: string | null
          category?: string | null
          created_at?: string
          default_amount?: number | null
          description?: string | null
          id?: string
          occurred_at: string
          procedure_id?: string | null
          type: string
        }
        Update: {
          account_id?: string
          amount?: number
          appointment_id?: string | null
          category?: string | null
          created_at?: string
          default_amount?: number | null
          description?: string | null
          id?: string
          occurred_at?: string
          procedure_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_procedure_id_fkey"
            columns: ["procedure_id"]
            isOneToOne: false
            referencedRelation: "procedures"
            referencedColumns: ["id"]
          },
        ]
      }
```

```ts
      procedures: {
        Row: {
          account_id: string
          active: boolean
          category: string | null
          created_at: string
          default_price: string
          id: string
          name: string
        }
        Insert: {
          account_id: string
          active?: boolean
          category?: string | null
          created_at?: string
          default_price: number
          id?: string
          name: string
        }
        Update: {
          account_id?: string
          active?: boolean
          category?: string | null
          created_at?: string
          default_price?: number
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedures_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
```

Note: `amount`/`default_price` `Row` types are `string` because Postgres `numeric` comes back as a string over PostgREST — matches how the repository mapper in Task 7 handles it (`Number(row.amount)`), same as every other Supabase-typed numeric column pattern in this codebase.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `database.types.ts`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_finance.sql src/lib/supabase/database.types.ts
git commit -m "feat(finance): add procedures and financial_entries schema"
```

---

## Task 2: Domain types, Zod schemas, and repository interface

**Files:**
- Create: `src/modules/finance/types.ts`
- Create: `src/modules/finance/schemas.ts`
- Create: `src/modules/finance/repository.ts`

**Interfaces:**
- Produces: `Procedure`, `FinancialEntry`, `FinancialEntryType`, `ProcedureSalesSummary`, `CancellationRateMetric`, `DashboardMetrics` types; `createProcedureInputSchema`, `updateProcedureInputSchema`, `createFinancialEntryInputSchema`, `dashboardPeriodSchema` (+ inferred `*Input`/`DashboardPeriod` types); `FinanceRepository` interface — all consumed by Tasks 3-9.

- [ ] **Step 1: Write `types.ts`**

```ts
export type FinancialEntryType = "revenue" | "expense";

export interface Procedure {
  id: string;
  accountId: string;
  name: string;
  defaultPrice: number;
  category: string | null;
  active: boolean;
  createdAt: string;
}

export interface FinancialEntry {
  id: string;
  accountId: string;
  type: FinancialEntryType;
  amount: number;
  defaultAmount: number | null;
  category: string | null;
  procedureId: string | null;
  appointmentId: string | null;
  description: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface ProcedureSalesSummary {
  procedureId: string;
  procedureName: string;
  totalAmount: number;
  count: number;
}

export type CancellationRateMetric = { available: true; rate: number } | { available: false };

export interface DashboardMetrics {
  period: { from: string; to: string };
  revenueTotal: number;
  expenseTotal: number;
  balance: number;
  revenueChangePct: number | null;
  averageTicket: number | null;
  topProcedures: ProcedureSalesSummary[];
  cancellationRate: CancellationRateMetric;
}
```

- [ ] **Step 2: Write `schemas.ts`**

```ts
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export const createProcedureInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(200),
  defaultPrice: z.number().positive("Valor deve ser maior que zero"),
  category: z.string().trim().min(1).max(200).optional(),
});
export type CreateProcedureInput = z.infer<typeof createProcedureInputSchema>;

export const updateProcedureInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  defaultPrice: z.number().positive().optional(),
  category: z.string().trim().max(200).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateProcedureInput = z.infer<typeof updateProcedureInputSchema>;

export const createFinancialEntryInputSchema = z.object({
  type: z.enum(["revenue", "expense"]),
  amount: z.number().positive("Valor deve ser maior que zero"),
  category: z.string().trim().min(1).max(200).optional(),
  procedureId: z.string().uuid().optional(),
  description: z.string().trim().max(2000).optional(),
  occurredAt: isoDate,
});
export type CreateFinancialEntryInput = z.infer<typeof createFinancialEntryInputSchema>;

export const dashboardPeriodSchema = z.object({
  from: isoDate,
  to: isoDate,
});
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;
```

- [ ] **Step 3: Write `repository.ts`**

```ts
import type { FinancialEntry, FinancialEntryType, Procedure } from "./types";

export interface FinanceRepository {
  insertProcedure(
    accountId: string,
    input: { name: string; defaultPrice: number; category?: string },
  ): Promise<Procedure>;
  updateProcedure(
    accountId: string,
    procedureId: string,
    input: { name?: string; defaultPrice?: number; category?: string | null; active?: boolean },
  ): Promise<Procedure>;
  getProcedure(accountId: string, procedureId: string): Promise<Procedure | null>;
  listProcedures(accountId: string, options?: { activeOnly?: boolean }): Promise<Procedure[]>;

  insertFinancialEntry(
    accountId: string,
    input: {
      type: FinancialEntryType;
      amount: number;
      defaultAmount: number | null;
      category: string | null;
      procedureId: string | null;
      description: string | null;
      occurredAt: string;
    },
  ): Promise<FinancialEntry>;
  listFinancialEntries(
    accountId: string,
    range: { from: string; to: string },
  ): Promise<FinancialEntry[]>;
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (these files have no consumers yet, but must compile standalone).

- [ ] **Step 5: Commit**

```bash
git add src/modules/finance/types.ts src/modules/finance/schemas.ts src/modules/finance/repository.ts
git commit -m "feat(finance): add domain types, Zod schemas, and repository interface"
```

---

## Task 3: In-memory repository

**Files:**
- Create: `src/modules/finance/repository.memory.ts`
- Test: `src/modules/finance/repository.memory.test.ts`

**Interfaces:**
- Consumes: `FinanceRepository` (Task 2), `FinancialEntry`, `Procedure` (Task 2)
- Produces: `createInMemoryFinanceRepository(): FinanceRepository`, used by Task 4/5/6 service tests and by Task 9-11's dev/test wiring if needed.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createInMemoryFinanceRepository } from "./repository.memory";

describe("createInMemoryFinanceRepository", () => {
  it("scopes procedures and entries by accountId", async () => {
    const repo = createInMemoryFinanceRepository();
    await repo.insertProcedure("acc-1", { name: "Consulta", defaultPrice: 150 });
    await repo.insertProcedure("acc-2", { name: "Outra conta", defaultPrice: 50 });

    const acc1Procedures = await repo.listProcedures("acc-1");
    expect(acc1Procedures).toHaveLength(1);
    expect(acc1Procedures[0].name).toBe("Consulta");
  });

  it("listProcedures filters by activeOnly", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await repo.insertProcedure("acc-1", { name: "Consulta", defaultPrice: 150 });
    await repo.updateProcedure("acc-1", procedure.id, { active: false });

    expect(await repo.listProcedures("acc-1")).toHaveLength(1);
    expect(await repo.listProcedures("acc-1", { activeOnly: true })).toHaveLength(0);
  });

  it("listFinancialEntries filters by account and date range (inclusive)", async () => {
    const repo = createInMemoryFinanceRepository();
    await repo.insertFinancialEntry("acc-1", {
      type: "revenue",
      amount: 100,
      defaultAmount: null,
      category: "Consulta",
      procedureId: null,
      description: null,
      occurredAt: "2026-08-01",
    });
    await repo.insertFinancialEntry("acc-1", {
      type: "revenue",
      amount: 200,
      defaultAmount: null,
      category: "Consulta",
      procedureId: null,
      description: null,
      occurredAt: "2026-08-31",
    });
    await repo.insertFinancialEntry("acc-1", {
      type: "revenue",
      amount: 999,
      defaultAmount: null,
      category: "Fora do range",
      procedureId: null,
      description: null,
      occurredAt: "2026-09-01",
    });

    const entries = await repo.listFinancialEntries("acc-1", { from: "2026-08-01", to: "2026-08-31" });
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.amount)).toEqual([100, 200]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/finance/repository.memory.test.ts`
Expected: FAIL — `Cannot find module './repository.memory'`

- [ ] **Step 3: Write `repository.memory.ts`**

```ts
import type { FinanceRepository } from "./repository";
import type { FinancialEntry, Procedure } from "./types";

export function createInMemoryFinanceRepository(): FinanceRepository {
  const procedures = new Map<string, Procedure>();
  const entries = new Map<string, FinancialEntry>();

  return {
    async insertProcedure(accountId, input) {
      const id = crypto.randomUUID();
      const procedure: Procedure = {
        id,
        accountId,
        name: input.name,
        defaultPrice: input.defaultPrice,
        category: input.category ?? null,
        active: true,
        createdAt: new Date().toISOString(),
      };
      procedures.set(id, procedure);
      return procedure;
    },

    async updateProcedure(accountId, procedureId, input) {
      const procedure = procedures.get(procedureId);
      if (!procedure || procedure.accountId !== accountId) throw new Error("Procedure not found");
      const updated: Procedure = {
        ...procedure,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.defaultPrice !== undefined ? { defaultPrice: input.defaultPrice } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      };
      procedures.set(procedureId, updated);
      return updated;
    },

    async getProcedure(accountId, procedureId) {
      const procedure = procedures.get(procedureId);
      return procedure && procedure.accountId === accountId ? procedure : null;
    },

    async listProcedures(accountId, options) {
      return [...procedures.values()]
        .filter((p) => p.accountId === accountId && (!options?.activeOnly || p.active))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async insertFinancialEntry(accountId, input) {
      const id = crypto.randomUUID();
      const entry: FinancialEntry = {
        id,
        accountId,
        type: input.type,
        amount: input.amount,
        defaultAmount: input.defaultAmount,
        category: input.category,
        procedureId: input.procedureId,
        appointmentId: null,
        description: input.description,
        occurredAt: input.occurredAt,
        createdAt: new Date().toISOString(),
      };
      entries.set(id, entry);
      return entry;
    },

    async listFinancialEntries(accountId, range) {
      return [...entries.values()]
        .filter(
          (e) => e.accountId === accountId && e.occurredAt >= range.from && e.occurredAt <= range.to,
        )
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/finance/repository.memory.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/finance/repository.memory.ts src/modules/finance/repository.memory.test.ts
git commit -m "feat(finance): add in-memory finance repository"
```

---

## Task 4: Procedure service functions

**Files:**
- Create: `src/modules/finance/service.ts`
- Test: `src/modules/finance/service.test.ts`

**Interfaces:**
- Consumes: `FinanceRepository` (Task 2), `createInMemoryFinanceRepository` (Task 3), `createProcedureInputSchema`/`updateProcedureInputSchema` (Task 2)
- Produces: `createProcedure(repo, accountId, rawInput): Promise<Procedure>`, `updateProcedure(repo, accountId, procedureId, rawInput): Promise<Procedure>`, `deactivateProcedure(repo, accountId, procedureId): Promise<Procedure>`, `listProcedures(repo, accountId, options?): Promise<Procedure[]>`, `getProcedureDefaults(repo, accountId, procedureId): Promise<{ defaultPrice: number; category: string | null }>` — consumed by Task 8 (actions.ts) and Task 9 (UI).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { createInMemoryFinanceRepository } from "./repository.memory";
import { createProcedure, updateProcedure, deactivateProcedure, listProcedures, getProcedureDefaults } from "./service";

describe("createProcedure", () => {
  it("creates a procedure with the given fields", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 150,
      category: "Atendimento",
    });
    expect(procedure.name).toBe("Consulta");
    expect(procedure.defaultPrice).toBe(150);
    expect(procedure.active).toBe(true);
  });

  it("rejects a non-positive price", async () => {
    const repo = createInMemoryFinanceRepository();
    await expect(createProcedure(repo, "acc-1", { name: "Consulta", defaultPrice: 0 })).rejects.toThrow();
  });
});

describe("updateProcedure / deactivateProcedure", () => {
  it("updates only the provided fields", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", { name: "Consulta", defaultPrice: 150 });

    const updated = await updateProcedure(repo, "acc-1", procedure.id, { defaultPrice: 180 });

    expect(updated.name).toBe("Consulta");
    expect(updated.defaultPrice).toBe(180);
  });

  it("deactivateProcedure sets active to false without deleting it", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", { name: "Consulta", defaultPrice: 150 });

    const deactivated = await deactivateProcedure(repo, "acc-1", procedure.id);

    expect(deactivated.active).toBe(false);
    expect(await listProcedures(repo, "acc-1")).toHaveLength(1);
  });
});

describe("getProcedureDefaults", () => {
  it("returns the default price and category for pre-filling a revenue entry", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 150,
      category: "Atendimento",
    });

    const defaults = await getProcedureDefaults(repo, "acc-1", procedure.id);

    expect(defaults).toEqual({ defaultPrice: 150, category: "Atendimento" });
  });

  it("rejects an unknown procedure", async () => {
    const repo = createInMemoryFinanceRepository();
    await expect(getProcedureDefaults(repo, "acc-1", "missing-id")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/finance/service.test.ts`
Expected: FAIL — `Cannot find module './service'`

- [ ] **Step 3: Write `service.ts` (procedure functions only)**

```ts
import type { FinanceRepository } from "./repository";
import {
  createFinancialEntryInputSchema,
  createProcedureInputSchema,
  dashboardPeriodSchema,
  updateProcedureInputSchema,
} from "./schemas";
import type { FinancialEntry, Procedure } from "./types";

export async function createProcedure(
  repo: FinanceRepository,
  accountId: string,
  rawInput: unknown,
): Promise<Procedure> {
  const input = createProcedureInputSchema.parse(rawInput);
  return repo.insertProcedure(accountId, input);
}

export async function updateProcedure(
  repo: FinanceRepository,
  accountId: string,
  procedureId: string,
  rawInput: unknown,
): Promise<Procedure> {
  const input = updateProcedureInputSchema.parse(rawInput);
  return repo.updateProcedure(accountId, procedureId, input);
}

export async function deactivateProcedure(
  repo: FinanceRepository,
  accountId: string,
  procedureId: string,
): Promise<Procedure> {
  return repo.updateProcedure(accountId, procedureId, { active: false });
}

export async function listProcedures(
  repo: FinanceRepository,
  accountId: string,
  options?: { activeOnly?: boolean },
): Promise<Procedure[]> {
  return repo.listProcedures(accountId, options);
}

export async function getProcedureDefaults(
  repo: FinanceRepository,
  accountId: string,
  procedureId: string,
): Promise<{ defaultPrice: number; category: string | null }> {
  const procedure = await repo.getProcedure(accountId, procedureId);
  if (!procedure) throw new Error("Procedure not found");
  return { defaultPrice: procedure.defaultPrice, category: procedure.category };
}
```

(The `createFinancialEntryInputSchema`/`dashboardPeriodSchema` import and the `FinancialEntry` type import are unused until Tasks 5-6 — remove them from this step's import list if your editor flags unused imports; they'll be re-added in Task 5's edit. Simplest: only import `createProcedureInputSchema` and `updateProcedureInputSchema` in this step.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/finance/service.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/finance/service.ts src/modules/finance/service.test.ts
git commit -m "feat(finance): add procedure service functions"
```

---

## Task 5: FinancialEntry creation service function

**Files:**
- Modify: `src/modules/finance/service.ts` (add `createFinancialEntry`, `listFinancialEntries`)
- Modify: `src/modules/finance/service.test.ts` (append tests)

**Interfaces:**
- Consumes: `createFinancialEntryInputSchema` (Task 2), `FinanceRepository.getProcedure`/`insertFinancialEntry`/`listFinancialEntries` (Task 2)
- Produces: `createFinancialEntry(repo, accountId, rawInput): Promise<FinancialEntry>`, `listFinancialEntries(repo, accountId, range): Promise<FinancialEntry[]>` — consumed by Task 6 (dashboard metrics reuse `listFinancialEntries` semantics), Task 8, Task 10.

- [ ] **Step 1: Write the failing tests (append to `service.test.ts`)**

```ts
import { createFinancialEntry, listFinancialEntries } from "./service";

describe("createFinancialEntry", () => {
  it("creates a manual expense with no procedure", async () => {
    const repo = createInMemoryFinanceRepository();

    const entry = await createFinancialEntry(repo, "acc-1", {
      type: "expense",
      amount: 80,
      category: "Material",
      occurredAt: "2026-08-15",
    });

    expect(entry.type).toBe("expense");
    expect(entry.procedureId).toBeNull();
    expect(entry.defaultAmount).toBeNull();
  });

  it("rejects an expense with a procedureId", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", { name: "Consulta", defaultPrice: 150 });

    await expect(
      createFinancialEntry(repo, "acc-1", {
        type: "expense",
        amount: 80,
        category: "Material",
        procedureId: procedure.id,
        occurredAt: "2026-08-15",
      }),
    ).rejects.toThrow();
  });

  it("rejects an expense with no category", async () => {
    const repo = createInMemoryFinanceRepository();
    await expect(
      createFinancialEntry(repo, "acc-1", { type: "expense", amount: 80, occurredAt: "2026-08-15" }),
    ).rejects.toThrow();
  });

  it("snapshots defaultAmount and inherits category from the linked procedure on revenue", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 150,
      category: "Atendimento",
    });

    const entry = await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 120,
      procedureId: procedure.id,
      occurredAt: "2026-08-15",
    });

    expect(entry.amount).toBe(120);
    expect(entry.defaultAmount).toBe(150);
    expect(entry.category).toBe("Atendimento");
  });

  it("lets an explicit category override the procedure's category", async () => {
    const repo = createInMemoryFinanceRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 150,
      category: "Atendimento",
    });

    const entry = await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 120,
      procedureId: procedure.id,
      category: "Promoção",
      occurredAt: "2026-08-15",
    });

    expect(entry.category).toBe("Promoção");
  });

  it("allows revenue with no linked procedure, as long as it has a category", async () => {
    const repo = createInMemoryFinanceRepository();

    const entry = await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 50,
      category: "Avulso",
      occurredAt: "2026-08-15",
    });

    expect(entry.procedureId).toBeNull();
    expect(entry.defaultAmount).toBeNull();
  });
});

describe("listFinancialEntries", () => {
  it("delegates to the repository", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 100,
      category: "Avulso",
      occurredAt: "2026-08-15",
    });

    const entries = await listFinancialEntries(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });
    expect(entries).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/finance/service.test.ts`
Expected: FAIL — `createFinancialEntry is not a function`

- [ ] **Step 3: Add `createFinancialEntry` and `listFinancialEntries` to `service.ts`**

Update the top import line to include `createFinancialEntryInputSchema` and `FinancialEntry`:

```ts
import type { FinanceRepository } from "./repository";
import {
  createFinancialEntryInputSchema,
  createProcedureInputSchema,
  updateProcedureInputSchema,
} from "./schemas";
import type { FinancialEntry, Procedure } from "./types";
```

Append at the end of `service.ts`:

```ts
export async function createFinancialEntry(
  repo: FinanceRepository,
  accountId: string,
  rawInput: unknown,
): Promise<FinancialEntry> {
  const input = createFinancialEntryInputSchema.parse(rawInput);

  if (input.type === "expense" && input.procedureId) {
    throw new Error("Despesas não podem ter um procedimento vinculado");
  }

  let defaultAmount: number | null = null;
  let category = input.category ?? null;

  if (input.type === "revenue" && input.procedureId) {
    const procedure = await repo.getProcedure(accountId, input.procedureId);
    if (!procedure) throw new Error("Procedure not found");
    defaultAmount = procedure.defaultPrice;
    if (!category) category = procedure.category;
  }

  if (input.type === "expense" && !category) {
    throw new Error("Despesas exigem uma categoria");
  }

  return repo.insertFinancialEntry(accountId, {
    type: input.type,
    amount: input.amount,
    defaultAmount,
    category,
    procedureId: input.procedureId ?? null,
    description: input.description ?? null,
    occurredAt: input.occurredAt,
  });
}

export async function listFinancialEntries(
  repo: FinanceRepository,
  accountId: string,
  range: { from: string; to: string },
): Promise<FinancialEntry[]> {
  return repo.listFinancialEntries(accountId, range);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/finance/service.test.ts`
Expected: PASS (all procedure + entry tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/finance/service.ts src/modules/finance/service.test.ts
git commit -m "feat(finance): add createFinancialEntry with procedure default-amount snapshot"
```

---

## Task 6: Dashboard metrics service function

**Files:**
- Modify: `src/modules/finance/service.ts` (add `getDashboardMetrics` + private helpers)
- Modify: `src/modules/finance/service.test.ts` (append tests)

**Interfaces:**
- Consumes: `dashboardPeriodSchema` (Task 2), `FinanceRepository.listFinancialEntries`/`listProcedures` (Task 2), `createFinancialEntry`/`createProcedure` (Task 4/5, used only in tests)
- Produces: `getDashboardMetrics(repo, accountId, rawPeriod): Promise<DashboardMetrics>` — consumed by Task 8 (`getDashboardMetricsAction`) and Task 11 (dashboard page).

- [ ] **Step 1: Write the failing tests (append to `service.test.ts`)**

```ts
import { getDashboardMetrics } from "./service";

describe("getDashboardMetrics", () => {
  async function seedAugust(repo: ReturnType<typeof createInMemoryFinanceRepository>) {
    const consulta = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 150,
      category: "Atendimento",
    });
    const curativo = await createProcedure(repo, "acc-1", {
      name: "Curativo",
      defaultPrice: 50,
      category: "Atendimento",
    });

    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 150,
      procedureId: consulta.id,
      occurredAt: "2026-08-05",
    });
    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 150,
      procedureId: consulta.id,
      occurredAt: "2026-08-10",
    });
    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 50,
      procedureId: curativo.id,
      occurredAt: "2026-08-12",
    });
    await createFinancialEntry(repo, "acc-1", {
      type: "expense",
      amount: 100,
      category: "Material",
      occurredAt: "2026-08-20",
    });

    return { consulta, curativo };
  }

  it("sums revenue, expense, and balance for the period", async () => {
    const repo = createInMemoryFinanceRepository();
    await seedAugust(repo);

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    expect(metrics.revenueTotal).toBe(350);
    expect(metrics.expenseTotal).toBe(100);
    expect(metrics.balance).toBe(250);
  });

  it("computes revenueChangePct against the equivalent-length prior period", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 100,
      category: "Avulso",
      occurredAt: "2026-07-15",
    });
    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 150,
      category: "Avulso",
      occurredAt: "2026-08-15",
    });

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    expect(metrics.revenueChangePct).toBe(50);
  });

  it("returns null revenueChangePct when the prior period had no revenue", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(repo, "acc-1", {
      type: "revenue",
      amount: 150,
      category: "Avulso",
      occurredAt: "2026-08-15",
    });

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    expect(metrics.revenueChangePct).toBeNull();
  });

  it("computes averageTicket over revenue entries only", async () => {
    const repo = createInMemoryFinanceRepository();
    await seedAugust(repo);

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    // (150 + 150 + 50) / 3 revenue entries
    expect(metrics.averageTicket).toBeCloseTo(116.666, 2);
  });

  it("returns null averageTicket when there is no revenue in the period", async () => {
    const repo = createInMemoryFinanceRepository();

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    expect(metrics.averageTicket).toBeNull();
  });

  it("ranks topProcedures by total revenue descending, with names resolved", async () => {
    const repo = createInMemoryFinanceRepository();
    const { consulta, curativo } = await seedAugust(repo);

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    expect(metrics.topProcedures).toEqual([
      { procedureId: consulta.id, procedureName: "Consulta", totalAmount: 300, count: 2 },
      { procedureId: curativo.id, procedureName: "Curativo", totalAmount: 50, count: 1 },
    ]);
  });

  it("reports cancellationRate as unavailable (no Appointment data in this phase)", async () => {
    const repo = createInMemoryFinanceRepository();

    const metrics = await getDashboardMetrics(repo, "acc-1", { from: "2026-08-01", to: "2026-08-31" });

    expect(metrics.cancellationRate).toEqual({ available: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/finance/service.test.ts`
Expected: FAIL — `getDashboardMetrics is not a function`

- [ ] **Step 3: Add `getDashboardMetrics` to `service.ts`**

Update the schemas import to include `dashboardPeriodSchema`, and the types import to include `DashboardMetrics`, `FinancialEntryType`, `ProcedureSalesSummary`:

```ts
import type { FinanceRepository } from "./repository";
import {
  createFinancialEntryInputSchema,
  createProcedureInputSchema,
  dashboardPeriodSchema,
  updateProcedureInputSchema,
} from "./schemas";
import type {
  DashboardMetrics,
  FinancialEntry,
  FinancialEntryType,
  Procedure,
  ProcedureSalesSummary,
} from "./types";
```

Append at the end of `service.ts`:

```ts
export async function getDashboardMetrics(
  repo: FinanceRepository,
  accountId: string,
  rawPeriod: unknown,
): Promise<DashboardMetrics> {
  const period = dashboardPeriodSchema.parse(rawPeriod);
  const entries = await repo.listFinancialEntries(accountId, period);
  const prevEntries = await repo.listFinancialEntries(accountId, previousPeriod(period));
  const procedures = await repo.listProcedures(accountId);
  const procedureNames = new Map(procedures.map((p) => [p.id, p.name]));

  const revenueTotal = sumByType(entries, "revenue");
  const expenseTotal = sumByType(entries, "expense");
  const prevRevenueTotal = sumByType(prevEntries, "revenue");

  const revenueEntries = entries.filter((e) => e.type === "revenue");

  return {
    period,
    revenueTotal,
    expenseTotal,
    balance: revenueTotal - expenseTotal,
    revenueChangePct:
      prevRevenueTotal === 0 ? null : ((revenueTotal - prevRevenueTotal) / prevRevenueTotal) * 100,
    averageTicket: revenueEntries.length === 0 ? null : revenueTotal / revenueEntries.length,
    topProcedures: summarizeByProcedure(revenueEntries, procedureNames),
    cancellationRate: { available: false },
  };
}

function previousPeriod(period: { from: string; to: string }): { from: string; to: string } {
  const fromDate = new Date(`${period.from}T00:00:00Z`);
  const toDate = new Date(`${period.to}T00:00:00Z`);
  const durationMs = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

function sumByType(entries: FinancialEntry[], type: FinancialEntryType): number {
  return entries.filter((e) => e.type === type).reduce((sum, e) => sum + e.amount, 0);
}

function summarizeByProcedure(
  revenueEntries: FinancialEntry[],
  procedureNames: Map<string, string>,
): ProcedureSalesSummary[] {
  const byProcedure = new Map<string, { totalAmount: number; count: number }>();
  for (const entry of revenueEntries) {
    if (!entry.procedureId) continue;
    const current = byProcedure.get(entry.procedureId) ?? { totalAmount: 0, count: 0 };
    current.totalAmount += entry.amount;
    current.count += 1;
    byProcedure.set(entry.procedureId, current);
  }
  return [...byProcedure.entries()]
    .map(([procedureId, v]) => ({
      procedureId,
      procedureName: procedureNames.get(procedureId) ?? "Procedimento removido",
      totalAmount: v.totalAmount,
      count: v.count,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/finance/service.test.ts`
Expected: PASS (all tests, full file)

- [ ] **Step 5: Commit**

```bash
git add src/modules/finance/service.ts src/modules/finance/service.test.ts
git commit -m "feat(finance): add dashboard metrics calculation"
```

---

## Task 7: Supabase repository

**Files:**
- Create: `src/modules/finance/repository.supabase.ts`

**Interfaces:**
- Consumes: `FinanceRepository` (Task 2), `Database` (Task 1)
- Produces: `createSupabaseFinanceRepository(supabase): FinanceRepository` — consumed by Task 8.

- [ ] **Step 1: Write `repository.supabase.ts`**

```ts
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { FinanceRepository } from "./repository";
import type { FinancialEntry, FinancialEntryType, Procedure } from "./types";

function throwDbError(error: PostgrestError): never {
  console.error("[finance/repository.supabase]", error);
  throw new Error("Erro ao acessar o banco de dados. Tente novamente.");
}

function toProcedure(row: Database["public"]["Tables"]["procedures"]["Row"]): Procedure {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    defaultPrice: Number(row.default_price),
    category: row.category,
    active: row.active,
    createdAt: row.created_at,
  };
}

function toFinancialEntry(
  row: Database["public"]["Tables"]["financial_entries"]["Row"],
): FinancialEntry {
  return {
    id: row.id,
    accountId: row.account_id,
    type: row.type as FinancialEntryType,
    amount: Number(row.amount),
    defaultAmount: row.default_amount === null ? null : Number(row.default_amount),
    category: row.category,
    procedureId: row.procedure_id,
    appointmentId: row.appointment_id,
    description: row.description,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

export function createSupabaseFinanceRepository(
  supabase: SupabaseClient<Database>,
): FinanceRepository {
  return {
    async insertProcedure(accountId, input) {
      const { data, error } = await supabase
        .from("procedures")
        .insert({
          account_id: accountId,
          name: input.name,
          default_price: input.defaultPrice,
          category: input.category ?? null,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toProcedure(data);
    },

    async updateProcedure(accountId, procedureId, input) {
      const { data, error } = await supabase
        .from("procedures")
        .update({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.defaultPrice !== undefined ? { default_price: input.defaultPrice } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        })
        .eq("account_id", accountId)
        .eq("id", procedureId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toProcedure(data);
    },

    async getProcedure(accountId, procedureId) {
      const { data, error } = await supabase
        .from("procedures")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", procedureId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toProcedure(data) : null;
    },

    async listProcedures(accountId, options) {
      let query = supabase.from("procedures").select("*").eq("account_id", accountId);
      if (options?.activeOnly) query = query.eq("active", true);
      const { data, error } = await query.order("name", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toProcedure);
    },

    async insertFinancialEntry(accountId, input) {
      const { data, error } = await supabase
        .from("financial_entries")
        .insert({
          account_id: accountId,
          type: input.type,
          amount: input.amount,
          default_amount: input.defaultAmount,
          category: input.category,
          procedure_id: input.procedureId,
          description: input.description,
          occurred_at: input.occurredAt,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toFinancialEntry(data);
    },

    async listFinancialEntries(accountId, range) {
      const { data, error } = await supabase
        .from("financial_entries")
        .select("*")
        .eq("account_id", accountId)
        .gte("occurred_at", range.from)
        .lte("occurred_at", range.to)
        .order("occurred_at", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toFinancialEntry);
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — this is the point where a mismatch between Task 1's `database.types.ts` and this file's field access would surface.

- [ ] **Step 3: Commit**

```bash
git add src/modules/finance/repository.supabase.ts
git commit -m "feat(finance): add Supabase finance repository"
```

---

## Task 8: Server Actions and sidebar activation

**Files:**
- Create: `src/app/(app)/financeiro/actions.ts`
- Modify: `src/components/layout/sidebar.tsx:22`

**Interfaces:**
- Consumes: `createServerSupabaseClient` (`src/lib/supabase/server.ts`), `getCurrentAccountId` (`src/lib/supabase/account.ts`), `createSupabaseFinanceRepository` (Task 7), all `src/modules/finance/service.ts` exports (Tasks 4-6)
- Produces: `createProcedureAction`, `updateProcedureAction`, `deactivateProcedureAction`, `listProceduresAction`, `getProcedureDefaultsAction`, `createFinancialEntryAction`, `listFinancialEntriesAction`, `getDashboardMetricsAction` — consumed by Tasks 9-11.

- [ ] **Step 1: Write `actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseFinanceRepository } from "@/modules/finance/repository.supabase";
import * as finance from "@/modules/finance/service";

async function getRepoAndAccount() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const repo = createSupabaseFinanceRepository(supabase);
  return { repo, accountId };
}

export async function createProcedureAction(input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const procedure = await finance.createProcedure(repo, accountId, input);
  revalidatePath("/financeiro/procedimentos");
  return procedure;
}

export async function updateProcedureAction(procedureId: string, input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const procedure = await finance.updateProcedure(repo, accountId, procedureId, input);
  revalidatePath("/financeiro/procedimentos");
  return procedure;
}

export async function deactivateProcedureAction(procedureId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  await finance.deactivateProcedure(repo, accountId, procedureId);
  revalidatePath("/financeiro/procedimentos");
}

export async function listProceduresAction(options?: { activeOnly?: boolean }) {
  const { repo, accountId } = await getRepoAndAccount();
  return finance.listProcedures(repo, accountId, options);
}

export async function getProcedureDefaultsAction(procedureId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  return finance.getProcedureDefaults(repo, accountId, procedureId);
}

export async function createFinancialEntryAction(input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const entry = await finance.createFinancialEntry(repo, accountId, input);
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  return entry;
}

export async function listFinancialEntriesAction(range: { from: string; to: string }) {
  const { repo, accountId } = await getRepoAndAccount();
  return finance.listFinancialEntries(repo, accountId, range);
}

export async function getDashboardMetricsAction(period: { from: string; to: string }) {
  const { repo, accountId } = await getRepoAndAccount();
  return finance.getDashboardMetrics(repo, accountId, period);
}
```

- [ ] **Step 2: Enable Financeiro in the sidebar**

In `src/components/layout/sidebar.tsx:22`, change:

```ts
  { label: "Financeiro", href: "/financeiro", icon: Wallet, enabled: false },
```

to:

```ts
  { label: "Financeiro", href: "/financeiro", icon: Wallet, enabled: true },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/financeiro/actions.ts src/components/layout/sidebar.tsx
git commit -m "feat(finance): add finance Server Actions and enable sidebar link"
```

---

## Task 9: Procedimentos page (list + create/edit dialog)

**Files:**
- Create: `src/app/(app)/financeiro/procedimentos/page.tsx`
- Create: `src/components/finance/procedures-client.tsx`
- Create: `src/components/finance/procedure-dialog.tsx`

**Interfaces:**
- Consumes: `listProceduresAction`, `createProcedureAction`, `updateProcedureAction`, `deactivateProcedureAction` (Task 8), `Procedure` (Task 2), `PageHeader` (`src/components/layout/page-header.tsx`), `Card`/`Button`/`Dialog`/`Input`/`Label`/`Badge` (`src/components/ui/*`)
- Produces: `/financeiro/procedimentos` route.

- [ ] **Step 1: Write `procedure-dialog.tsx`**

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
import { createProcedureAction, updateProcedureAction } from "@/app/(app)/financeiro/actions";
import type { Procedure } from "@/modules/finance/types";

export function ProcedureDialog({
  procedure,
  onSaved,
}: {
  procedure?: Procedure;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(procedure);

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      const input = {
        name: String(formData.get("name") ?? ""),
        defaultPrice: Number(formData.get("defaultPrice")),
        category: String(formData.get("category") ?? "") || undefined,
      };
      if (isEditing && procedure) {
        await updateProcedureAction(procedure.id, input);
      } else {
        await createProcedureAction(input);
      }
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar procedimento");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={isEditing ? "outline" : "default"}>
            {isEditing ? "Editar" : "Novo procedimento"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar procedimento" : "Novo procedimento"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" defaultValue={procedure?.name} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="defaultPrice">Valor padrão (R$)</Label>
            <Input
              id="defaultPrice"
              name="defaultPrice"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={procedure?.defaultPrice}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="category">Categoria</Label>
            <Input id="category" name="category" defaultValue={procedure?.category ?? ""} />
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

- [ ] **Step 2: Write `procedures-client.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProcedureDialog } from "@/components/finance/procedure-dialog";
import {
  listProceduresAction,
  deactivateProcedureAction,
} from "@/app/(app)/financeiro/actions";
import type { Procedure } from "@/modules/finance/types";

export function ProceduresClient({ initialProcedures }: { initialProcedures: Procedure[] }) {
  const [procedures, setProcedures] = useState(initialProcedures);

  async function refresh() {
    setProcedures(await listProceduresAction());
  }

  async function handleDeactivate(id: string) {
    await deactivateProcedureAction(id);
    await refresh();
  }

  return (
    <div className="space-y-4 px-6 pb-6">
      <div className="flex justify-end">
        <ProcedureDialog onSaved={refresh} />
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {procedures.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              Nenhum procedimento cadastrado ainda.
            </p>
          )}
          {procedures.map((procedure) => (
            <div key={procedure.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{procedure.name}</p>
                <p className="text-sm text-muted-foreground">
                  {procedure.category ?? "Sem categoria"} · R${" "}
                  {procedure.defaultPrice.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!procedure.active && <Badge variant="outline">Inativo</Badge>}
                <ProcedureDialog procedure={procedure} onSaved={refresh} />
                {procedure.active && (
                  <Button variant="destructive" size="sm" onClick={() => handleDeactivate(procedure.id)}>
                    Desativar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Write `page.tsx`**

```tsx
import { listProceduresAction } from "../actions";
import { ProceduresClient } from "@/components/finance/procedures-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function ProceduresPage() {
  const procedures = await listProceduresAction();

  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Procedimentos"
        description="Cadastre os procedimentos e valores padrão usados nos seus lançamentos."
      />
      <ProceduresClient initialProcedures={procedures} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, log in, navigate to `/financeiro/procedimentos`.
Expected: page loads, "Novo procedimento" dialog creates a procedure that appears in the list, "Editar" pre-fills the form, "Desativar" marks it inactive (badge appears, button disappears).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/financeiro/procedimentos" src/components/finance/procedures-client.tsx src/components/finance/procedure-dialog.tsx
git commit -m "feat(finance): add procedures list and create/edit UI"
```

---

## Task 10: Lançamentos page (list + new entry dialog)

**Files:**
- Create: `src/app/(app)/financeiro/lancamentos/page.tsx`
- Create: `src/components/finance/entries-client.tsx`
- Create: `src/components/finance/new-entry-dialog.tsx`

**Interfaces:**
- Consumes: `listFinancialEntriesAction`, `createFinancialEntryAction`, `listProceduresAction`, `getProcedureDefaultsAction` (Task 8), `FinancialEntry`, `Procedure` (Task 2)
- Produces: `/financeiro/lancamentos` route.

- [ ] **Step 1: Write `new-entry-dialog.tsx`**

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
import {
  createFinancialEntryAction,
  getProcedureDefaultsAction,
} from "@/app/(app)/financeiro/actions";
import type { Procedure } from "@/modules/finance/types";

const today = () => new Date().toISOString().slice(0, 10);

export function NewEntryDialog({
  procedures,
  onCreated,
}: {
  procedures: Procedure[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"revenue" | "expense">("revenue");
  const [procedureId, setProcedureId] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setType("revenue");
    setProcedureId("");
    setAmount("");
    setCategory("");
    setError(null);
  }

  async function handleProcedureChange(id: string) {
    setProcedureId(id);
    if (!id) return;
    const defaults = await getProcedureDefaultsAction(id);
    setAmount(String(defaults.defaultPrice));
    setCategory(defaults.category ?? "");
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      await createFinancialEntryAction({
        type,
        amount: Number(formData.get("amount")),
        category: String(formData.get("category") ?? "") || undefined,
        procedureId: type === "revenue" && procedureId ? procedureId : undefined,
        description: String(formData.get("description") ?? "") || undefined,
        occurredAt: String(formData.get("occurredAt") ?? today()),
      });
      setOpen(false);
      resetForm();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar lançamento");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Novo lançamento</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <Label htmlFor="type">Tipo</Label>
            <select
              id="type"
              value={type}
              onChange={(e) => {
                setType(e.target.value as "revenue" | "expense");
                setProcedureId("");
              }}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="revenue">Receita</option>
              <option value="expense">Despesa</option>
            </select>
          </div>
          {type === "revenue" && (
            <div className="space-y-1">
              <Label htmlFor="procedureId">Procedimento (opcional)</Label>
              <select
                id="procedureId"
                value={procedureId}
                onChange={(e) => handleProcedureChange(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Nenhum</option>
                {procedures
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="category">Categoria</Label>
            <Input
              id="category"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required={type === "expense"}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="occurredAt">Data</Label>
            <Input id="occurredAt" name="occurredAt" type="date" defaultValue={today()} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" />
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

- [ ] **Step 2: Write `entries-client.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewEntryDialog } from "@/components/finance/new-entry-dialog";
import { listFinancialEntriesAction } from "@/app/(app)/financeiro/actions";
import type { FinancialEntry } from "@/modules/finance/types";
import type { Procedure } from "@/modules/finance/types";

export function EntriesClient({
  initialEntries,
  procedures,
  range,
}: {
  initialEntries: FinancialEntry[];
  procedures: Procedure[];
  range: { from: string; to: string };
}) {
  const [entries, setEntries] = useState(initialEntries);

  async function refresh() {
    setEntries(await listFinancialEntriesAction(range));
  }

  return (
    <div className="space-y-4 px-6 pb-6">
      <div className="flex justify-end">
        <NewEntryDialog procedures={procedures} onCreated={refresh} />
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {entries.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              Nenhum lançamento neste período.
            </p>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">
                  {entry.category ?? "Sem categoria"}
                  {entry.description ? ` — ${entry.description}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">{entry.occurredAt}</p>
              </div>
              <Badge
                variant={entry.type === "revenue" ? "outline" : "destructive"}
                className={entry.type === "revenue" ? "border-green-600 text-green-700" : ""}
              >
                {entry.type === "revenue" ? "+" : "-"} R$ {entry.amount.toFixed(2)}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Write `page.tsx`**

```tsx
import { listFinancialEntriesAction, listProceduresAction } from "../actions";
import { EntriesClient } from "@/components/finance/entries-client";
import { PageHeader } from "@/components/layout/page-header";

function currentMonthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function EntriesPage() {
  const range = currentMonthRange();
  const [entries, procedures] = await Promise.all([
    listFinancialEntriesAction(range),
    listProceduresAction({ activeOnly: true }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Lançamentos"
        description="Receitas e despesas do mês atual."
      />
      <EntriesClient initialEntries={entries} procedures={procedures} range={range} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, navigate to `/financeiro/lancamentos`.
Expected: "Novo lançamento" creates a revenue entry (selecting a procedure pre-fills valor/categoria, still editable) and an expense entry (categoria required, no procedure selector shown); both appear in the list with the right sign/color.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/financeiro/lancamentos" src/components/finance/entries-client.tsx src/components/finance/new-entry-dialog.tsx
git commit -m "feat(finance): add financial entries list and creation UI"
```

---

## Task 11: Dashboard page (metrics, chart, top procedures)

**Files:**
- Modify: `package.json` (add `recharts` dependency)
- Create: `src/app/(app)/financeiro/page.tsx`
- Create: `src/components/finance/finance-dashboard-client.tsx`

**Interfaces:**
- Consumes: `getDashboardMetricsAction` (Task 8), `DashboardMetrics` (Task 2), `recharts` (`BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`)
- Produces: `/financeiro` route (the dashboard root, matching the sidebar's `href: "/financeiro"`).

- [ ] **Step 1: Install Recharts**

Run: `npm install recharts`
Expected: `recharts` added to `package.json` dependencies.

- [ ] **Step 2: Write `finance-dashboard-client.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDashboardMetricsAction } from "@/app/(app)/financeiro/actions";
import type { DashboardMetrics } from "@/modules/finance/types";

type Preset = "week" | "month" | "custom";

function rangeForPreset(preset: Preset): { from: string; to: string } {
  const now = new Date();
  if (preset === "week") {
    const day = now.getUTCDay();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 6));
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

export function FinanceDashboardClient({ initialMetrics }: { initialMetrics: DashboardMetrics }) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [preset, setPreset] = useState<Preset>("month");

  async function applyPreset(next: Preset) {
    setPreset(next);
    const range = rangeForPreset(next);
    setMetrics(await getDashboardMetricsAction(range));
  }

  async function applyCustomRange(from: string, to: string) {
    setPreset("custom");
    setMetrics(await getDashboardMetricsAction({ from, to }));
  }

  const chartData = [
    { name: "Receita", value: metrics.revenueTotal },
    { name: "Despesa", value: metrics.expenseTotal },
  ];

  return (
    <div className="space-y-4 px-6 pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={preset === "week" ? "default" : "outline"} size="sm" onClick={() => applyPreset("week")}>
          Semana
        </Button>
        <Button variant={preset === "month" ? "default" : "outline"} size="sm" onClick={() => applyPreset("month")}>
          Mês
        </Button>
        <input
          type="date"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          defaultValue={metrics.period.from}
          onChange={(e) => applyCustomRange(e.target.value, metrics.period.to)}
        />
        <span className="text-sm text-muted-foreground">até</span>
        <input
          type="date"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          defaultValue={metrics.period.to}
          onChange={(e) => applyCustomRange(metrics.period.from, e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Receita</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(metrics.revenueTotal)}</p>
            <p className="text-sm text-muted-foreground">
              {metrics.revenueChangePct === null
                ? "Sem dados do período anterior"
                : `${metrics.revenueChangePct >= 0 ? "+" : ""}${metrics.revenueChangePct.toFixed(1)}% vs. período anterior`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Despesa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(metrics.expenseTotal)}</p>
            <p className="text-sm text-muted-foreground">Saldo: {formatCurrency(metrics.balance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Ticket médio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {metrics.averageTicket === null ? "—" : formatCurrency(metrics.averageTicket)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Taxa de cancelamento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-muted-foreground">—</p>
            <p className="text-sm text-muted-foreground">Disponível quando a Agenda estiver conectada</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receita x Despesa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="value" fill="#FF7900" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Procedimentos mais vendidos</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {metrics.topProcedures.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">Nenhuma receita vinculada a procedimento neste período.</p>
          )}
          {metrics.topProcedures.map((row) => (
            <div key={row.procedureId} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{row.procedureName}</p>
                <p className="text-sm text-muted-foreground">{row.count} atendimento(s)</p>
              </div>
              <p className="font-semibold">{formatCurrency(row.totalAmount)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Write `page.tsx`**

```tsx
import { getDashboardMetricsAction } from "./actions";
import { FinanceDashboardClient } from "@/components/finance/finance-dashboard-client";
import { PageHeader } from "@/components/layout/page-header";

function currentMonthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default async function FinancePage() {
  const metrics = await getDashboardMetricsAction(currentMonthRange());

  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Dashboard"
        description="Receita, despesa e desempenho por procedimento."
      />
      <FinanceDashboardClient initialMetrics={metrics} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, navigate to `/financeiro` (via sidebar "Financeiro" link, now enabled).
Expected: dashboard loads with current-month metrics; switching "Semana"/"Mês" and picking custom dates re-fetches and updates cards, chart, and top-procedures table; entries created in Task 10 show up in the revenue/expense totals and (if linked to a procedure) in "Procedimentos mais vendidos"; taxa de cancelamento card shows the "—" placeholder.

- [ ] **Step 6: Run the full test suite**

Run: `npm run test`
Expected: all tests pass (CRM + finance).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json "src/app/(app)/financeiro/page.tsx" src/components/finance/finance-dashboard-client.tsx
git commit -m "feat(finance): add dashboard page with period filter, chart, and top procedures"
```

---

## Post-plan note

This plan intentionally stops at manual revenue/expense entry — it does not touch `Appointment` or `scheduling` in any way. Once the Agendamento branch is merged, the follow-up work is: (1) a small migration adding the FK from `financial_entries.appointment_id` to `appointments.id`, (2) a `suggestFinancialEntryForAppointment` function in `src/modules/finance/service.ts` called from `scheduling`'s "mark as completed" flow, and (3) wiring `cancellationRate` in `getDashboardMetrics` to real `Appointment` status data. None of that is in scope here.
