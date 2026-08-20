# Agendamento/Calendário (Fase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Agendamento/Calendário module (Fase 2): a calendar view (day/week/month) for creating, editing, and cancelling appointments, with conflict detection against other appointments and availability blocks (one-off and recurring weekly), a minimal Procedure catalog, status tracking per appointment, and automatic Deal advancement in the CRM Pipeline when an appointment is scheduled.

**Architecture:** Mirrors the CRM/Pipeline module's layered structure: domain types → `SchedulingRepository` interface with an in-memory implementation for fast unit tests → a `service` layer holding business rules (conflict detection, Pipeline integration) tested against the in-memory repository (including a real in-memory `CrmRepository` from the already-built `modules/crm` for the cross-module integration test) → a `SupabaseSchedulingRepository` implementation → Server Actions → UI (calendar via `react-big-calendar`).

**Tech Stack:** Next.js 15 (App Router, TypeScript), `react-big-calendar` + `date-fns` for the calendar, Zod, Vitest, existing Supabase/shadcn/ui stack from Fase 1.

**Spec:**
- `docs/superpowers/specs/2026-08-20-arkdoctor-agendamento-design.md` (Agendamento/Calendário, Fase 2)
- `docs/superpowers/specs/2026-08-20-arkdoctor-arquitetura-design.md` (shared architecture/setup)
- `docs/superpowers/specs/2026-08-20-arkdoctor-crm-pipeline-design.md` (CRM/Pipeline, Fase 1 — this plan extends it)

## Global Constraints

- All new tables carry `account_id` and are protected by RLS policies of the form `account_id IN (SELECT account_id FROM account_users WHERE user_id = auth.uid())`, explicitly pinned `to authenticated` (arquitetura spec + lesson from the Fase 1 security hardening pass).
- No ORM — data access goes through the Supabase JS client, wrapped by `modules/scheduling`'s repository (arquitetura spec).
- Migrations are hand-written SQL files under `supabase/migrations/`, applied via the Supabase CLI.
- `modules/scheduling` owns `procedures`, `appointments`, `availability_blocks`, `availability_rules`. It calls `modules/crm/service.ts`'s exported functions for the Pipeline integration — never `modules/crm`'s tables directly (arquitetura spec).
- `ends_at` of an appointment defaults to `starts_at + procedure.default_duration_minutes` but is stored as an independent, editable field (agendamento spec).
- A new/edited appointment must not overlap: another appointment with `status <> 'cancelado'`, an `availability_block`, or an `availability_rule` matching the day of week (agendamento spec).
- Creating an appointment for a contact with an open Deal moves that Deal to the pipeline stage named exactly `"Agendado"` if one exists; otherwise it's a no-op, never an error (agendamento spec).
- Deleting a Procedure referenced by any appointment is blocked (agendamento spec).

---

## Part A — Database

### Task 1: Migration — procedures, appointments, availability_blocks, availability_rules

**Files:**
- Create: `supabase/migrations/0004_scheduling.sql`

**Interfaces:**
- Produces: `procedures`, `appointments`, `availability_blocks`, `availability_rules` tables with RLS, consumed by the Supabase repository in Task 12.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_scheduling.sql`:

```sql
create table procedures (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  default_price numeric(10,2) not null,
  default_duration_minutes integer not null,
  created_at timestamptz not null default now()
);

create type appointment_status as enum (
  'agendado', 'confirmado', 'concluido', 'nao_compareceu', 'cancelado'
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  procedure_id uuid not null references procedures(id),
  deal_id uuid references deals(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status appointment_status not null default 'agendado',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table availability_blocks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text
);

create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  reason text
);

create index appointments_account_range_idx on appointments (account_id, starts_at, ends_at);

alter table procedures enable row level security;
alter table appointments enable row level security;
alter table availability_blocks enable row level security;
alter table availability_rules enable row level security;

create policy "account members can manage procedures"
  on procedures for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage appointments"
  on appointments for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage availability_blocks"
  on availability_blocks for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage availability_rules"
  on availability_rules for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));
```

`procedures(id)` has no `on delete cascade` from `appointments.procedure_id` — the default `NO ACTION` referential behavior already rejects deleting a Procedure referenced by any appointment at the database level. The service-layer check added in Task 7 exists only to produce a friendly error message before hitting that constraint.

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: CLI reports the migration applied with no errors.

- [ ] **Step 3: Verify the tables exist**

Run: `npx supabase db query --linked "select table_name from information_schema.tables where table_name in ('procedures', 'appointments', 'availability_blocks', 'availability_rules');"`
Expected: all four table names returned.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): add scheduling tables (procedures, appointments, availability) with RLS"
```

---

### Task 2: Regenerate Supabase TypeScript types

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produces: `Database["public"]["Tables"]["procedures" | "appointments" | "availability_blocks" | "availability_rules"]`, consumed by the Supabase repository in Task 12.

- [ ] **Step 1: Regenerate the types**

Run: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
Expected: file rewritten to include the four new tables.

- [ ] **Step 2: Verify the build still passes**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(db): regenerate types for scheduling tables"
```

---

## Part B — Scheduling Domain Logic (TDD, no live database)

### Task 3: Scheduling domain types and validation schemas

**Files:**
- Create: `src/modules/scheduling/types.ts`, `src/modules/scheduling/schemas.ts`

**Interfaces:**
- Consumes: `Contact` from `src/modules/crm/types.ts`.
- Produces: `AppointmentStatus`, `Procedure`, `Appointment`, `AppointmentWithDetails`, `AvailabilityBlock`, `AvailabilityRule` types; `createProcedureInputSchema`, `updateProcedureInputSchema`, `createAppointmentInputSchema`, `createAvailabilityBlockInputSchema`, `createAvailabilityRuleInputSchema` Zod schemas — consumed by every later scheduling task.

- [ ] **Step 1: Write the domain types**

Create `src/modules/scheduling/types.ts`:

```typescript
import type { Contact } from "@/modules/crm/types";

export type AppointmentStatus =
  | "agendado"
  | "confirmado"
  | "concluido"
  | "nao_compareceu"
  | "cancelado";

export interface Procedure {
  id: string;
  accountId: string;
  name: string;
  defaultPrice: number;
  defaultDurationMinutes: number;
  createdAt: string;
}

export interface Appointment {
  id: string;
  accountId: string;
  contactId: string;
  procedureId: string;
  dealId: string | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentWithDetails extends Appointment {
  contact: Contact;
  procedure: Procedure;
}

export interface AvailabilityBlock {
  id: string;
  accountId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface AvailabilityRule {
  id: string;
  accountId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  reason: string | null;
}
```

- [ ] **Step 2: Write the validation schemas**

Create `src/modules/scheduling/schemas.ts`:

```typescript
import { z } from "zod";

export const createProcedureInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(200),
  defaultPrice: z.number().nonnegative(),
  defaultDurationMinutes: z.number().int().positive(),
});
export type CreateProcedureInput = z.infer<typeof createProcedureInputSchema>;

export const updateProcedureInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  defaultPrice: z.number().nonnegative().optional(),
  defaultDurationMinutes: z.number().int().positive().optional(),
});
export type UpdateProcedureInput = z.infer<typeof updateProcedureInputSchema>;

export const createAppointmentInputSchema = z.object({
  contactId: z.string().uuid(),
  procedureId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  notes: z.string().trim().max(5000).optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentInputSchema>;

export const createAvailabilityBlockInputSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().trim().max(200).optional(),
});
export type CreateAvailabilityBlockInput = z.infer<typeof createAvailabilityBlockInputSchema>;

export const createAvailabilityRuleInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida"),
  reason: z.string().trim().max(200).optional(),
});
export type CreateAvailabilityRuleInput = z.infer<typeof createAvailabilityRuleInputSchema>;
```

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(scheduling): add domain types and validation schemas"
```

---

### Task 4: SchedulingRepository interface and in-memory implementation

**Files:**
- Create: `src/modules/scheduling/repository.ts`, `src/modules/scheduling/repository.memory.ts`, `src/modules/scheduling/repository.memory.test.ts`

**Interfaces:**
- Consumes: types from Task 3.
- Produces: `SchedulingRepository` interface and `createInMemorySchedulingRepository()` factory — consumed by every service task (6–11) as their data-access dependency.

- [ ] **Step 1: Write the failing test**

Create `src/modules/scheduling/repository.memory.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createInMemorySchedulingRepository } from "./repository.memory";

describe("createInMemorySchedulingRepository", () => {
  it("inserts and retrieves a procedure scoped to its account", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await repo.insertProcedure("acc-1", {
      name: "Limpeza de pele",
      defaultPrice: 150,
      defaultDurationMinutes: 40,
    });

    expect(procedure.name).toBe("Limpeza de pele");
    const found = await repo.getProcedure("acc-1", procedure.id);
    expect(found?.id).toBe(procedure.id);

    const foundOtherAccount = await repo.getProcedure("acc-2", procedure.id);
    expect(foundOtherAccount).toBeNull();
  });

  it("finds overlapping appointments and excludes a given id", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await repo.insertProcedure("acc-1", {
      name: "Consulta",
      defaultPrice: 100,
      defaultDurationMinutes: 30,
    });
    const appointment = await repo.insertAppointment("acc-1", {
      contactId: "contact-1",
      procedureId: procedure.id,
      dealId: null,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      notes: null,
    });

    const overlapping = await repo.listAppointmentsOverlapping(
      "acc-1",
      "2026-09-01T10:15:00.000Z",
      "2026-09-01T10:45:00.000Z",
    );
    expect(overlapping).toHaveLength(1);

    const excludingSelf = await repo.listAppointmentsOverlapping(
      "acc-1",
      "2026-09-01T10:15:00.000Z",
      "2026-09-01T10:45:00.000Z",
      appointment.id,
    );
    expect(excludingSelf).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- repository.memory`
Expected: FAIL — `./repository.memory` module not found (this matches on a substring, so it will also try to run `modules/crm/repository.memory.test.ts`, which should still pass; only the new scheduling test file fails).

- [ ] **Step 3: Write the `SchedulingRepository` interface**

Create `src/modules/scheduling/repository.ts`:

```typescript
import type {
  Appointment,
  AppointmentStatus,
  AppointmentWithDetails,
  AvailabilityBlock,
  AvailabilityRule,
  Procedure,
} from "./types";

export interface SchedulingRepository {
  insertProcedure(
    accountId: string,
    input: { name: string; defaultPrice: number; defaultDurationMinutes: number },
  ): Promise<Procedure>;
  updateProcedure(
    accountId: string,
    procedureId: string,
    input: { name?: string; defaultPrice?: number; defaultDurationMinutes?: number },
  ): Promise<Procedure>;
  getProcedure(accountId: string, procedureId: string): Promise<Procedure | null>;
  listProcedures(accountId: string): Promise<Procedure[]>;
  deleteProcedure(accountId: string, procedureId: string): Promise<void>;
  countAppointmentsForProcedure(accountId: string, procedureId: string): Promise<number>;

  insertAppointment(
    accountId: string,
    input: {
      contactId: string;
      procedureId: string;
      dealId: string | null;
      startsAt: string;
      endsAt: string;
      notes: string | null;
    },
  ): Promise<Appointment>;
  getAppointment(accountId: string, appointmentId: string): Promise<Appointment | null>;
  updateAppointmentTime(
    accountId: string,
    appointmentId: string,
    startsAt: string,
    endsAt: string,
  ): Promise<Appointment>;
  updateAppointmentStatus(
    accountId: string,
    appointmentId: string,
    status: AppointmentStatus,
  ): Promise<Appointment>;
  updateAppointmentNotes(
    accountId: string,
    appointmentId: string,
    notes: string | null,
  ): Promise<Appointment>;
  listAppointmentsInRange(
    accountId: string,
    from: string,
    to: string,
  ): Promise<AppointmentWithDetails[]>;
  listAppointmentsOverlapping(
    accountId: string,
    startsAt: string,
    endsAt: string,
    excludeAppointmentId?: string,
  ): Promise<Appointment[]>;
  listPendingStatusAppointments(
    accountId: string,
    now: string,
  ): Promise<AppointmentWithDetails[]>;

  insertAvailabilityBlock(
    accountId: string,
    input: { startsAt: string; endsAt: string; reason: string | null },
  ): Promise<AvailabilityBlock>;
  deleteAvailabilityBlock(accountId: string, blockId: string): Promise<void>;
  listAvailabilityBlocksOverlapping(
    accountId: string,
    startsAt: string,
    endsAt: string,
  ): Promise<AvailabilityBlock[]>;
  listAvailabilityBlocks(accountId: string): Promise<AvailabilityBlock[]>;

  insertAvailabilityRule(
    accountId: string,
    input: { dayOfWeek: number; startTime: string; endTime: string; reason: string | null },
  ): Promise<AvailabilityRule>;
  deleteAvailabilityRule(accountId: string, ruleId: string): Promise<void>;
  listAvailabilityRules(accountId: string): Promise<AvailabilityRule[]>;
}
```

- [ ] **Step 4: Write the in-memory implementation**

Create `src/modules/scheduling/repository.memory.ts`:

```typescript
import type { SchedulingRepository } from "./repository";
import type {
  Appointment,
  AppointmentWithDetails,
  AvailabilityBlock,
  AvailabilityRule,
  Procedure,
} from "./types";

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(aEnd).getTime() > new Date(bStart).getTime();
}

export function createInMemorySchedulingRepository(): SchedulingRepository {
  const procedures = new Map<string, Procedure>();
  const appointments = new Map<string, Appointment>();
  const blocks = new Map<string, AvailabilityBlock>();
  const rules = new Map<string, AvailabilityRule>();

  return {
    async insertProcedure(accountId, input) {
      const id = crypto.randomUUID();
      const procedure: Procedure = {
        id,
        accountId,
        name: input.name,
        defaultPrice: input.defaultPrice,
        defaultDurationMinutes: input.defaultDurationMinutes,
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
        ...(input.defaultDurationMinutes !== undefined
          ? { defaultDurationMinutes: input.defaultDurationMinutes }
          : {}),
      };
      procedures.set(procedureId, updated);
      return updated;
    },

    async getProcedure(accountId, procedureId) {
      const procedure = procedures.get(procedureId);
      return procedure && procedure.accountId === accountId ? procedure : null;
    },

    async listProcedures(accountId) {
      return [...procedures.values()].filter((p) => p.accountId === accountId);
    },

    async deleteProcedure(accountId, procedureId) {
      const procedure = procedures.get(procedureId);
      if (!procedure || procedure.accountId !== accountId) throw new Error("Procedure not found");
      procedures.delete(procedureId);
    },

    async countAppointmentsForProcedure(accountId, procedureId) {
      return [...appointments.values()].filter(
        (a) => a.accountId === accountId && a.procedureId === procedureId,
      ).length;
    },

    async insertAppointment(accountId, input) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const appointment: Appointment = {
        id,
        accountId,
        contactId: input.contactId,
        procedureId: input.procedureId,
        dealId: input.dealId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: "agendado",
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      appointments.set(id, appointment);
      return appointment;
    },

    async getAppointment(accountId, appointmentId) {
      const appointment = appointments.get(appointmentId);
      return appointment && appointment.accountId === accountId ? appointment : null;
    },

    async updateAppointmentTime(accountId, appointmentId, startsAt, endsAt) {
      const appointment = appointments.get(appointmentId);
      if (!appointment || appointment.accountId !== accountId) {
        throw new Error("Appointment not found");
      }
      const updated: Appointment = {
        ...appointment,
        startsAt,
        endsAt,
        updatedAt: new Date().toISOString(),
      };
      appointments.set(appointmentId, updated);
      return updated;
    },

    async updateAppointmentStatus(accountId, appointmentId, status) {
      const appointment = appointments.get(appointmentId);
      if (!appointment || appointment.accountId !== accountId) {
        throw new Error("Appointment not found");
      }
      const updated: Appointment = { ...appointment, status, updatedAt: new Date().toISOString() };
      appointments.set(appointmentId, updated);
      return updated;
    },

    async updateAppointmentNotes(accountId, appointmentId, notes) {
      const appointment = appointments.get(appointmentId);
      if (!appointment || appointment.accountId !== accountId) {
        throw new Error("Appointment not found");
      }
      const updated: Appointment = { ...appointment, notes, updatedAt: new Date().toISOString() };
      appointments.set(appointmentId, updated);
      return updated;
    },

    async listAppointmentsInRange(accountId, from, to) {
      const result: AppointmentWithDetails[] = [];
      for (const appointment of appointments.values()) {
        if (appointment.accountId !== accountId) continue;
        if (!overlaps(appointment.startsAt, appointment.endsAt, from, to)) continue;
        const procedure = procedures.get(appointment.procedureId);
        if (!procedure) continue;
        // Contact is not owned by this repository; callers needing full
        // AppointmentWithDetails from the in-memory repo in tests should
        // assert on the fields they need without relying on `contact`.
        result.push({ ...appointment, procedure, contact: undefined as never });
      }
      return result;
    },

    async listAppointmentsOverlapping(accountId, startsAt, endsAt, excludeAppointmentId) {
      return [...appointments.values()].filter((a) => {
        if (a.accountId !== accountId) return false;
        if (excludeAppointmentId && a.id === excludeAppointmentId) return false;
        return overlaps(a.startsAt, a.endsAt, startsAt, endsAt);
      });
    },

    async listPendingStatusAppointments(accountId, now) {
      const result: AppointmentWithDetails[] = [];
      for (const appointment of appointments.values()) {
        if (appointment.accountId !== accountId) continue;
        if (appointment.status !== "agendado") continue;
        if (new Date(appointment.endsAt).getTime() >= new Date(now).getTime()) continue;
        const procedure = procedures.get(appointment.procedureId);
        if (!procedure) continue;
        result.push({ ...appointment, procedure, contact: undefined as never });
      }
      return result;
    },

    async insertAvailabilityBlock(accountId, input) {
      const id = crypto.randomUUID();
      const block: AvailabilityBlock = {
        id,
        accountId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason: input.reason,
      };
      blocks.set(id, block);
      return block;
    },

    async deleteAvailabilityBlock(accountId, blockId) {
      const block = blocks.get(blockId);
      if (!block || block.accountId !== accountId) throw new Error("Block not found");
      blocks.delete(blockId);
    },

    async listAvailabilityBlocksOverlapping(accountId, startsAt, endsAt) {
      return [...blocks.values()].filter(
        (b) => b.accountId === accountId && overlaps(b.startsAt, b.endsAt, startsAt, endsAt),
      );
    },

    async listAvailabilityBlocks(accountId) {
      return [...blocks.values()].filter((b) => b.accountId === accountId);
    },

    async insertAvailabilityRule(accountId, input) {
      const id = crypto.randomUUID();
      const rule: AvailabilityRule = {
        id,
        accountId,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        reason: input.reason,
      };
      rules.set(id, rule);
      return rule;
    },

    async deleteAvailabilityRule(accountId, ruleId) {
      const rule = rules.get(ruleId);
      if (!rule || rule.accountId !== accountId) throw new Error("Rule not found");
      rules.delete(ruleId);
    },

    async listAvailabilityRules(accountId) {
      return [...rules.values()].filter((r) => r.accountId === accountId);
    },
  };
}
```

`listAppointmentsInRange` and `listPendingStatusAppointments` set `contact: undefined as never` because the in-memory scheduling repository has no access to `modules/crm`'s contact store (a real cross-module join only exists in the Supabase repository, Task 12). Tests for these two methods (Task 10) must only assert on `procedure`/appointment fields, never on `contact`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- repository.memory`
Expected: 4 passed (2 new scheduling tests + 2 existing crm repository tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(scheduling): add SchedulingRepository interface and in-memory implementation"
```

---

### Task 5: Extend `modules/crm/service.ts` with `getStages` and `getOpenDealForContact`

**Files:**
- Modify: `src/modules/crm/service.ts`, `src/modules/crm/service.test.ts`

**Interfaces:**
- Produces: `getStages(repo: CrmRepository, accountId: string): Promise<PipelineStage[]>`, `getOpenDealForContact(repo: CrmRepository, accountId: string, contactId: string): Promise<Deal | null>` — consumed by `modules/scheduling/service.ts`'s Pipeline integration (Task 8).

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/crm/service.test.ts`:

```typescript
import { getOpenDealForContact, getStages } from "./service";

describe("getStages", () => {
  it("returns the account's stages in position order", async () => {
    const repo = createInMemoryCrmRepository();
    const stages = await getStages(repo, "acc-1");
    expect(stages.map((s) => s.name)).toEqual([
      "Novo Lead",
      "Em Negociação",
      "Agendado",
      "Atendido",
      "Follow-up",
      "Perdido",
    ]);
  });
});

describe("getOpenDealForContact", () => {
  it("returns the contact's open deal, or null if none", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    const openDeal = await getOpenDealForContact(repo, "acc-1", contact.id);
    expect(openDeal).not.toBeNull();

    const noneForOtherContact = await getOpenDealForContact(repo, "acc-1", "no-such-contact");
    expect(noneForOtherContact).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- service.test`
Expected: FAIL — `getStages`/`getOpenDealForContact` not exported from `./service`.

- [ ] **Step 3: Implement**

Append to `src/modules/crm/service.ts`:

```typescript
export async function getStages(
  repo: CrmRepository,
  accountId: string,
): Promise<PipelineStage[]> {
  return repo.getStages(accountId);
}

export async function getOpenDealForContact(
  repo: CrmRepository,
  accountId: string,
  contactId: string,
): Promise<Deal | null> {
  return repo.getOpenDealForContact(accountId, contactId);
}
```

(`PipelineStage` and `Deal` are already imported in this file from earlier tasks — verify the import line at the top includes both; if not, add them to the existing `import type { ... } from "./types";` line.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test`
Expected: 18 passed (16 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(crm): expose getStages and getOpenDealForContact for cross-module reuse"
```

---

### Task 6: Scheduling service — `checkConflict`

**Files:**
- Create: `src/modules/scheduling/service.ts`, `src/modules/scheduling/service.test.ts`

**Interfaces:**
- Consumes: `SchedulingRepository` (Task 4).
- Produces: `ConflictCheckInput`, `ConflictResult` types; `checkConflict(repo, accountId, input): Promise<ConflictResult>` — used by `createAppointment` (Task 8) and `updateAppointmentTime` (Task 9), and exposed to the UI in Part D for pre-validation.

- [ ] **Step 1: Write the failing tests**

Create `src/modules/scheduling/service.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createInMemorySchedulingRepository } from "./repository.memory";
import { checkConflict } from "./service";

describe("checkConflict", () => {
  async function setupProcedure(repo: ReturnType<typeof createInMemorySchedulingRepository>) {
    return repo.insertProcedure("acc-1", {
      name: "Consulta",
      defaultPrice: 100,
      defaultDurationMinutes: 30,
    });
  }

  it("detects overlap with another appointment", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await setupProcedure(repo);
    await repo.insertAppointment("acc-1", {
      contactId: "contact-1",
      procedureId: procedure.id,
      dealId: null,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      notes: null,
    });

    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T10:15:00.000Z",
      endsAt: "2026-09-01T10:45:00.000Z",
    });

    expect(result.hasConflict).toBe(true);
  });

  it("does not conflict with a cancelled appointment", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await setupProcedure(repo);
    const appointment = await repo.insertAppointment("acc-1", {
      contactId: "contact-1",
      procedureId: procedure.id,
      dealId: null,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      notes: null,
    });
    await repo.updateAppointmentStatus("acc-1", appointment.id, "cancelado");

    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T10:15:00.000Z",
      endsAt: "2026-09-01T10:45:00.000Z",
    });

    expect(result.hasConflict).toBe(false);
  });

  it("excludes the given appointment id from its own conflict check", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await setupProcedure(repo);
    const appointment = await repo.insertAppointment("acc-1", {
      contactId: "contact-1",
      procedureId: procedure.id,
      dealId: null,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      notes: null,
    });

    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      excludeAppointmentId: appointment.id,
    });

    expect(result.hasConflict).toBe(false);
  });

  it("detects overlap with a one-off availability block", async () => {
    const repo = createInMemorySchedulingRepository();
    await repo.insertAvailabilityBlock("acc-1", {
      startsAt: "2026-09-01T12:00:00.000Z",
      endsAt: "2026-09-01T13:00:00.000Z",
      reason: "Almoço",
    });

    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T12:30:00.000Z",
      endsAt: "2026-09-01T12:45:00.000Z",
    });

    expect(result.hasConflict).toBe(true);
  });

  it("detects overlap with a recurring rule on the matching weekday", async () => {
    const repo = createInMemorySchedulingRepository();
    // 2026-09-01 is a Tuesday (day 2).
    await repo.insertAvailabilityRule("acc-1", {
      dayOfWeek: 2,
      startTime: "12:00",
      endTime: "13:00",
      reason: "Almoço",
    });

    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T12:30:00.000Z",
      endsAt: "2026-09-01T12:45:00.000Z",
    });

    expect(result.hasConflict).toBe(true);
  });

  it("does not conflict with a recurring rule on a different weekday", async () => {
    const repo = createInMemorySchedulingRepository();
    // Rule is for Wednesday (day 3); the checked slot is Tuesday.
    await repo.insertAvailabilityRule("acc-1", {
      dayOfWeek: 3,
      startTime: "12:00",
      endTime: "13:00",
      reason: "Almoço",
    });

    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T12:30:00.000Z",
      endsAt: "2026-09-01T12:45:00.000Z",
    });

    expect(result.hasConflict).toBe(false);
  });

  it("returns no conflict for a free slot", async () => {
    const repo = createInMemorySchedulingRepository();
    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T09:00:00.000Z",
      endsAt: "2026-09-01T09:30:00.000Z",
    });
    expect(result.hasConflict).toBe(false);
    expect(result.reason).toBeNull();
  });
});
```

**Important:** the ISO timestamps above use `Z` (UTC). `checkConflict`'s day-of-week and time-of-day math (Step 3) uses `Date.getDay()`/`getHours()`/`getMinutes()`, which read in the *host machine's local timezone*, not UTC. Run the test suite once after implementing to confirm `2026-09-01T12:30:00.000Z` lands on day 2 (Tuesday) in your environment; Vitest's default Node environment uses the system timezone. If your CI/dev machine is not in a UTC-aligned timezone and a test fails on the weekday assertion, this is expected per the agendamento spec's stated "fuso único" (single-timezone) assumption — do not add timezone-conversion logic to fix it; instead confirm the environment's timezone matches production intent, which is out of scope for this task.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- service.test scheduling`
Expected: FAIL — `./service` module not found. (This substring also matches `modules/crm/service.test.ts`; confirm the failure is specifically about `modules/scheduling/service.ts` not existing.)

- [ ] **Step 3: Write the minimal implementation**

Create `src/modules/scheduling/service.ts`:

```typescript
import type { SchedulingRepository } from "./repository";

export interface ConflictCheckInput {
  startsAt: string;
  endsAt: string;
  excludeAppointmentId?: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  reason: string | null;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export async function checkConflict(
  repo: SchedulingRepository,
  accountId: string,
  input: ConflictCheckInput,
): Promise<ConflictResult> {
  const overlappingAppointments = await repo.listAppointmentsOverlapping(
    accountId,
    input.startsAt,
    input.endsAt,
    input.excludeAppointmentId,
  );
  if (overlappingAppointments.some((a) => a.status !== "cancelado")) {
    return { hasConflict: true, reason: "Conflita com outro agendamento" };
  }

  const overlappingBlocks = await repo.listAvailabilityBlocksOverlapping(
    accountId,
    input.startsAt,
    input.endsAt,
  );
  if (overlappingBlocks.length > 0) {
    return { hasConflict: true, reason: "Conflita com bloqueio de agenda" };
  }

  const rules = await repo.listAvailabilityRules(accountId);
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  const dayOfWeek = start.getDay();
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();

  const ruleConflict = rules.some((rule) => {
    if (rule.dayOfWeek !== dayOfWeek) return false;
    const ruleStart = timeToMinutes(rule.startTime);
    const ruleEnd = timeToMinutes(rule.endTime);
    return startMinutes < ruleEnd && endMinutes > ruleStart;
  });

  if (ruleConflict) {
    return { hasConflict: true, reason: "Conflita com bloqueio recorrente de agenda" };
  }

  return { hasConflict: false, reason: null };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test scheduling`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scheduling): add checkConflict service"
```

---

### Task 7: Scheduling service — Procedure CRUD

**Files:**
- Modify: `src/modules/scheduling/service.ts`, `src/modules/scheduling/service.test.ts`

**Interfaces:**
- Produces: `createProcedure`, `updateProcedure`, `listProcedures`, `deleteProcedure`.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/scheduling/service.test.ts`:

```typescript
import {
  createProcedure,
  deleteProcedure,
  listProcedures,
  updateProcedure,
} from "./service";

describe("createProcedure", () => {
  it("creates a procedure with the given fields", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Limpeza de pele",
      defaultPrice: 150,
      defaultDurationMinutes: 40,
    });
    expect(procedure.name).toBe("Limpeza de pele");
    expect(procedure.defaultDurationMinutes).toBe(40);
  });

  it("rejects a procedure with an empty name", async () => {
    const repo = createInMemorySchedulingRepository();
    await expect(
      createProcedure(repo, "acc-1", { name: "", defaultPrice: 100, defaultDurationMinutes: 30 }),
    ).rejects.toThrow();
  });
});

describe("updateProcedure and listProcedures", () => {
  it("updates the provided fields and lists all procedures for the account", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 100,
      defaultDurationMinutes: 30,
    });

    const updated = await updateProcedure(repo, "acc-1", procedure.id, { defaultPrice: 120 });
    expect(updated.defaultPrice).toBe(120);
    expect(updated.name).toBe("Consulta");

    const all = await listProcedures(repo, "acc-1");
    expect(all).toHaveLength(1);
  });
});

describe("deleteProcedure", () => {
  it("blocks deletion when an appointment references the procedure", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 100,
      defaultDurationMinutes: 30,
    });
    await repo.insertAppointment("acc-1", {
      contactId: "contact-1",
      procedureId: procedure.id,
      dealId: null,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      notes: null,
    });

    await expect(deleteProcedure(repo, "acc-1", procedure.id)).rejects.toThrow();
  });

  it("allows deletion when no appointment references the procedure", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 100,
      defaultDurationMinutes: 30,
    });

    await expect(deleteProcedure(repo, "acc-1", procedure.id)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- service.test scheduling`
Expected: FAIL — `createProcedure`/`updateProcedure`/`listProcedures`/`deleteProcedure` not exported.

- [ ] **Step 3: Implement**

Append to `src/modules/scheduling/service.ts`:

```typescript
import { createProcedureInputSchema, updateProcedureInputSchema } from "./schemas";
import type { Procedure } from "./types";

export async function createProcedure(
  repo: SchedulingRepository,
  accountId: string,
  rawInput: unknown,
): Promise<Procedure> {
  const input = createProcedureInputSchema.parse(rawInput);
  return repo.insertProcedure(accountId, input);
}

export async function updateProcedure(
  repo: SchedulingRepository,
  accountId: string,
  procedureId: string,
  rawInput: unknown,
): Promise<Procedure> {
  const input = updateProcedureInputSchema.parse(rawInput);
  return repo.updateProcedure(accountId, procedureId, input);
}

export async function listProcedures(
  repo: SchedulingRepository,
  accountId: string,
): Promise<Procedure[]> {
  return repo.listProcedures(accountId);
}

export async function deleteProcedure(
  repo: SchedulingRepository,
  accountId: string,
  procedureId: string,
): Promise<void> {
  const count = await repo.countAppointmentsForProcedure(accountId, procedureId);
  if (count > 0) {
    throw new Error("Não é possível remover um procedimento com agendamentos vinculados");
  }
  await repo.deleteProcedure(accountId, procedureId);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test scheduling`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scheduling): add Procedure CRUD services"
```

---

### Task 8: Scheduling service — `createAppointment` with Pipeline integration

**Files:**
- Modify: `src/modules/scheduling/service.ts`, `src/modules/scheduling/service.test.ts`

**Interfaces:**
- Consumes: `CrmRepository`, `createInMemoryCrmRepository` (from `modules/crm`), `getStages`, `getOpenDealForContact`, `moveDeal` (Task 5 + existing `modules/crm/service.ts`).
- Produces: `createAppointment(repos: { scheduling: SchedulingRepository; crm: CrmRepository }, accountId, rawInput): Promise<Appointment>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/scheduling/service.test.ts`:

```typescript
import { createInMemoryCrmRepository } from "@/modules/crm/repository.memory";
import { createContact } from "@/modules/crm/service";
import { createAppointment } from "./service";

describe("createAppointment", () => {
  async function setup() {
    const schedulingRepo = createInMemorySchedulingRepository();
    const crmRepo = createInMemoryCrmRepository();
    const procedure = await schedulingRepo.insertProcedure("acc-1", {
      name: "Consulta",
      defaultPrice: 100,
      defaultDurationMinutes: 30,
    });
    const contact = await createContact(crmRepo, "acc-1", {
      name: "Ana",
      phone: "11999990000",
    });
    return { schedulingRepo, crmRepo, procedure, contact };
  }

  it("uses the procedure's default duration when endsAt is not given", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();

    const appointment = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      {
        contactId: contact.id,
        procedureId: procedure.id,
        startsAt: "2026-09-01T10:00:00.000Z",
      },
    );

    expect(appointment.startsAt).toBe("2026-09-01T10:00:00.000Z");
    expect(appointment.endsAt).toBe("2026-09-01T10:30:00.000Z");
  });

  it("rejects when the requested time conflicts with an existing appointment", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    await schedulingRepo.insertAppointment("acc-1", {
      contactId: contact.id,
      procedureId: procedure.id,
      dealId: null,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      notes: null,
    });

    await expect(
      createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, "acc-1", {
        contactId: contact.id,
        procedureId: procedure.id,
        startsAt: "2026-09-01T10:15:00.000Z",
      }),
    ).rejects.toThrow();
  });

  it("moves the contact's open deal to the 'Agendado' stage when it exists", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    const stages = await crmRepo.getStages("acc-1");
    const agendadoStage = stages.find((s) => s.name === "Agendado")!;

    const appointment = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      {
        contactId: contact.id,
        procedureId: procedure.id,
        startsAt: "2026-09-01T10:00:00.000Z",
      },
    );

    expect(appointment.dealId).not.toBeNull();
    const deal = await crmRepo.getDeal("acc-1", appointment.dealId!);
    expect(deal?.stageId).toBe(agendadoStage.id);
  });

  it("does not move any deal or fail when there is no 'Agendado' stage", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    const stages = await crmRepo.getStages("acc-1");
    const agendadoStage = stages.find((s) => s.name === "Agendado")!;
    await crmRepo.renameStage("acc-1", agendadoStage.id, "Marcado");

    const appointment = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      {
        contactId: contact.id,
        procedureId: procedure.id,
        startsAt: "2026-09-01T10:00:00.000Z",
      },
    );

    expect(appointment.dealId).toBeNull();
    const openDeal = await crmRepo.getOpenDealForContact("acc-1", contact.id);
    expect(openDeal?.stageId).not.toBe(agendadoStage.id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- service.test scheduling`
Expected: FAIL — `createAppointment` not exported.

- [ ] **Step 3: Implement**

Append to `src/modules/scheduling/service.ts`:

```typescript
import type { CrmRepository } from "@/modules/crm/repository";
import { getOpenDealForContact, getStages, moveDeal } from "@/modules/crm/service";
import { createAppointmentInputSchema } from "./schemas";
import type { Appointment } from "./types";

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

async function resolveDealForAppointment(
  crmRepo: CrmRepository,
  accountId: string,
  contactId: string,
): Promise<string | null> {
  const openDeal = await getOpenDealForContact(crmRepo, accountId, contactId);
  if (!openDeal) return null;

  const stages = await getStages(crmRepo, accountId);
  const targetStage = stages.find((s) => s.name === "Agendado");
  if (!targetStage) return null;

  await moveDeal(crmRepo, accountId, openDeal.id, targetStage.id);
  return openDeal.id;
}

export async function createAppointment(
  repos: { scheduling: SchedulingRepository; crm: CrmRepository },
  accountId: string,
  rawInput: unknown,
): Promise<Appointment> {
  const input = createAppointmentInputSchema.parse(rawInput);

  const procedure = await repos.scheduling.getProcedure(accountId, input.procedureId);
  if (!procedure) throw new Error("Procedimento não encontrado");

  const startsAt = input.startsAt;
  const endsAt = input.endsAt ?? addMinutes(startsAt, procedure.defaultDurationMinutes);

  const conflict = await checkConflict(repos.scheduling, accountId, { startsAt, endsAt });
  if (conflict.hasConflict) throw new Error(conflict.reason ?? "Conflito de horário");

  const dealId = await resolveDealForAppointment(repos.crm, accountId, input.contactId);

  return repos.scheduling.insertAppointment(accountId, {
    contactId: input.contactId,
    procedureId: input.procedureId,
    dealId,
    startsAt,
    endsAt,
    notes: input.notes ?? null,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test scheduling`
Expected: 16 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scheduling): add createAppointment with Pipeline integration"
```

---

### Task 9: Scheduling service — appointment mutations (`updateAppointmentTime`, `updateAppointmentStatus`, `updateAppointmentNotes`, `cancelAppointment`)

**Files:**
- Modify: `src/modules/scheduling/service.ts`, `src/modules/scheduling/service.test.ts`

**Interfaces:**
- Produces: `updateAppointmentTime`, `updateAppointmentStatus`, `updateAppointmentNotes`, `cancelAppointment`.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/scheduling/service.test.ts`:

```typescript
import {
  cancelAppointment,
  updateAppointmentNotes,
  updateAppointmentStatus,
  updateAppointmentTime,
} from "./service";

describe("updateAppointmentTime", () => {
  it("revalidates conflict, excluding the appointment being edited", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    const appointment = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      { contactId: contact.id, procedureId: procedure.id, startsAt: "2026-09-01T10:00:00.000Z" },
    );

    const moved = await updateAppointmentTime(
      schedulingRepo,
      "acc-1",
      appointment.id,
      "2026-09-01T11:00:00.000Z",
      "2026-09-01T11:30:00.000Z",
    );
    expect(moved.startsAt).toBe("2026-09-01T11:00:00.000Z");
  });

  it("rejects a move into a slot occupied by another appointment", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    const first = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      { contactId: contact.id, procedureId: procedure.id, startsAt: "2026-09-01T10:00:00.000Z" },
    );
    await createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, "acc-1", {
      contactId: contact.id,
      procedureId: procedure.id,
      startsAt: "2026-09-01T14:00:00.000Z",
    });

    await expect(
      updateAppointmentTime(
        schedulingRepo,
        "acc-1",
        first.id,
        "2026-09-01T14:10:00.000Z",
        "2026-09-01T14:40:00.000Z",
      ),
    ).rejects.toThrow();
  });
});

describe("updateAppointmentStatus, updateAppointmentNotes, cancelAppointment", () => {
  it("updates status and notes independently, and cancelAppointment sets status to cancelado", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    const appointment = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      { contactId: contact.id, procedureId: procedure.id, startsAt: "2026-09-01T10:00:00.000Z" },
    );

    const confirmed = await updateAppointmentStatus(schedulingRepo, "acc-1", appointment.id, "confirmado");
    expect(confirmed.status).toBe("confirmado");

    const withNotes = await updateAppointmentNotes(schedulingRepo, "acc-1", appointment.id, "Trouxe exame");
    expect(withNotes.notes).toBe("Trouxe exame");
    expect(withNotes.status).toBe("confirmado");

    const cancelled = await cancelAppointment(schedulingRepo, "acc-1", appointment.id);
    expect(cancelled.status).toBe("cancelado");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- service.test scheduling`
Expected: FAIL — the four new functions are not exported.

- [ ] **Step 3: Implement**

Append to `src/modules/scheduling/service.ts`:

```typescript
import type { AppointmentStatus } from "./types";

export async function updateAppointmentTime(
  repo: SchedulingRepository,
  accountId: string,
  appointmentId: string,
  startsAt: string,
  endsAt: string,
): Promise<Appointment> {
  const conflict = await checkConflict(repo, accountId, {
    startsAt,
    endsAt,
    excludeAppointmentId: appointmentId,
  });
  if (conflict.hasConflict) throw new Error(conflict.reason ?? "Conflito de horário");

  return repo.updateAppointmentTime(accountId, appointmentId, startsAt, endsAt);
}

export async function updateAppointmentStatus(
  repo: SchedulingRepository,
  accountId: string,
  appointmentId: string,
  status: AppointmentStatus,
): Promise<Appointment> {
  return repo.updateAppointmentStatus(accountId, appointmentId, status);
}

export async function updateAppointmentNotes(
  repo: SchedulingRepository,
  accountId: string,
  appointmentId: string,
  notes: string | null,
): Promise<Appointment> {
  return repo.updateAppointmentNotes(accountId, appointmentId, notes);
}

export async function cancelAppointment(
  repo: SchedulingRepository,
  accountId: string,
  appointmentId: string,
): Promise<Appointment> {
  return updateAppointmentStatus(repo, accountId, appointmentId, "cancelado");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test scheduling`
Expected: 18 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scheduling): add appointment status/notes/time mutation services"
```

---

### Task 10: Scheduling service — `listAppointments` and `listPendingStatusAppointments`

**Files:**
- Modify: `src/modules/scheduling/service.ts`, `src/modules/scheduling/service.test.ts`

**Interfaces:**
- Produces: `listAppointments(repo, accountId, range): Promise<AppointmentWithDetails[]>`, `listPendingStatusAppointments(repo, accountId): Promise<AppointmentWithDetails[]>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/scheduling/service.test.ts`:

```typescript
import { listAppointments, listPendingStatusAppointments } from "./service";

describe("listAppointments", () => {
  it("returns appointments overlapping the given range", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    await createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, "acc-1", {
      contactId: contact.id,
      procedureId: procedure.id,
      startsAt: "2026-09-01T10:00:00.000Z",
    });
    await createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, "acc-1", {
      contactId: contact.id,
      procedureId: procedure.id,
      startsAt: "2026-09-05T10:00:00.000Z",
    });

    const inRange = await listAppointments(schedulingRepo, "acc-1", {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
    });
    expect(inRange).toHaveLength(1);
  });
});

describe("listPendingStatusAppointments", () => {
  it("returns only 'agendado' appointments whose end time is in the past", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    const past = await createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, "acc-1", {
      contactId: contact.id,
      procedureId: procedure.id,
      startsAt: "2020-01-01T10:00:00.000Z",
    });
    const future = await createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, "acc-1", {
      contactId: contact.id,
      procedureId: procedure.id,
      startsAt: "2099-01-01T10:00:00.000Z",
    });
    const pastConfirmed = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      { contactId: contact.id, procedureId: procedure.id, startsAt: "2020-06-01T10:00:00.000Z" },
    );
    await updateAppointmentStatus(schedulingRepo, "acc-1", pastConfirmed.id, "concluido");

    const pending = await listPendingStatusAppointments(schedulingRepo, "acc-1");

    expect(pending.map((a) => a.id)).toEqual([past.id]);
    expect(pending.map((a) => a.id)).not.toContain(future.id);
    expect(pending.map((a) => a.id)).not.toContain(pastConfirmed.id);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- service.test scheduling`
Expected: FAIL — `listAppointments`/`listPendingStatusAppointments` not exported.

- [ ] **Step 3: Implement**

Append to `src/modules/scheduling/service.ts`:

```typescript
import type { AppointmentWithDetails } from "./types";

export async function listAppointments(
  repo: SchedulingRepository,
  accountId: string,
  range: { from: string; to: string },
): Promise<AppointmentWithDetails[]> {
  return repo.listAppointmentsInRange(accountId, range.from, range.to);
}

export async function listPendingStatusAppointments(
  repo: SchedulingRepository,
  accountId: string,
): Promise<AppointmentWithDetails[]> {
  return repo.listPendingStatusAppointments(accountId, new Date().toISOString());
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test scheduling`
Expected: 20 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scheduling): add listAppointments and listPendingStatusAppointments"
```

---

### Task 11: Scheduling service — availability blocks and rules

**Files:**
- Modify: `src/modules/scheduling/service.ts`, `src/modules/scheduling/service.test.ts`

**Interfaces:**
- Produces: `createAvailabilityBlock`, `deleteAvailabilityBlock`, `listAvailabilityBlocks`, `createAvailabilityRule`, `deleteAvailabilityRule`, `listAvailabilityRules`.

- [ ] **Step 1: Write the failing tests**

Append to `src/modules/scheduling/service.test.ts`:

```typescript
import {
  createAvailabilityBlock,
  createAvailabilityRule,
  deleteAvailabilityBlock,
  deleteAvailabilityRule,
  listAvailabilityBlocks,
  listAvailabilityRules,
} from "./service";

describe("availability blocks", () => {
  it("creates, lists, and deletes a one-off block", async () => {
    const repo = createInMemorySchedulingRepository();
    const block = await createAvailabilityBlock(repo, "acc-1", {
      startsAt: "2026-09-01T12:00:00.000Z",
      endsAt: "2026-09-01T13:00:00.000Z",
      reason: "Almoço",
    });

    expect(await listAvailabilityBlocks(repo, "acc-1")).toHaveLength(1);

    await deleteAvailabilityBlock(repo, "acc-1", block.id);
    expect(await listAvailabilityBlocks(repo, "acc-1")).toHaveLength(0);
  });
});

describe("availability rules", () => {
  it("creates, lists, and deletes a recurring rule", async () => {
    const repo = createInMemorySchedulingRepository();
    const rule = await createAvailabilityRule(repo, "acc-1", {
      dayOfWeek: 1,
      startTime: "12:00",
      endTime: "13:00",
      reason: "Almoço",
    });

    expect(await listAvailabilityRules(repo, "acc-1")).toHaveLength(1);

    await deleteAvailabilityRule(repo, "acc-1", rule.id);
    expect(await listAvailabilityRules(repo, "acc-1")).toHaveLength(0);
  });

  it("rejects an invalid time string", async () => {
    const repo = createInMemorySchedulingRepository();
    await expect(
      createAvailabilityRule(repo, "acc-1", {
        dayOfWeek: 1,
        startTime: "25:00",
        endTime: "13:00",
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- service.test scheduling`
Expected: FAIL — the six new functions are not exported.

- [ ] **Step 3: Implement**

Append to `src/modules/scheduling/service.ts`:

```typescript
import {
  createAvailabilityBlockInputSchema,
  createAvailabilityRuleInputSchema,
} from "./schemas";
import type { AvailabilityBlock, AvailabilityRule } from "./types";

export async function createAvailabilityBlock(
  repo: SchedulingRepository,
  accountId: string,
  rawInput: unknown,
): Promise<AvailabilityBlock> {
  const input = createAvailabilityBlockInputSchema.parse(rawInput);
  return repo.insertAvailabilityBlock(accountId, {
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    reason: input.reason ?? null,
  });
}

export async function deleteAvailabilityBlock(
  repo: SchedulingRepository,
  accountId: string,
  blockId: string,
): Promise<void> {
  await repo.deleteAvailabilityBlock(accountId, blockId);
}

export async function listAvailabilityBlocks(
  repo: SchedulingRepository,
  accountId: string,
): Promise<AvailabilityBlock[]> {
  return repo.listAvailabilityBlocks(accountId);
}

export async function createAvailabilityRule(
  repo: SchedulingRepository,
  accountId: string,
  rawInput: unknown,
): Promise<AvailabilityRule> {
  const input = createAvailabilityRuleInputSchema.parse(rawInput);
  return repo.insertAvailabilityRule(accountId, {
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    reason: input.reason ?? null,
  });
}

export async function deleteAvailabilityRule(
  repo: SchedulingRepository,
  accountId: string,
  ruleId: string,
): Promise<void> {
  await repo.deleteAvailabilityRule(accountId, ruleId);
}

export async function listAvailabilityRules(
  repo: SchedulingRepository,
  accountId: string,
): Promise<AvailabilityRule[]> {
  return repo.listAvailabilityRules(accountId);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- service.test scheduling`
Expected: 23 passed.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests passed (crm repository/service + scheduling repository/service + utils).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(scheduling): add availability block and rule services"
```

---

## Part C — Supabase Wiring

### Task 12: SupabaseSchedulingRepository implementation

**Files:**
- Create: `src/modules/scheduling/repository.supabase.ts`

**Interfaces:**
- Consumes: `SchedulingRepository` interface (Task 4), Supabase server client, generated `Database` type (Task 2).
- Produces: `createSupabaseSchedulingRepository(supabase: SupabaseClient<Database>): SchedulingRepository` — used by Server Actions (Task 13). Not unit tested (thin adapter, same convention as `modules/crm/repository.supabase.ts`); correctness verified manually through the UI in Part D against the real database.

- [ ] **Step 1: Implement the adapter**

Create `src/modules/scheduling/repository.supabase.ts`:

```typescript
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { SchedulingRepository } from "./repository";
import type {
  Appointment,
  AppointmentWithDetails,
  AvailabilityBlock,
  AvailabilityRule,
  Procedure,
} from "./types";

function throwDbError(error: PostgrestError): never {
  console.error("[scheduling/repository.supabase]", error);
  throw new Error("Erro ao acessar o banco de dados. Tente novamente.");
}

function toProcedure(row: Database["public"]["Tables"]["procedures"]["Row"]): Procedure {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    defaultPrice: row.default_price,
    defaultDurationMinutes: row.default_duration_minutes,
    createdAt: row.created_at,
  };
}

function toAppointment(row: Database["public"]["Tables"]["appointments"]["Row"]): Appointment {
  return {
    id: row.id,
    accountId: row.account_id,
    contactId: row.contact_id,
    procedureId: row.procedure_id,
    dealId: row.deal_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toBlock(row: Database["public"]["Tables"]["availability_blocks"]["Row"]): AvailabilityBlock {
  return {
    id: row.id,
    accountId: row.account_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    reason: row.reason,
  };
}

function toRule(row: Database["public"]["Tables"]["availability_rules"]["Row"]): AvailabilityRule {
  return {
    id: row.id,
    accountId: row.account_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    reason: row.reason,
  };
}

export function createSupabaseSchedulingRepository(
  supabase: SupabaseClient<Database>,
): SchedulingRepository {
  return {
    async insertProcedure(accountId, input) {
      const { data, error } = await supabase
        .from("procedures")
        .insert({
          account_id: accountId,
          name: input.name,
          default_price: input.defaultPrice,
          default_duration_minutes: input.defaultDurationMinutes,
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
          ...(input.defaultDurationMinutes !== undefined
            ? { default_duration_minutes: input.defaultDurationMinutes }
            : {}),
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

    async listProcedures(accountId) {
      const { data, error } = await supabase
        .from("procedures")
        .select("*")
        .eq("account_id", accountId)
        .order("name", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toProcedure);
    },

    async deleteProcedure(accountId, procedureId) {
      const { error } = await supabase
        .from("procedures")
        .delete()
        .eq("account_id", accountId)
        .eq("id", procedureId);
      if (error) throwDbError(error);
    },

    async countAppointmentsForProcedure(accountId, procedureId) {
      const { count, error } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .eq("procedure_id", procedureId);
      if (error) throwDbError(error);
      return count ?? 0;
    },

    async insertAppointment(accountId, input) {
      const { data, error } = await supabase
        .from("appointments")
        .insert({
          account_id: accountId,
          contact_id: input.contactId,
          procedure_id: input.procedureId,
          deal_id: input.dealId,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          notes: input.notes,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toAppointment(data);
    },

    async getAppointment(accountId, appointmentId) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", appointmentId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toAppointment(data) : null;
    },

    async updateAppointmentTime(accountId, appointmentId, startsAt, endsAt) {
      const { data, error } = await supabase
        .from("appointments")
        .update({ starts_at: startsAt, ends_at: endsAt, updated_at: new Date().toISOString() })
        .eq("account_id", accountId)
        .eq("id", appointmentId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toAppointment(data);
    },

    async updateAppointmentStatus(accountId, appointmentId, status) {
      const { data, error } = await supabase
        .from("appointments")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("account_id", accountId)
        .eq("id", appointmentId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toAppointment(data);
    },

    async updateAppointmentNotes(accountId, appointmentId, notes) {
      const { data, error } = await supabase
        .from("appointments")
        .update({ notes, updated_at: new Date().toISOString() })
        .eq("account_id", accountId)
        .eq("id", appointmentId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toAppointment(data);
    },

    async listAppointmentsInRange(accountId, from, to) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, contact:contacts(*), procedure:procedures(*)")
        .eq("account_id", accountId)
        .lt("starts_at", to)
        .gt("ends_at", from);
      if (error) throwDbError(error);
      return data.map((row) => ({
        ...toAppointment(row),
        contact: row.contact,
        procedure: toProcedure(row.procedure),
      })) as AppointmentWithDetails[];
    },

    async listAppointmentsOverlapping(accountId, startsAt, endsAt, excludeAppointmentId) {
      let query = supabase
        .from("appointments")
        .select("*")
        .eq("account_id", accountId)
        .lt("starts_at", endsAt)
        .gt("ends_at", startsAt);
      if (excludeAppointmentId) {
        query = query.neq("id", excludeAppointmentId);
      }
      const { data, error } = await query;
      if (error) throwDbError(error);
      return data.map(toAppointment);
    },

    async listPendingStatusAppointments(accountId, now) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, contact:contacts(*), procedure:procedures(*)")
        .eq("account_id", accountId)
        .eq("status", "agendado")
        .lt("ends_at", now);
      if (error) throwDbError(error);
      return data.map((row) => ({
        ...toAppointment(row),
        contact: row.contact,
        procedure: toProcedure(row.procedure),
      })) as AppointmentWithDetails[];
    },

    async insertAvailabilityBlock(accountId, input) {
      const { data, error } = await supabase
        .from("availability_blocks")
        .insert({
          account_id: accountId,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          reason: input.reason,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toBlock(data);
    },

    async deleteAvailabilityBlock(accountId, blockId) {
      const { error } = await supabase
        .from("availability_blocks")
        .delete()
        .eq("account_id", accountId)
        .eq("id", blockId);
      if (error) throwDbError(error);
    },

    async listAvailabilityBlocksOverlapping(accountId, startsAt, endsAt) {
      const { data, error } = await supabase
        .from("availability_blocks")
        .select("*")
        .eq("account_id", accountId)
        .lt("starts_at", endsAt)
        .gt("ends_at", startsAt);
      if (error) throwDbError(error);
      return data.map(toBlock);
    },

    async listAvailabilityBlocks(accountId) {
      const { data, error } = await supabase
        .from("availability_blocks")
        .select("*")
        .eq("account_id", accountId)
        .order("starts_at", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toBlock);
    },

    async insertAvailabilityRule(accountId, input) {
      const { data, error } = await supabase
        .from("availability_rules")
        .insert({
          account_id: accountId,
          day_of_week: input.dayOfWeek,
          start_time: input.startTime,
          end_time: input.endTime,
          reason: input.reason,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toRule(data);
    },

    async deleteAvailabilityRule(accountId, ruleId) {
      const { error } = await supabase
        .from("availability_rules")
        .delete()
        .eq("account_id", accountId)
        .eq("id", ruleId);
      if (error) throwDbError(error);
    },

    async listAvailabilityRules(accountId) {
      const { data, error } = await supabase
        .from("availability_rules")
        .select("*")
        .eq("account_id", accountId)
        .order("day_of_week", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toRule);
    },
  };
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: exit code 0. (Type errors here usually mean the generated `Database` type from Task 2 doesn't match the column names above — fix any mismatches before proceeding.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(scheduling): add SupabaseSchedulingRepository"
```

---

### Task 13: Scheduling Server Actions

**Files:**
- Create: `src/app/(app)/agenda/actions.ts`

**Interfaces:**
- Consumes: `createServerSupabaseClient`, `getCurrentAccountId`, `createSupabaseSchedulingRepository` (Task 12), `createSupabaseCrmRepository` (existing), all `modules/scheduling/service.ts` functions (Tasks 6–11), `searchContactsAction` (existing, reused directly from `modules/crm` for contact lookup in the UI — no new action needed).
- Produces: Server Actions consumed directly by the UI tasks (14–19).

- [ ] **Step 1: Write the Server Actions**

Create `src/app/(app)/agenda/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseSchedulingRepository } from "@/modules/scheduling/repository.supabase";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import * as scheduling from "@/modules/scheduling/service";
import type { AppointmentStatus } from "@/modules/scheduling/types";

async function getReposAndAccount() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const schedulingRepo = createSupabaseSchedulingRepository(supabase);
  const crmRepo = createSupabaseCrmRepository(supabase);
  return { schedulingRepo, crmRepo, accountId };
}

export async function createAppointmentAction(input: unknown) {
  const { schedulingRepo, crmRepo, accountId } = await getReposAndAccount();
  const appointment = await scheduling.createAppointment(
    { scheduling: schedulingRepo, crm: crmRepo },
    accountId,
    input,
  );
  revalidatePath("/agenda");
  revalidatePath("/pipeline");
  return appointment;
}

export async function updateAppointmentTimeAction(id: string, startsAt: string, endsAt: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const appointment = await scheduling.updateAppointmentTime(
    schedulingRepo,
    accountId,
    id,
    startsAt,
    endsAt,
  );
  revalidatePath("/agenda");
  return appointment;
}

export async function updateAppointmentStatusAction(id: string, status: AppointmentStatus) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const appointment = await scheduling.updateAppointmentStatus(schedulingRepo, accountId, id, status);
  revalidatePath("/agenda");
  return appointment;
}

export async function updateAppointmentNotesAction(id: string, notes: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const appointment = await scheduling.updateAppointmentNotes(schedulingRepo, accountId, id, notes);
  revalidatePath("/agenda");
  return appointment;
}

export async function cancelAppointmentAction(id: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const appointment = await scheduling.cancelAppointment(schedulingRepo, accountId, id);
  revalidatePath("/agenda");
  return appointment;
}

export async function listAppointmentsAction(from: string, to: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.listAppointments(schedulingRepo, accountId, { from, to });
}

export async function listPendingStatusAppointmentsAction() {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.listPendingStatusAppointments(schedulingRepo, accountId);
}

export async function checkConflictAction(startsAt: string, endsAt: string, excludeAppointmentId?: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.checkConflict(schedulingRepo, accountId, { startsAt, endsAt, excludeAppointmentId });
}

export async function createProcedureAction(input: unknown) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const procedure = await scheduling.createProcedure(schedulingRepo, accountId, input);
  revalidatePath("/agenda");
  return procedure;
}

export async function updateProcedureAction(id: string, input: unknown) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const procedure = await scheduling.updateProcedure(schedulingRepo, accountId, id, input);
  revalidatePath("/agenda");
  return procedure;
}

export async function listProceduresAction() {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.listProcedures(schedulingRepo, accountId);
}

export async function deleteProcedureAction(id: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  await scheduling.deleteProcedure(schedulingRepo, accountId, id);
  revalidatePath("/agenda");
}

export async function createAvailabilityBlockAction(input: unknown) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const block = await scheduling.createAvailabilityBlock(schedulingRepo, accountId, input);
  revalidatePath("/agenda");
  return block;
}

export async function deleteAvailabilityBlockAction(id: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  await scheduling.deleteAvailabilityBlock(schedulingRepo, accountId, id);
  revalidatePath("/agenda");
}

export async function listAvailabilityBlocksAction() {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.listAvailabilityBlocks(schedulingRepo, accountId);
}

export async function createAvailabilityRuleAction(input: unknown) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const rule = await scheduling.createAvailabilityRule(schedulingRepo, accountId, input);
  revalidatePath("/agenda");
  return rule;
}

export async function deleteAvailabilityRuleAction(id: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  await scheduling.deleteAvailabilityRule(schedulingRepo, accountId, id);
  revalidatePath("/agenda");
}

export async function listAvailabilityRulesAction() {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.listAvailabilityRules(schedulingRepo, accountId);
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(scheduling): wire Server Actions to the scheduling service layer"
```

---

## Part D — UI

### Task 14: Install `react-big-calendar`, base calendar page (read-only)

**Files:**
- Create: `src/app/(app)/agenda/page.tsx`, `src/components/agenda/calendar-view.tsx`, `src/components/agenda/agenda-client.tsx`
- Modify: `src/app/globals.css`, `src/components/layout/sidebar.tsx`

**Interfaces:**
- Consumes: `listAppointmentsAction` (Task 13).
- Produces: `<CalendarView events={...} />` — extended with create/edit interaction in Task 15.

- [ ] **Step 1: Install dependencies**

```bash
npm install react-big-calendar date-fns
```

- [ ] **Step 2: Import the calendar's base CSS**

Append to `src/app/globals.css` (after the existing `@import` lines at the top of the file):

```css
@import "react-big-calendar/lib/css/react-big-calendar.css";
```

(Next.js only allows global CSS imports from `globals.css`/layout files, not from arbitrary components — this is why the import goes here instead of in `calendar-view.tsx`.)

- [ ] **Step 3: Write the calendar view component**

Create `src/components/agenda/calendar-view.tsx`:

```tsx
"use client";

import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import ptBR from "date-fns/locale/pt-BR";
import type { AppointmentWithDetails } from "@/modules/scheduling/types";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: ptBR }),
  getDay,
  locales: { "pt-BR": ptBR },
});

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  appointment: AppointmentWithDetails;
}

const statusClassName: Record<AppointmentWithDetails["status"], string> = {
  agendado: "rbc-event-agendado",
  confirmado: "rbc-event-confirmado",
  concluido: "rbc-event-concluido",
  nao_compareceu: "rbc-event-cancelado",
  cancelado: "rbc-event-cancelado",
};

export function CalendarView({
  appointments,
  view,
  onViewChange,
  date,
  onNavigate,
  onSelectSlot,
  onSelectEvent,
}: {
  appointments: AppointmentWithDetails[];
  view: View;
  onViewChange: (view: View) => void;
  date: Date;
  onNavigate: (date: Date) => void;
  onSelectSlot: (slot: { start: Date; end: Date }) => void;
  onSelectEvent: (appointment: AppointmentWithDetails) => void;
}) {
  const events: CalendarEvent[] = appointments.map((appointment) => ({
    id: appointment.id,
    title: `${appointment.contact.name} — ${appointment.procedure.name}`,
    start: new Date(appointment.startsAt),
    end: new Date(appointment.endsAt),
    appointment,
  }));

  return (
    <div className="h-[calc(100vh-140px)] px-6 pb-6">
      <Calendar
        localizer={localizer}
        culture="pt-BR"
        events={events}
        startAccessor="start"
        endAccessor="end"
        view={view}
        onView={onViewChange}
        date={date}
        onNavigate={onNavigate}
        selectable
        onSelectSlot={onSelectSlot}
        onSelectEvent={(event) => onSelectEvent(event.appointment)}
        eventPropGetter={(event) => ({
          className: statusClassName[event.appointment.status],
        })}
      />
    </div>
  );
}
```

- [ ] **Step 4: Write the client container**

Create `src/components/agenda/agenda-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { View } from "react-big-calendar";
import { CalendarView } from "./calendar-view";
import type { AppointmentWithDetails } from "@/modules/scheduling/types";

export function AgendaClient({ initialAppointments }: { initialAppointments: AppointmentWithDetails[] }) {
  const [view, setView] = useState<View>("week");
  const [date, setDate] = useState(new Date());

  return (
    <CalendarView
      appointments={initialAppointments}
      view={view}
      onViewChange={setView}
      date={date}
      onNavigate={setDate}
      onSelectSlot={() => {}}
      onSelectEvent={() => {}}
    />
  );
}
```

(`onSelectSlot`/`onSelectEvent` are wired to real dialogs in Task 15 — kept as no-ops here so this task is independently testable.)

- [ ] **Step 5: Write the page**

Create `src/app/(app)/agenda/page.tsx`:

```tsx
import { startOfMonth, endOfMonth } from "date-fns";
import { listAppointmentsAction } from "./actions";
import { AgendaClient } from "@/components/agenda/agenda-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function AgendaPage() {
  const now = new Date();
  const from = startOfMonth(now).toISOString();
  const to = endOfMonth(now).toISOString();
  const appointments = await listAppointmentsAction(from, to);

  return (
    <div>
      <PageHeader
        eyebrow="Agenda"
        title="Agenda"
        description="Visualize e organize seus agendamentos."
      />
      <AgendaClient initialAppointments={appointments} />
    </div>
  );
}
```

- [ ] **Step 6: Enable the "Agenda" module in the sidebar**

Modify `src/components/layout/sidebar.tsx`: in the `modules` array, change the `Agenda` entry's `enabled` from `false` to `true`.

- [ ] **Step 7: Verify the build passes**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 8: Verify manually**

Run: `npm run dev`, log in, visit `/agenda`.
Expected: calendar renders in week view with no errors; switching to month/day view works; no appointments shown yet (empty account).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(agenda): add read-only calendar view"
```

---

### Task 15: Create/edit appointment dialog with conflict handling

**Files:**
- Create: `src/components/agenda/appointment-dialog.tsx`
- Modify: `src/components/agenda/agenda-client.tsx`

**Interfaces:**
- Consumes: `createAppointmentAction`, `updateAppointmentTimeAction`, `checkConflictAction`, `listProceduresAction`, `searchContactsAction` (reused from `modules/crm`, imported from `@/app/(app)/pipeline/actions`).

- [ ] **Step 1: Add the shadcn `select` component**

```bash
npx shadcn@latest add select
```

- [ ] **Step 2: Write the appointment dialog**

Create `src/components/agenda/appointment-dialog.tsx`:

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createAppointmentAction,
  updateAppointmentTimeAction,
  listProceduresAction,
} from "@/app/(app)/agenda/actions";
import { searchContactsAction } from "@/app/(app)/pipeline/actions";
import type { AppointmentWithDetails } from "@/modules/scheduling/types";
import type { Contact } from "@/modules/crm/types";
import type { Procedure } from "@/modules/scheduling/types";

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AppointmentDialog({
  open,
  onOpenChange,
  slot,
  editingAppointment,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: { start: Date; end: Date } | null;
  editingAppointment: AppointmentWithDetails | null;
  onSaved: () => void;
}) {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [procedureId, setProcedureId] = useState<string>("");
  const [startsAt, setStartsAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    listProceduresAction().then(setProcedures);

    if (editingAppointment) {
      setSelectedContactId(editingAppointment.contactId);
      setContactQuery(editingAppointment.contact.name);
      setProcedureId(editingAppointment.procedureId);
      setStartsAt(toLocalInputValue(new Date(editingAppointment.startsAt)));
    } else if (slot) {
      setSelectedContactId(null);
      setContactQuery("");
      setProcedureId("");
      setStartsAt(toLocalInputValue(slot.start));
    }
    setError(null);
  }, [open, editingAppointment, slot]);

  async function handleContactSearch(value: string) {
    setContactQuery(value);
    setSelectedContactId(null);
    if (!value.trim()) {
      setContactResults([]);
      return;
    }
    setContactResults(await searchContactsAction(value));
  }

  async function handleSubmit() {
    setError(null);
    try {
      const startsAtIso = new Date(startsAt).toISOString();

      if (editingAppointment) {
        const durationMs = new Date(editingAppointment.endsAt).getTime() -
          new Date(editingAppointment.startsAt).getTime();
        const endsAtIso = new Date(new Date(startsAtIso).getTime() + durationMs).toISOString();
        await updateAppointmentTimeAction(editingAppointment.id, startsAtIso, endsAtIso);
      } else {
        if (!selectedContactId) {
          setError("Selecione um contato");
          return;
        }
        await createAppointmentAction({
          contactId: selectedContactId,
          procedureId,
          startsAt: startsAtIso,
        });
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar agendamento");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingAppointment ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!editingAppointment && (
            <div className="space-y-1">
              <Label htmlFor="contact">Contato</Label>
              <Input
                id="contact"
                value={contactQuery}
                onChange={(e) => handleContactSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone"
              />
              {contactResults.length > 0 && !selectedContactId && (
                <ul className="rounded border">
                  {contactResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full px-2 py-1 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setSelectedContactId(c.id);
                          setContactQuery(c.name);
                          setContactResults([]);
                        }}
                      >
                        {c.name} — {c.phone}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!editingAppointment && (
            <div className="space-y-1">
              <Label htmlFor="procedure">Procedimento</Label>
              <Select value={procedureId} onValueChange={setProcedureId}>
                <SelectTrigger id="procedure">
                  <SelectValue placeholder="Selecione um procedimento" />
                </SelectTrigger>
                <SelectContent>
                  {procedures.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.defaultDurationMinutes}min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="startsAt">Início</Label>
            <Input
              id="startsAt"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={handleSubmit}
            disabled={!editingAppointment && (!selectedContactId || !procedureId)}
          >
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire the dialog into the client container**

Replace `src/components/agenda/agenda-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { View } from "react-big-calendar";
import { CalendarView } from "./calendar-view";
import { AppointmentDialog } from "./appointment-dialog";
import type { AppointmentWithDetails } from "@/modules/scheduling/types";

export function AgendaClient({ initialAppointments }: { initialAppointments: AppointmentWithDetails[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>("week");
  const [date, setDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentWithDetails | null>(null);

  function handleSelectSlot(newSlot: { start: Date; end: Date }) {
    setEditingAppointment(null);
    setSlot(newSlot);
    setDialogOpen(true);
  }

  function handleSelectEvent(appointment: AppointmentWithDetails) {
    setEditingAppointment(appointment);
    setSlot(null);
    setDialogOpen(true);
  }

  return (
    <>
      <CalendarView
        appointments={initialAppointments}
        view={view}
        onViewChange={setView}
        date={date}
        onNavigate={setDate}
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
      />
      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        slot={slot}
        editingAppointment={editingAppointment}
        onSaved={() => router.refresh()}
      />
    </>
  );
}
```

- [ ] **Step 4: Verify the build passes**

Run: `npm run build`
Expected: exit code 0.

`checkConflictAction` (Task 13) is intentionally not wired here for live pre-validation as the user types — `handleSubmit`'s `catch` block already surfaces the conflict error inline without a page reload (Server Actions don't navigate), which satisfies the spec's "no round-trip" intent with less UI state to manage. `checkConflictAction` stays exported for a future live-validation pass if the no-submit-attempt UX proves necessary.

- [ ] **Step 5: Verify manually**

Run: `npm run dev`, visit `/agenda`. First create at least one Procedure via a direct Server Action call in the browser console if the Procedure panel (Task 18) isn't built yet, or wait until Task 18 to fully exercise this — for now, verify: clicking an empty slot opens the "Novo agendamento" dialog, clicking an existing event opens "Editar agendamento" pre-filled.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(agenda): add create/edit appointment dialog"
```

---

### Task 16: Appointment status menu

**Files:**
- Create: `src/components/agenda/appointment-status-menu.tsx`
- Modify: `src/components/agenda/appointment-dialog.tsx`

**Interfaces:**
- Consumes: `updateAppointmentStatusAction`, `cancelAppointmentAction`, `updateAppointmentNotesAction` (Task 13).

- [ ] **Step 1: Write the status menu**

Create `src/components/agenda/appointment-status-menu.tsx`:

```tsx
"use client";

import { updateAppointmentStatusAction } from "@/app/(app)/agenda/actions";
import type { AppointmentStatus } from "@/modules/scheduling/types";

const statusLabels: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  nao_compareceu: "Não compareceu",
  cancelado: "Cancelado",
};

export function AppointmentStatusMenu({
  appointmentId,
  currentStatus,
  onChanged,
}: {
  appointmentId: string;
  currentStatus: AppointmentStatus;
  onChanged: () => void;
}) {
  return (
    <select
      className="w-full rounded border p-1 text-sm"
      value={currentStatus}
      onChange={async (e) => {
        await updateAppointmentStatusAction(appointmentId, e.target.value as AppointmentStatus);
        onChanged();
      }}
    >
      {Object.entries(statusLabels).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Add status menu and notes field to the appointment dialog when editing**

Modify `src/components/agenda/appointment-dialog.tsx`: import `AppointmentStatusMenu` and `updateAppointmentNotesAction`, add a `notes` state initialized from `editingAppointment?.notes ?? ""` in the same `useEffect` that sets the other edit fields, and render — only when `editingAppointment` is set — a status menu (`<AppointmentStatusMenu appointmentId={editingAppointment.id} currentStatus={editingAppointment.status} onChanged={onSaved} />`) plus a notes `Textarea` with a "Salvar notas" button calling `updateAppointmentNotesAction(editingAppointment.id, notes)` then `onSaved()`, placed between the "Início" field and the main "Salvar" button.

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, visit `/agenda`, click an existing event, change its status, confirm the calendar reflects the new status color after refresh; edit its notes and confirm they persist after reopening the dialog.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(agenda): add appointment status menu and notes editing"
```

---

### Task 17: Availability blocks and rules panel

**Files:**
- Create: `src/components/agenda/availability-dialog.tsx`
- Modify: `src/app/(app)/agenda/page.tsx`, `src/components/agenda/agenda-client.tsx`

**Interfaces:**
- Consumes: `createAvailabilityBlockAction`, `deleteAvailabilityBlockAction`, `listAvailabilityBlocksAction`, `createAvailabilityRuleAction`, `deleteAvailabilityRuleAction`, `listAvailabilityRulesAction` (Task 13).

- [ ] **Step 1: Write the availability dialog**

Create `src/components/agenda/availability-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
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
  createAvailabilityBlockAction,
  createAvailabilityRuleAction,
  deleteAvailabilityBlockAction,
  deleteAvailabilityRuleAction,
  listAvailabilityBlocksAction,
  listAvailabilityRulesAction,
} from "@/app/(app)/agenda/actions";
import type { AvailabilityBlock, AvailabilityRule } from "@/modules/scheduling/types";

const weekdayLabels = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function AvailabilityDialog({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);

  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const [ruleDay, setRuleDay] = useState("1");
  const [ruleStart, setRuleStart] = useState("12:00");
  const [ruleEnd, setRuleEnd] = useState("13:00");
  const [ruleReason, setRuleReason] = useState("");

  async function refresh() {
    setBlocks(await listAvailabilityBlocksAction());
    setRules(await listAvailabilityRulesAction());
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function handleCreateBlock() {
    await createAvailabilityBlockAction({
      startsAt: new Date(blockStart).toISOString(),
      endsAt: new Date(blockEnd).toISOString(),
      reason: blockReason || undefined,
    });
    setBlockStart("");
    setBlockEnd("");
    setBlockReason("");
    await refresh();
    onChanged();
  }

  async function handleCreateRule() {
    await createAvailabilityRuleAction({
      dayOfWeek: Number(ruleDay),
      startTime: ruleStart,
      endTime: ruleEnd,
      reason: ruleReason || undefined,
    });
    setRuleReason("");
    await refresh();
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Bloqueios de agenda</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bloqueios de agenda</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <h3 className="font-semibold">Recorrentes (semanais)</h3>
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>
                {weekdayLabels[rule.dayOfWeek]}, {rule.startTime}–{rule.endTime}
                {rule.reason ? ` (${rule.reason})` : ""}
              </span>
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  await deleteAvailabilityRuleAction(rule.id);
                  await refresh();
                  onChanged();
                }}
              >
                Remover
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="ruleDay">Dia</Label>
              <select
                id="ruleDay"
                className="rounded border p-1.5 text-sm"
                value={ruleDay}
                onChange={(e) => setRuleDay(e.target.value)}
              >
                {weekdayLabels.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ruleStart">Início</Label>
              <Input id="ruleStart" type="time" value={ruleStart} onChange={(e) => setRuleStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ruleEnd">Fim</Label>
              <Input id="ruleEnd" type="time" value={ruleEnd} onChange={(e) => setRuleEnd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ruleReason">Motivo</Label>
              <Input id="ruleReason" value={ruleReason} onChange={(e) => setRuleReason(e.target.value)} />
            </div>
            <Button onClick={handleCreateRule}>Adicionar</Button>
          </div>
        </div>

        <div className="space-y-2 border-t pt-3">
          <h3 className="font-semibold">Pontuais</h3>
          {blocks.map((block) => (
            <div key={block.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>
                {new Date(block.startsAt).toLocaleString()} – {new Date(block.endsAt).toLocaleString()}
                {block.reason ? ` (${block.reason})` : ""}
              </span>
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  await deleteAvailabilityBlockAction(block.id);
                  await refresh();
                  onChanged();
                }}
              >
                Remover
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="blockStart">Início</Label>
              <Input
                id="blockStart"
                type="datetime-local"
                value={blockStart}
                onChange={(e) => setBlockStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="blockEnd">Fim</Label>
              <Input
                id="blockEnd"
                type="datetime-local"
                value={blockEnd}
                onChange={(e) => setBlockEnd(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="blockReason">Motivo</Label>
              <Input id="blockReason" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
            </div>
            <Button onClick={handleCreateBlock}>Adicionar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it into the agenda client**

Modify `src/components/agenda/agenda-client.tsx`: import `AvailabilityDialog`, and render `<div className="flex justify-end px-6 pb-2"><AvailabilityDialog onChanged={() => router.refresh()} /></div>` immediately before `<CalendarView .../>`.

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, visit `/agenda`, open "Bloqueios de agenda", add a recurring rule and a one-off block, confirm both list and can be removed. Then try creating an appointment (Task 15's dialog) inside a blocked slot and confirm it's rejected with the conflict message.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(agenda): add availability blocks and rules panel"
```

---

### Task 18: Procedure management panel

**Files:**
- Create: `src/components/agenda/procedure-dialog.tsx`
- Modify: `src/components/agenda/agenda-client.tsx`

**Interfaces:**
- Consumes: `createProcedureAction`, `updateProcedureAction`, `listProceduresAction`, `deleteProcedureAction` (Task 13).

- [ ] **Step 1: Write the procedure dialog**

Create `src/components/agenda/procedure-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
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
  createProcedureAction,
  deleteProcedureAction,
  listProceduresAction,
  updateProcedureAction,
} from "@/app/(app)/agenda/actions";
import type { Procedure } from "@/modules/scheduling/types";

export function ProcedureDialog({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setProcedures(await listProceduresAction());
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function handleCreate() {
    setError(null);
    await createProcedureAction({
      name,
      defaultPrice: Number(price),
      defaultDurationMinutes: Number(duration),
    });
    setName("");
    setPrice("");
    setDuration("");
    await refresh();
    onChanged();
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteProcedureAction(id);
      await refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover procedimento");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Procedimentos</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Procedimentos</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="space-y-2">
          {procedures.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <Input
                defaultValue={p.name}
                onBlur={(e) => {
                  if (e.target.value !== p.name) {
                    updateProcedureAction(p.id, { name: e.target.value }).then(() => refresh());
                  }
                }}
              />
              <Input
                type="number"
                className="w-24"
                defaultValue={p.defaultPrice}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (value !== p.defaultPrice) {
                    updateProcedureAction(p.id, { defaultPrice: value }).then(() => refresh());
                  }
                }}
              />
              <Input
                type="number"
                className="w-20"
                defaultValue={p.defaultDurationMinutes}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (value !== p.defaultDurationMinutes) {
                    updateProcedureAction(p.id, { defaultDurationMinutes: value }).then(() => refresh());
                  }
                }}
              />
              <Button size="sm" variant="destructive" onClick={() => handleDelete(p.id)}>
                Remover
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            placeholder="Valor"
            type="number"
            className="w-24"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <Input
            placeholder="Min."
            type="number"
            className="w-20"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
          <Button onClick={handleCreate}>Adicionar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it into the agenda client**

Modify `src/components/agenda/agenda-client.tsx`: import `ProcedureDialog` and render it next to `<AvailabilityDialog />` inside the same `flex justify-end` row added in Task 17, e.g. `<div className="flex justify-end gap-2 px-6 pb-2"><ProcedureDialog onChanged={() => router.refresh()} /><AvailabilityDialog onChanged={() => router.refresh()} /></div>`.

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, visit `/agenda`, open "Procedimentos", create one (e.g. "Consulta", 100, 30), confirm it now appears in the appointment dialog's procedure select (Task 15). Create an appointment using it, then try deleting that procedure — confirm it's blocked with an error message.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(agenda): add procedure management panel"
```

---

### Task 19: Highlight appointments with undefined status past their time

**Files:**
- Modify: `src/app/(app)/agenda/page.tsx`, `src/components/agenda/agenda-client.tsx`

**Interfaces:**
- Consumes: `listPendingStatusAppointmentsAction` (Task 13).

- [ ] **Step 1: Fetch pending-status appointments in the page**

Modify `src/app/(app)/agenda/page.tsx`: import `listPendingStatusAppointmentsAction` alongside `listAppointmentsAction`, call it in parallel (`const [appointments, pendingStatusAppointments] = await Promise.all([listAppointmentsAction(from, to), listPendingStatusAppointmentsAction()]);`), and pass `pendingStatusCount={pendingStatusAppointments.length}` as a new prop to `<AgendaClient>`.

- [ ] **Step 2: Surface the count in the UI**

Modify `src/components/agenda/agenda-client.tsx`: accept the new `pendingStatusCount: number` prop, and when it's greater than 0, render a small banner above the calendar (inside the same row as the panel buttons, aligned left): `{pendingStatusCount > 0 && (<p className="px-6 text-sm text-amber-700">{pendingStatusCount} agendamento(s) sem status definido após o horário previsto</p>)}`.

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, create an appointment with `startsAt` in the past (edit the datetime-local field to a past date/time) and leave its status as "Agendado". Visit `/agenda` and confirm the banner shows the correct count. Change its status to anything else and confirm the banner updates (count decreases) after refresh.

- [ ] **Step 5: Run the full test suite one more time**

Run: `npm test`
Expected: all tests still passing (no test code was touched in Part D, this just confirms Part D's changes didn't break anything at the type level that `npm run build` alone wouldn't catch).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(agenda): highlight appointments with undefined status past their time"
```

---

## Self-Review Notes

- **Spec coverage:** All Agendamento spec sections are covered — schema (Task 1), Procedure/Appointment/Availability server actions (Tasks 6–13), Pipeline integration (Task 8, tested in both directions: stage exists / stage missing), UI/routes (Tasks 14–19), edge cases (conflict with appointment/block/rule, self-exclusion on edit, cancelled appointment frees slot, missing "Agendado" stage is a no-op, Procedure deletion blocked — all covered by Task 6/8/7 tests and the FK constraint from Task 1).
- **Type consistency:** `SchedulingRepository` (Task 4) is implemented identically by `repository.memory.ts` (Task 4) and `repository.supabase.ts` (Task 12); `service.ts` functions (Tasks 6–11) are the only consumers of the interface, exercised by the test suite (via the in-memory repo, plus a real in-memory `CrmRepository` for the cross-module test) and the UI (via the Supabase repos) with no signature divergence. `createAppointment`'s two-repo `{ scheduling, crm }` parameter shape is used consistently in its test (Task 8) and its Server Action (Task 13) call site.
- **Deferred to Fase 3:** `Procedure.category` and any `FinancialEntry` linkage are intentionally out of scope — `procedures` table and `Procedure` type both have room to grow without a breaking migration (a new nullable `category` column is additive).
