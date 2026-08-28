# Tratamento + Relatório Clínico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-wound `Treatment` entity that groups appointments into a course of care, with wound photos in private Storage and a print-optimized clinical report per treatment.

**Architecture:** New `src/modules/treatments/` module mirroring `crm`/`scheduling`/`finance` (types / repository interface / in-memory repo / Supabase repo / service / schemas + Vitest tests). `appointments` gets a nullable `treatment_id` (weak link, `ON DELETE SET NULL`). Photos are compressed **in the browser** before upload and stored in a private `treatment-photos` bucket; the app reads them via short-lived signed URLs generated server-side. New pages under `/pacientes/[id]` (patient detail), `/pacientes/[id]/tratamentos/[treatmentId]` (treatment detail) and `.../relatorio` (a server-rendered print route driven by `window.print()`). Session count and duration are always **derived** from concluded linked appointments, never stored. A new `/configuracoes` page holds the professional's name + council id (added to `accounts`) and a photo-storage usage indicator.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), React 19, TypeScript, Supabase (Postgres + RLS + Storage), `@supabase/ssr`, Zod v4, Vitest (jsdom, `TZ=UTC`), Tailwind v4, Base UI components, `browser-image-compression` + `heic2any` (new, client-only). Deploy target: Cloudflare Workers via `@opennextjs/cloudflare` — **no server-side PDF / headless Chrome**.

**Spec:** `docs/superpowers/specs/2026-08-27-tratamento-relatorio-clinico-design.md` — the plan argues from this spec; executors read both.

## Global Constraints

- **Runtime:** Cloudflare Workers. No server PDF generation, no `fs`, no headless browser. The report is an HTML route printed with `window.print()`.
- **Module shape:** every module file mirrors `src/modules/scheduling/` exactly — `types.ts`, `repository.ts` (interface), `repository.memory.ts` (`createInMemory<X>Repository()`), `repository.supabase.ts` (`createSupabase<X>Repository(supabase)`), `service.ts` (pure functions taking a repo + `accountId`), `schemas.ts` (Zod). `repository.memory` must mirror the Supabase behavior; tests target external behavior only.
- **Repo method signature:** every repository method takes `accountId` as its first argument and scopes **every** query by it (`.eq("account_id", accountId)`), returning `null` / `[]` for another account's rows.
- **Validation:** server-layer input is validated with `parseOrThrow(schema, rawInput)` from `@/lib/zod-error` (throws `Error` with `error.issues[0].message`).
- **Supabase errors:** every `repository.supabase.ts` method funnels PostgrestError through a local `throwDbError(error)` that `console.error`s and throws `new Error("Erro ao acessar o banco de dados. Tente novamente.")` — copy the helper verbatim from `src/modules/scheduling/repository.supabase.ts:13-16`.
- **RLS:** every new table gets `enable row level security` + one `for all to authenticated` policy with `account_id in (select account_id from account_users where user_id = auth.uid())` in **both** `using` and `with check`.
- **Storage:** bucket `treatment-photos` is **private** (`public = false`). Object path is exactly `{account_id}/{treatment_id}/{uuid}.jpg`. Reads use `createSignedUrl(path, 3600)` — never `getPublicUrl`.
- **Derived, never stored:** session count = `count(appointments where treatment_id = t.id and status = 'concluido')`; duration = `(discharged_on ?? today) − started_on`.
- **Status vs outcome:** `treatments.status ∈ {em_andamento, concluido}` only. `abandono` / `encaminhamento` are `outcome` values with `status = 'concluido'`. There is no "interrompido" / "pausado".
- **UI copy:** Portuguese (pt-BR), matching existing screens.
- **DB types:** `src/lib/supabase/database.types.ts` is hand-maintained in this repo (see the `financeiro` plan precedent). Edit it by hand; keep table keys alphabetical inside `Tables`.
- **Commits:** small and frequent, one per task step group as written. Conventional-commit prefixes (`feat:`, `feat(treatments):`, etc.).

---

## File Structure

**New module — `src/modules/treatments/`**
- `types.ts` — `Treatment`, `TreatmentPhoto`, `TreatmentSession`, `TreatmentReport`, `TreatmentStatus`, `WoundOutcome`, `AssembleReportInput`.
- `repository.ts` — `TreatmentsRepository` interface (treatments CRUD + photos CRUD + `sumPhotoBytes`). Session count/list live in `scheduling`, not here.
- `repository.memory.ts` — `createInMemoryTreatmentsRepository()`.
- `repository.supabase.ts` — `createSupabaseTreatmentsRepository(supabase)`.
- `service.ts` — `createTreatment`, `updateTreatment`, `concludeTreatment`, `listTreatmentsForContact`, `deleteTreatment`, `updatePhotoMeta`, `assembleReport` (pure compose), `formatDurationLabel` (internal helper, exported for tests).
- `schemas.ts` — Zod for create / update / conclude / photo-meta.
- `repository.memory.test.ts`, `service.test.ts`.

**Modified module — `src/modules/scheduling/`**
- `types.ts` — `Appointment.treatmentId: string | null`.
- `repository.ts` — `insertAppointment` input gains optional `treatmentId`; add `updateAppointmentTreatment`, `countConcludedAppointmentsByTreatment`, `listConcludedAppointmentsByTreatment`.
- `repository.memory.ts`, `repository.supabase.ts` — implement the above.
- `service.ts` — `linkAppointmentToTreatment(schedulingRepo, treatmentsRepo, accountId, appointmentId, treatmentId)`.
- `service.test.ts` — cover the new repo methods + `linkAppointmentToTreatment`.

**Modified module — `src/modules/crm/`**
- `repository.ts` / `repository.memory.ts` / `repository.supabase.ts` — add `getContact(accountId, contactId): Promise<Contact | null>`.
- `repository.memory.test.ts` — scope test for `getContact`.

**Shared**
- `src/lib/supabase/account.ts` — add `getAccountProfessionalIdentity(supabase, accountId)`.
- `src/lib/supabase/database.types.ts` — add `treatments`, `treatment_photos`; add `treatment_id` to `appointments`; add `professional_name`, `professional_council_id` to `accounts`.
- `supabase/migrations/0011_treatments.sql` — new.
- `src/app/globals.css` — `@page` margin for print.

**Server actions**
- `src/app/(app)/pacientes/[id]/actions.ts` — new (treatment + photo + report actions).
- `src/app/(app)/pacientes/actions.ts` — `deletePatientAction` also purges Storage objects.
- `src/app/(app)/agenda/actions.ts` — add `linkAppointmentToTreatmentAction`, `listTreatmentsForContactAction`.
- `src/app/(app)/configuracoes/actions.ts` — new (`getClinicSettingsAction`, `updateProfessionalIdentityAction`).

**Pages / components**
- `src/app/(app)/pacientes/[id]/page.tsx` + `src/components/patients/patient-detail-client.tsx` — new.
- `src/app/(app)/pacientes/[id]/tratamentos/[treatmentId]/page.tsx` + `src/components/treatments/treatment-detail-client.tsx` — new.
- `src/app/(app)/pacientes/[id]/tratamentos/[treatmentId]/relatorio/page.tsx` + `src/components/treatments/treatment-report-view.tsx` — new.
- `src/components/treatments/treatment-form-dialog.tsx`, `conclude-treatment-dialog.tsx`, `treatment-photos.tsx`, `prepare-photo.ts` (+ test) — new.
- `src/app/(app)/configuracoes/page.tsx` + `src/components/settings/settings-client.tsx` — new.
- `src/components/patients/patients-client.tsx` — name cell becomes a `<Link>` to the detail page.
- `src/components/agenda/appointment-dialog.tsx` + `src/components/agenda/treatment-link-suggestion-dialog.tsx` — treatment `<Select>` + link suggestion.
- `src/components/layout/sidebar.tsx` — add "Configurações" nav item.

---

## Task 1: Migration `0011_treatments.sql` + `database.types.ts`

**Files:**
- Create: `supabase/migrations/0011_treatments.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: existing tables `accounts`, `contacts`, `appointments`, `account_users`.
- Produces: tables `treatments`, `treatment_photos`; `appointments.treatment_id uuid | null`; `accounts.professional_name text | null`, `accounts.professional_council_id text | null`; private bucket `treatment-photos` with an object-level RLS policy; an `accounts` UPDATE policy. These names/shapes are relied on by every later task.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0011_treatments.sql`:

```sql
-- Feature: Tratamento + Relatório clínico (feridas / ozonioterapia).
-- Per-wound treatment entity, weak link from appointments, private photo
-- bucket, and professional-identity fields on accounts.

create table treatments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  wound_types text not null,
  wound_details text,
  treatment_type text,
  started_on date not null,
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'concluido')),
  discharged_on date,
  outcome text
    check (outcome in ('cicatrizacao', 'alta', 'abandono', 'encaminhamento')),
  professional_assessment text,
  patient_perception text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index treatments_account_contact_idx on treatments (account_id, contact_id);

create table treatment_photos (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  treatment_id uuid not null references treatments(id) on delete cascade,
  storage_path text not null,
  bytes integer not null,
  caption text,
  taken_on date,
  created_at timestamptz not null default now()
);

create index treatment_photos_treatment_idx on treatment_photos (treatment_id);
create index treatment_photos_account_idx on treatment_photos (account_id);

alter table appointments
  add column treatment_id uuid references treatments(id) on delete set null;

create index appointments_treatment_idx on appointments (treatment_id);

alter table accounts
  add column professional_name text,
  add column professional_council_id text;

alter table treatments enable row level security;
alter table treatment_photos enable row level security;

create policy "account members can manage treatments"
  on treatments for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage treatment_photos"
  on treatment_photos for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

-- accounts currently has SELECT-only RLS (0001). /configuracoes needs to
-- write professional_name / professional_council_id.
create policy "account members can update their account"
  on accounts for update
  to authenticated
  using (id in (select account_id from account_users where user_id = auth.uid()))
  with check (id in (select account_id from account_users where user_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('treatment-photos', 'treatment-photos', false)
on conflict (id) do nothing;

create policy "account members manage treatment photo objects"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'treatment-photos'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'treatment-photos'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration**

If the Supabase project is linked (`supabase/` is configured — see the `arkdoctor_supabase_project` memory): run `npx supabase db push`. Otherwise apply `0011_treatments.sql` in the Supabase SQL editor.
Expected: no error; `treatments` and `treatment_photos` exist; `select id from storage.buckets where id = 'treatment-photos'` returns one row.

- [ ] **Step 3: Add the new table types to `database.types.ts` by hand**

Open `src/lib/supabase/database.types.ts`. Inside `public.Tables`, keeping keys alphabetical:

Add `treatment_photos` and `treatments` entries (place them after `procedures`… actually after the last `t*`/before `whatsapp_*`; alphabetical: `treatment_photos` then `treatments`):

```ts
      treatment_photos: {
        Row: {
          account_id: string
          bytes: number
          caption: string | null
          created_at: string
          id: string
          storage_path: string
          taken_on: string | null
          treatment_id: string
        }
        Insert: {
          account_id: string
          bytes: number
          caption?: string | null
          created_at?: string
          id?: string
          storage_path: string
          taken_on?: string | null
          treatment_id: string
        }
        Update: {
          account_id?: string
          bytes?: number
          caption?: string | null
          created_at?: string
          id?: string
          storage_path?: string
          taken_on?: string | null
          treatment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_photos_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_photos_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      treatments: {
        Row: {
          account_id: string
          contact_id: string
          created_at: string
          discharged_on: string | null
          id: string
          outcome: string | null
          patient_perception: string | null
          professional_assessment: string | null
          started_on: string
          status: string
          treatment_type: string | null
          updated_at: string
          wound_details: string | null
          wound_types: string
        }
        Insert: {
          account_id: string
          contact_id: string
          created_at?: string
          discharged_on?: string | null
          id?: string
          outcome?: string | null
          patient_perception?: string | null
          professional_assessment?: string | null
          started_on: string
          status?: string
          treatment_type?: string | null
          updated_at?: string
          wound_details?: string | null
          wound_types: string
        }
        Update: {
          account_id?: string
          contact_id?: string
          created_at?: string
          discharged_on?: string | null
          id?: string
          outcome?: string | null
          patient_perception?: string | null
          professional_assessment?: string | null
          started_on?: string
          status?: string
          treatment_type?: string | null
          updated_at?: string
          wound_details?: string | null
          wound_types?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
```

In the `accounts` entry, add `professional_council_id: string | null` and `professional_name: string | null` to `Row` (required position alphabetical: after `name`), and the optional forms to `Insert` and `Update`:

```ts
        Row: {
          created_at: string
          id: string
          name: string
          professional_council_id: string | null
          professional_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          professional_council_id?: string | null
          professional_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          professional_council_id?: string | null
          professional_name?: string | null
        }
```

In the `appointments` entry, add `treatment_id: string | null` to `Row` (after `starts_at`/`status` — alphabetical puts it after `status`, before `updated_at`), and `treatment_id?: string | null` to `Insert` and `Update`. Also add a relationship object to its `Relationships` array:

```ts
          {
            foreignKeyName: "appointments_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "treatments"
            referencedColumns: ["id"]
          },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors). The types compile even though no code consumes them yet.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0011_treatments.sql src/lib/supabase/database.types.ts
git commit -m "feat(treatments): migration 0011 + database types"
```

---

## Task 2: `treatments` types + repository interface + in-memory repo

**Files:**
- Create: `src/modules/treatments/types.ts`
- Create: `src/modules/treatments/repository.ts`
- Create: `src/modules/treatments/repository.memory.ts`
- Test: `src/modules/treatments/repository.memory.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces:
  - Types: `TreatmentStatus = "em_andamento" | "concluido"`; `WoundOutcome = "cicatrizacao" | "alta" | "abandono" | "encaminhamento"`; `Treatment`, `TreatmentPhoto`, `TreatmentSession`, `TreatmentReport`, `AssembleReportInput` (shapes below).
  - `TreatmentsRepository` interface with: `insertTreatment(accountId, input) → Treatment`, `updateTreatment(accountId, id, input) → Treatment`, `concludeTreatment(accountId, id, { dischargedOn, outcome }) → Treatment`, `getTreatment(accountId, id) → Treatment | null`, `listTreatmentsForContact(accountId, contactId) → Treatment[]` (started_on desc), `deleteTreatment(accountId, id) → void`, `insertPhoto(accountId, input) → TreatmentPhoto`, `listPhotos(accountId, treatmentId) → TreatmentPhoto[]` (created_at asc), `getPhoto(accountId, photoId) → TreatmentPhoto | null`, `updatePhotoMeta(accountId, photoId, { caption, takenOn }) → TreatmentPhoto`, `deletePhoto(accountId, photoId) → void`, `sumPhotoBytes(accountId) → number`.
  - `createInMemoryTreatmentsRepository(): TreatmentsRepository`.

- [ ] **Step 1: Write `types.ts`**

Create `src/modules/treatments/types.ts`:

```ts
export type TreatmentStatus = "em_andamento" | "concluido";
export type WoundOutcome = "cicatrizacao" | "alta" | "abandono" | "encaminhamento";

export interface Treatment {
  id: string;
  accountId: string;
  contactId: string;
  woundTypes: string;
  woundDetails: string | null;
  treatmentType: string | null;
  startedOn: string; // YYYY-MM-DD
  status: TreatmentStatus;
  dischargedOn: string | null; // YYYY-MM-DD
  outcome: WoundOutcome | null;
  professionalAssessment: string | null;
  patientPerception: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentPhoto {
  id: string;
  accountId: string;
  treatmentId: string;
  storagePath: string;
  bytes: number;
  caption: string | null;
  takenOn: string | null; // YYYY-MM-DD
  createdAt: string;
}

export interface TreatmentSession {
  appointmentId: string;
  date: string; // appointment starts_at (ISO)
  notes: string | null;
}

export interface TreatmentReport {
  treatment: Treatment;
  contact: { name: string; birthDate: string | null; cpf: string | null };
  professional: { clinicName: string; name: string | null; councilId: string | null };
  sessionCount: number;
  sessions: TreatmentSession[];
  photos: { url: string; caption: string | null; takenOn: string | null }[];
  durationLabel: string; // derived: (dischargedOn ?? today) − startedOn
  generatedAt: string; // ISO
}

export interface AssembleReportInput {
  treatment: Treatment;
  contact: { name: string; birthDate: string | null; cpf: string | null };
  professional: { clinicName: string; name: string | null; councilId: string | null };
  sessionCount: number;
  sessions: TreatmentSession[];
  photos: { url: string; caption: string | null; takenOn: string | null }[];
  now: string; // ISO — injected for testability
}
```

- [ ] **Step 2: Write `repository.ts`**

Create `src/modules/treatments/repository.ts`:

```ts
import type { Treatment, TreatmentPhoto, WoundOutcome } from "./types";

export interface TreatmentsRepository {
  insertTreatment(
    accountId: string,
    input: {
      contactId: string;
      woundTypes: string;
      woundDetails: string | null;
      treatmentType: string | null;
      startedOn: string;
      professionalAssessment: string | null;
      patientPerception: string | null;
    },
  ): Promise<Treatment>;
  updateTreatment(
    accountId: string,
    id: string,
    input: Partial<{
      woundTypes: string;
      woundDetails: string | null;
      treatmentType: string | null;
      startedOn: string;
      professionalAssessment: string | null;
      patientPerception: string | null;
    }>,
  ): Promise<Treatment>;
  concludeTreatment(
    accountId: string,
    id: string,
    input: { dischargedOn: string; outcome: WoundOutcome },
  ): Promise<Treatment>;
  getTreatment(accountId: string, id: string): Promise<Treatment | null>;
  listTreatmentsForContact(accountId: string, contactId: string): Promise<Treatment[]>;
  deleteTreatment(accountId: string, id: string): Promise<void>;

  insertPhoto(
    accountId: string,
    input: {
      treatmentId: string;
      storagePath: string;
      bytes: number;
      caption: string | null;
      takenOn: string | null;
    },
  ): Promise<TreatmentPhoto>;
  listPhotos(accountId: string, treatmentId: string): Promise<TreatmentPhoto[]>;
  getPhoto(accountId: string, photoId: string): Promise<TreatmentPhoto | null>;
  updatePhotoMeta(
    accountId: string,
    photoId: string,
    input: { caption: string | null; takenOn: string | null },
  ): Promise<TreatmentPhoto>;
  deletePhoto(accountId: string, photoId: string): Promise<void>;
  sumPhotoBytes(accountId: string): Promise<number>;
}
```

- [ ] **Step 3: Write the failing in-memory repo test**

Create `src/modules/treatments/repository.memory.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createInMemoryTreatmentsRepository } from "./repository.memory";

function baseInput(overrides: Partial<Parameters<
  ReturnType<typeof createInMemoryTreatmentsRepository>["insertTreatment"]
>[1]> = {}) {
  return {
    contactId: "contact-1",
    woundTypes: "úlcera venosa",
    woundDetails: null,
    treatmentType: "ozonioterapia — bagging",
    startedOn: "2026-08-01",
    professionalAssessment: null,
    patientPerception: null,
    ...overrides,
  };
}

describe("createInMemoryTreatmentsRepository", () => {
  it("inserts and reads a treatment scoped to its account", async () => {
    const repo = createInMemoryTreatmentsRepository();
    const t = await repo.insertTreatment("acc-1", baseInput());

    expect(t.status).toBe("em_andamento");
    expect(t.woundTypes).toBe("úlcera venosa");
    expect(await repo.getTreatment("acc-1", t.id)).not.toBeNull();
    expect(await repo.getTreatment("acc-2", t.id)).toBeNull();
  });

  it("lists a contact's treatments newest-started first", async () => {
    const repo = createInMemoryTreatmentsRepository();
    await repo.insertTreatment("acc-1", baseInput({ startedOn: "2026-01-10" }));
    await repo.insertTreatment("acc-1", baseInput({ startedOn: "2026-06-20" }));
    await repo.insertTreatment("acc-1", baseInput({ contactId: "other", startedOn: "2026-09-01" }));

    const list = await repo.listTreatmentsForContact("acc-1", "contact-1");
    expect(list.map((t) => t.startedOn)).toEqual(["2026-06-20", "2026-01-10"]);
  });

  it("concludes a treatment and rejects a second conclusion", async () => {
    const repo = createInMemoryTreatmentsRepository();
    const t = await repo.insertTreatment("acc-1", baseInput());
    const done = await repo.concludeTreatment("acc-1", t.id, {
      dischargedOn: "2026-09-01",
      outcome: "cicatrizacao",
    });
    expect(done.status).toBe("concluido");
    expect(done.dischargedOn).toBe("2026-09-01");
    expect(done.outcome).toBe("cicatrizacao");

    await expect(
      repo.concludeTreatment("acc-1", t.id, { dischargedOn: "2026-09-02", outcome: "alta" }),
    ).rejects.toThrow();
  });

  it("sums photo bytes for the account only", async () => {
    const repo = createInMemoryTreatmentsRepository();
    const t = await repo.insertTreatment("acc-1", baseInput());
    await repo.insertPhoto("acc-1", {
      treatmentId: t.id, storagePath: "acc-1/x/a.jpg", bytes: 100_000, caption: null, takenOn: null,
    });
    await repo.insertPhoto("acc-1", {
      treatmentId: t.id, storagePath: "acc-1/x/b.jpg", bytes: 50_000, caption: null, takenOn: null,
    });
    await repo.insertPhoto("acc-2", {
      treatmentId: "t2", storagePath: "acc-2/y/c.jpg", bytes: 999_999, caption: null, takenOn: null,
    });

    expect(await repo.sumPhotoBytes("acc-1")).toBe(150_000);
  });
});
```

- [ ] **Step 4: Run it — expect failure**

Run: `npx vitest run src/modules/treatments/repository.memory.test.ts`
Expected: FAIL — `createInMemoryTreatmentsRepository` not found.

- [ ] **Step 5: Write `repository.memory.ts`**

Create `src/modules/treatments/repository.memory.ts`:

```ts
import type { TreatmentsRepository } from "./repository";
import type { Treatment, TreatmentPhoto } from "./types";

export function createInMemoryTreatmentsRepository(): TreatmentsRepository {
  const treatments = new Map<string, Treatment>();
  const photos = new Map<string, TreatmentPhoto>();

  function owned<T extends { accountId: string }>(row: T | undefined, accountId: string): T | null {
    return row && row.accountId === accountId ? row : null;
  }

  return {
    async insertTreatment(accountId, input) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const treatment: Treatment = {
        id,
        accountId,
        contactId: input.contactId,
        woundTypes: input.woundTypes,
        woundDetails: input.woundDetails,
        treatmentType: input.treatmentType,
        startedOn: input.startedOn,
        status: "em_andamento",
        dischargedOn: null,
        outcome: null,
        professionalAssessment: input.professionalAssessment,
        patientPerception: input.patientPerception,
        createdAt: now,
        updatedAt: now,
      };
      treatments.set(id, treatment);
      return treatment;
    },

    async updateTreatment(accountId, id, input) {
      const current = owned(treatments.get(id), accountId);
      if (!current) throw new Error("Treatment not found");
      const updated: Treatment = {
        ...current,
        ...(input.woundTypes !== undefined ? { woundTypes: input.woundTypes } : {}),
        ...(input.woundDetails !== undefined ? { woundDetails: input.woundDetails } : {}),
        ...(input.treatmentType !== undefined ? { treatmentType: input.treatmentType } : {}),
        ...(input.startedOn !== undefined ? { startedOn: input.startedOn } : {}),
        ...(input.professionalAssessment !== undefined
          ? { professionalAssessment: input.professionalAssessment }
          : {}),
        ...(input.patientPerception !== undefined
          ? { patientPerception: input.patientPerception }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      treatments.set(id, updated);
      return updated;
    },

    async concludeTreatment(accountId, id, input) {
      const current = owned(treatments.get(id), accountId);
      if (!current) throw new Error("Treatment not found");
      if (current.status === "concluido") throw new Error("Tratamento já foi concluído");
      const updated: Treatment = {
        ...current,
        status: "concluido",
        dischargedOn: input.dischargedOn,
        outcome: input.outcome,
        updatedAt: new Date().toISOString(),
      };
      treatments.set(id, updated);
      return updated;
    },

    async getTreatment(accountId, id) {
      return owned(treatments.get(id), accountId);
    },

    async listTreatmentsForContact(accountId, contactId) {
      return [...treatments.values()]
        .filter((t) => t.accountId === accountId && t.contactId === contactId)
        .sort((a, b) => b.startedOn.localeCompare(a.startedOn));
    },

    async deleteTreatment(accountId, id) {
      const current = owned(treatments.get(id), accountId);
      if (!current) throw new Error("Treatment not found");
      treatments.delete(id);
      for (const [photoId, p] of photos) {
        if (p.treatmentId === id) photos.delete(photoId);
      }
    },

    async insertPhoto(accountId, input) {
      const id = crypto.randomUUID();
      const photo: TreatmentPhoto = {
        id,
        accountId,
        treatmentId: input.treatmentId,
        storagePath: input.storagePath,
        bytes: input.bytes,
        caption: input.caption,
        takenOn: input.takenOn,
        createdAt: new Date().toISOString(),
      };
      photos.set(id, photo);
      return photo;
    },

    async listPhotos(accountId, treatmentId) {
      return [...photos.values()]
        .filter((p) => p.accountId === accountId && p.treatmentId === treatmentId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async getPhoto(accountId, photoId) {
      return owned(photos.get(photoId), accountId);
    },

    async updatePhotoMeta(accountId, photoId, input) {
      const current = owned(photos.get(photoId), accountId);
      if (!current) throw new Error("Photo not found");
      const updated: TreatmentPhoto = {
        ...current,
        caption: input.caption,
        takenOn: input.takenOn,
      };
      photos.set(photoId, updated);
      return updated;
    },

    async deletePhoto(accountId, photoId) {
      const current = owned(photos.get(photoId), accountId);
      if (!current) throw new Error("Photo not found");
      photos.delete(photoId);
    },

    async sumPhotoBytes(accountId) {
      return [...photos.values()]
        .filter((p) => p.accountId === accountId)
        .reduce((sum, p) => sum + p.bytes, 0);
    },
  };
}
```

- [ ] **Step 6: Run tests — expect pass**

Run: `npx vitest run src/modules/treatments/repository.memory.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/modules/treatments/types.ts src/modules/treatments/repository.ts src/modules/treatments/repository.memory.ts src/modules/treatments/repository.memory.test.ts
git commit -m "feat(treatments): types, repository interface, in-memory repo"
```

---

## Task 3: `treatments` schemas + service

**Files:**
- Create: `src/modules/treatments/schemas.ts`
- Create: `src/modules/treatments/service.ts`
- Test: `src/modules/treatments/service.test.ts`

**Interfaces:**
- Consumes: `TreatmentsRepository` (Task 2); `parseOrThrow` from `@/lib/zod-error`; types from `./types`.
- Produces (all from `service.ts`):
  - `createTreatment(repo, accountId, rawInput) → Promise<Treatment>`
  - `updateTreatment(repo, accountId, id, rawInput) → Promise<Treatment>`
  - `concludeTreatment(repo, accountId, id, rawInput) → Promise<Treatment>` (throws if raw invalid; repo throws if already concluded)
  - `listTreatmentsForContact(repo, accountId, contactId) → Promise<Treatment[]>`
  - `deleteTreatment(repo, accountId, id) → Promise<void>`
  - `updatePhotoMeta(repo, accountId, photoId, rawInput) → Promise<TreatmentPhoto>`
  - `assembleReport(input: AssembleReportInput) → TreatmentReport`
  - `formatDurationLabel(startedOn: string, endOn: string) → string` (both `YYYY-MM-DD`; exported for tests)
  - Schemas from `schemas.ts`: `createTreatmentInputSchema`, `updateTreatmentInputSchema`, `concludeTreatmentInputSchema`, `updatePhotoMetaInputSchema` + inferred `*Input` types.

- [ ] **Step 1: Write `schemas.ts`**

Create `src/modules/treatments/schemas.ts`:

```ts
import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const longText = z.string().trim().max(5000);
const shortText = z.string().trim().max(200);

export const createTreatmentInputSchema = z.object({
  contactId: z.string().uuid(),
  woundTypes: z.string().trim().min(1, "Informe ao menos um tipo de ferida").max(200),
  woundDetails: longText.optional(),
  treatmentType: shortText.optional(),
  startedOn: dateString,
  professionalAssessment: longText.optional(),
  patientPerception: longText.optional(),
});
export type CreateTreatmentInput = z.infer<typeof createTreatmentInputSchema>;

export const updateTreatmentInputSchema = z.object({
  woundTypes: z.string().trim().min(1, "Informe ao menos um tipo de ferida").max(200).optional(),
  woundDetails: longText.nullable().optional(),
  treatmentType: shortText.nullable().optional(),
  startedOn: dateString.optional(),
  professionalAssessment: longText.nullable().optional(),
  patientPerception: longText.nullable().optional(),
});
export type UpdateTreatmentInput = z.infer<typeof updateTreatmentInputSchema>;

export const concludeTreatmentInputSchema = z.object({
  dischargedOn: dateString,
  outcome: z.enum(["cicatrizacao", "alta", "abandono", "encaminhamento"]),
});
export type ConcludeTreatmentInput = z.infer<typeof concludeTreatmentInputSchema>;

export const updatePhotoMetaInputSchema = z.object({
  caption: shortText.nullable(),
  takenOn: dateString.nullable(),
});
export type UpdatePhotoMetaInput = z.infer<typeof updatePhotoMetaInputSchema>;
```

- [ ] **Step 2: Write the failing service test**

Create `src/modules/treatments/service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createInMemoryTreatmentsRepository } from "./repository.memory";
import {
  assembleReport,
  concludeTreatment,
  createTreatment,
  formatDurationLabel,
} from "./service";
import type { AssembleReportInput } from "./types";

const validCreate = {
  contactId: "11111111-1111-1111-1111-111111111111",
  woundTypes: "úlcera venosa",
  treatmentType: "ozonioterapia — bagging",
  startedOn: "2026-08-01",
};

describe("createTreatment", () => {
  it("persists all fields and defaults optionals to null", async () => {
    const repo = createInMemoryTreatmentsRepository();
    const t = await createTreatment(repo, "acc-1", validCreate);
    expect(t.woundTypes).toBe("úlcera venosa");
    expect(t.treatmentType).toBe("ozonioterapia — bagging");
    expect(t.woundDetails).toBeNull();
    expect(t.professionalAssessment).toBeNull();
    expect(t.status).toBe("em_andamento");
  });

  it("rejects an empty woundTypes", async () => {
    const repo = createInMemoryTreatmentsRepository();
    await expect(
      createTreatment(repo, "acc-1", { ...validCreate, woundTypes: "   " }),
    ).rejects.toThrow(/tipo de ferida/i);
  });
});

describe("concludeTreatment", () => {
  it("requires a valid outcome and dischargedOn", async () => {
    const repo = createInMemoryTreatmentsRepository();
    const t = await createTreatment(repo, "acc-1", validCreate);
    await expect(
      concludeTreatment(repo, "acc-1", t.id, { dischargedOn: "2026-09-01", outcome: "curou" }),
    ).rejects.toThrow();
  });

  it("sets status to concluido and rejects a second conclusion", async () => {
    const repo = createInMemoryTreatmentsRepository();
    const t = await createTreatment(repo, "acc-1", validCreate);
    const done = await concludeTreatment(repo, "acc-1", t.id, {
      dischargedOn: "2026-09-15",
      outcome: "cicatrizacao",
    });
    expect(done.status).toBe("concluido");
    await expect(
      concludeTreatment(repo, "acc-1", t.id, { dischargedOn: "2026-09-16", outcome: "alta" }),
    ).rejects.toThrow();
  });
});

describe("formatDurationLabel", () => {
  it("formats sub-week spans in days and longer spans in weeks", () => {
    expect(formatDurationLabel("2026-08-01", "2026-08-01")).toBe("0 dias");
    expect(formatDurationLabel("2026-08-01", "2026-08-04")).toBe("3 dias");
    expect(formatDurationLabel("2026-08-01", "2026-08-08")).toBe("1 semana");
    expect(formatDurationLabel("2026-08-01", "2026-09-12")).toBe("6 semanas");
  });
});

describe("assembleReport", () => {
  const baseInput = (over: Partial<AssembleReportInput> = {}): AssembleReportInput => ({
    treatment: {
      id: "t1", accountId: "acc-1", contactId: "c1",
      woundTypes: "úlcera venosa", woundDetails: null, treatmentType: "ozonioterapia",
      startedOn: "2026-08-01", status: "concluido", dischargedOn: "2026-09-12",
      outcome: "cicatrizacao", professionalAssessment: "Boa evolução.",
      patientPerception: "Sente menos dor.", createdAt: "", updatedAt: "",
    },
    contact: { name: "Maria", birthDate: "1970-05-02", cpf: null },
    professional: { clinicName: "Clínica X", name: "Silvana", councilId: "COREN-SP 123456" },
    sessionCount: 8,
    sessions: [
      { appointmentId: "a2", date: "2026-08-10T14:00:00.000Z", notes: "curativo" },
      { appointmentId: "a1", date: "2026-08-03T14:00:00.000Z", notes: null },
    ],
    photos: [{ url: "https://signed/x", caption: "Sessão 1", takenOn: "2026-08-03" }],
    now: "2026-10-01T12:00:00.000Z",
    ...over,
  });

  it("passes through counts, sorts sessions by date, and derives duration from dischargedOn", () => {
    const report = assembleReport(baseInput());
    expect(report.sessionCount).toBe(8);
    expect(report.sessions.map((s) => s.appointmentId)).toEqual(["a1", "a2"]);
    expect(report.durationLabel).toBe("6 semanas");
    expect(report.generatedAt).toBe("2026-10-01T12:00:00.000Z");
  });

  it("uses `now` for the duration end when the treatment is still open", () => {
    const input = baseInput();
    input.treatment.status = "em_andamento";
    input.treatment.dischargedOn = null;
    input.treatment.outcome = null;
    input.now = "2026-08-15T00:00:00.000Z";
    const report = assembleReport(input);
    expect(report.durationLabel).toBe("2 semanas");
  });
});
```

- [ ] **Step 3: Run it — expect failure**

Run: `npx vitest run src/modules/treatments/service.test.ts`
Expected: FAIL — `./service` has no exports yet.

- [ ] **Step 4: Write `service.ts`**

Create `src/modules/treatments/service.ts`:

```ts
import { parseOrThrow } from "@/lib/zod-error";
import type { TreatmentsRepository } from "./repository";
import {
  concludeTreatmentInputSchema,
  createTreatmentInputSchema,
  updatePhotoMetaInputSchema,
  updateTreatmentInputSchema,
} from "./schemas";
import type { AssembleReportInput, Treatment, TreatmentPhoto, TreatmentReport } from "./types";

export async function createTreatment(
  repo: TreatmentsRepository,
  accountId: string,
  rawInput: unknown,
): Promise<Treatment> {
  const input = parseOrThrow(createTreatmentInputSchema, rawInput);
  return repo.insertTreatment(accountId, {
    contactId: input.contactId,
    woundTypes: input.woundTypes,
    woundDetails: input.woundDetails ?? null,
    treatmentType: input.treatmentType ?? null,
    startedOn: input.startedOn,
    professionalAssessment: input.professionalAssessment ?? null,
    patientPerception: input.patientPerception ?? null,
  });
}

export async function updateTreatment(
  repo: TreatmentsRepository,
  accountId: string,
  id: string,
  rawInput: unknown,
): Promise<Treatment> {
  const input = parseOrThrow(updateTreatmentInputSchema, rawInput);
  return repo.updateTreatment(accountId, id, input);
}

export async function concludeTreatment(
  repo: TreatmentsRepository,
  accountId: string,
  id: string,
  rawInput: unknown,
): Promise<Treatment> {
  const input = parseOrThrow(concludeTreatmentInputSchema, rawInput);
  return repo.concludeTreatment(accountId, id, input);
}

export async function listTreatmentsForContact(
  repo: TreatmentsRepository,
  accountId: string,
  contactId: string,
): Promise<Treatment[]> {
  return repo.listTreatmentsForContact(accountId, contactId);
}

export async function deleteTreatment(
  repo: TreatmentsRepository,
  accountId: string,
  id: string,
): Promise<void> {
  await repo.deleteTreatment(accountId, id);
}

export async function updatePhotoMeta(
  repo: TreatmentsRepository,
  accountId: string,
  photoId: string,
  rawInput: unknown,
): Promise<TreatmentPhoto> {
  const input = parseOrThrow(updatePhotoMetaInputSchema, rawInput);
  return repo.updatePhotoMeta(accountId, photoId, input);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDurationLabel(startedOn: string, endOn: string): string {
  const start = new Date(`${startedOn}T00:00:00.000Z`).getTime();
  const end = new Date(`${endOn}T00:00:00.000Z`).getTime();
  const days = Math.max(0, Math.round((end - start) / DAY_MS));
  if (days < 7) return `${days} ${days === 1 ? "dia" : "dias"}`;
  const weeks = Math.round(days / 7);
  return `${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
}

export function assembleReport(input: AssembleReportInput): TreatmentReport {
  const endOn = input.treatment.dischargedOn ?? input.now.slice(0, 10);
  return {
    treatment: input.treatment,
    contact: input.contact,
    professional: input.professional,
    sessionCount: input.sessionCount,
    sessions: [...input.sessions].sort((a, b) => a.date.localeCompare(b.date)),
    photos: input.photos,
    durationLabel: formatDurationLabel(input.treatment.startedOn, endOn),
    generatedAt: input.now,
  };
}
```

- [ ] **Step 5: Run tests — expect pass**

Run: `npx vitest run src/modules/treatments/service.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS — no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/modules/treatments/schemas.ts src/modules/treatments/service.ts src/modules/treatments/service.test.ts
git commit -m "feat(treatments): schemas + service (create/update/conclude/assembleReport)"
```

---

## Task 4: `treatments` Supabase repository

**Files:**
- Create: `src/modules/treatments/repository.supabase.ts`

**Interfaces:**
- Consumes: `TreatmentsRepository` (Task 2); `Database` from `@/lib/supabase/database.types` (Task 1); `SupabaseClient`.
- Produces: `createSupabaseTreatmentsRepository(supabase: SupabaseClient<Database>): TreatmentsRepository`.

No unit test — the project does not unit-test Supabase repos (the in-memory repo mirrors behavior). Verification is `tsc`.

- [ ] **Step 1: Write `repository.supabase.ts`**

Create `src/modules/treatments/repository.supabase.ts`:

```ts
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { TreatmentsRepository } from "./repository";
import type { Treatment, TreatmentPhoto, TreatmentStatus, WoundOutcome } from "./types";

function throwDbError(error: PostgrestError): never {
  console.error("[treatments/repository.supabase]", error);
  throw new Error("Erro ao acessar o banco de dados. Tente novamente.");
}

function toTreatment(row: Database["public"]["Tables"]["treatments"]["Row"]): Treatment {
  return {
    id: row.id,
    accountId: row.account_id,
    contactId: row.contact_id,
    woundTypes: row.wound_types,
    woundDetails: row.wound_details,
    treatmentType: row.treatment_type,
    startedOn: row.started_on,
    status: row.status as TreatmentStatus,
    dischargedOn: row.discharged_on,
    outcome: row.outcome as WoundOutcome | null,
    professionalAssessment: row.professional_assessment,
    patientPerception: row.patient_perception,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPhoto(row: Database["public"]["Tables"]["treatment_photos"]["Row"]): TreatmentPhoto {
  return {
    id: row.id,
    accountId: row.account_id,
    treatmentId: row.treatment_id,
    storagePath: row.storage_path,
    bytes: row.bytes,
    caption: row.caption,
    takenOn: row.taken_on,
    createdAt: row.created_at,
  };
}

export function createSupabaseTreatmentsRepository(
  supabase: SupabaseClient<Database>,
): TreatmentsRepository {
  return {
    async insertTreatment(accountId, input) {
      const { data, error } = await supabase
        .from("treatments")
        .insert({
          account_id: accountId,
          contact_id: input.contactId,
          wound_types: input.woundTypes,
          wound_details: input.woundDetails,
          treatment_type: input.treatmentType,
          started_on: input.startedOn,
          professional_assessment: input.professionalAssessment,
          patient_perception: input.patientPerception,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toTreatment(data);
    },

    async updateTreatment(accountId, id, input) {
      const { data, error } = await supabase
        .from("treatments")
        .update({
          ...(input.woundTypes !== undefined ? { wound_types: input.woundTypes } : {}),
          ...(input.woundDetails !== undefined ? { wound_details: input.woundDetails } : {}),
          ...(input.treatmentType !== undefined ? { treatment_type: input.treatmentType } : {}),
          ...(input.startedOn !== undefined ? { started_on: input.startedOn } : {}),
          ...(input.professionalAssessment !== undefined
            ? { professional_assessment: input.professionalAssessment }
            : {}),
          ...(input.patientPerception !== undefined
            ? { patient_perception: input.patientPerception }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", accountId)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toTreatment(data);
    },

    async concludeTreatment(accountId, id, input) {
      const { data: current, error: readError } = await supabase
        .from("treatments")
        .select("status")
        .eq("account_id", accountId)
        .eq("id", id)
        .maybeSingle();
      if (readError) throwDbError(readError);
      if (!current) throw new Error("Tratamento não encontrado");
      if (current.status === "concluido") throw new Error("Tratamento já foi concluído");

      const { data, error } = await supabase
        .from("treatments")
        .update({
          status: "concluido",
          discharged_on: input.dischargedOn,
          outcome: input.outcome,
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", accountId)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toTreatment(data);
    },

    async getTreatment(accountId, id) {
      const { data, error } = await supabase
        .from("treatments")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", id)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toTreatment(data) : null;
    },

    async listTreatmentsForContact(accountId, contactId) {
      const { data, error } = await supabase
        .from("treatments")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("started_on", { ascending: false });
      if (error) throwDbError(error);
      return data.map(toTreatment);
    },

    async deleteTreatment(accountId, id) {
      const { error } = await supabase
        .from("treatments")
        .delete()
        .eq("account_id", accountId)
        .eq("id", id);
      if (error) throwDbError(error);
    },

    async insertPhoto(accountId, input) {
      const { data, error } = await supabase
        .from("treatment_photos")
        .insert({
          account_id: accountId,
          treatment_id: input.treatmentId,
          storage_path: input.storagePath,
          bytes: input.bytes,
          caption: input.caption,
          taken_on: input.takenOn,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toPhoto(data);
    },

    async listPhotos(accountId, treatmentId) {
      const { data, error } = await supabase
        .from("treatment_photos")
        .select("*")
        .eq("account_id", accountId)
        .eq("treatment_id", treatmentId)
        .order("created_at", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toPhoto);
    },

    async getPhoto(accountId, photoId) {
      const { data, error } = await supabase
        .from("treatment_photos")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", photoId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toPhoto(data) : null;
    },

    async updatePhotoMeta(accountId, photoId, input) {
      const { data, error } = await supabase
        .from("treatment_photos")
        .update({ caption: input.caption, taken_on: input.takenOn })
        .eq("account_id", accountId)
        .eq("id", photoId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toPhoto(data);
    },

    async deletePhoto(accountId, photoId) {
      const { error } = await supabase
        .from("treatment_photos")
        .delete()
        .eq("account_id", accountId)
        .eq("id", photoId);
      if (error) throwDbError(error);
    },

    async sumPhotoBytes(accountId) {
      const { data, error } = await supabase
        .from("treatment_photos")
        .select("bytes")
        .eq("account_id", accountId);
      if (error) throwDbError(error);
      return data.reduce((sum, row) => sum + row.bytes, 0);
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/modules/treatments/repository.supabase.ts
git commit -m "feat(treatments): Supabase repository"
```

---

## Task 5: `scheduling` — link appointments to treatments

**Files:**
- Modify: `src/modules/scheduling/types.ts`
- Modify: `src/modules/scheduling/repository.ts`
- Modify: `src/modules/scheduling/repository.memory.ts`
- Modify: `src/modules/scheduling/repository.supabase.ts`
- Modify: `src/modules/scheduling/service.ts`
- Test: `src/modules/scheduling/service.test.ts` (append)

**Interfaces:**
- Consumes: `TreatmentsRepository` (Task 2) for the same-contact validation.
- Produces:
  - `Appointment.treatmentId: string | null`.
  - `SchedulingRepository.insertAppointment` input gains optional `treatmentId?: string | null`.
  - `SchedulingRepository.updateAppointmentTreatment(accountId, appointmentId, treatmentId: string | null) → Promise<Appointment>`.
  - `SchedulingRepository.countConcludedAppointmentsByTreatment(accountId, treatmentId) → Promise<number>`.
  - `SchedulingRepository.listConcludedAppointmentsByTreatment(accountId, treatmentId) → Promise<Appointment[]>` (starts_at asc).
  - `service.linkAppointmentToTreatment(schedulingRepo, treatmentsRepo, accountId, appointmentId, treatmentId: string | null) → Promise<Appointment>`.

- [ ] **Step 1: Extend `types.ts`**

In `src/modules/scheduling/types.ts`, add `treatmentId` to `Appointment` (after `dealId`):

```ts
export interface Appointment {
  id: string;
  accountId: string;
  contactId: string;
  procedureId: string;
  dealId: string | null;
  treatmentId: string | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Extend `repository.ts`**

In `src/modules/scheduling/repository.ts`:

In `insertAppointment`'s input object type, add `treatmentId?: string | null;` after `dealId: string | null;`.

Add these three methods to the interface (next to the other appointment methods):

```ts
  updateAppointmentTreatment(
    accountId: string,
    appointmentId: string,
    treatmentId: string | null,
  ): Promise<Appointment>;
  countConcludedAppointmentsByTreatment(
    accountId: string,
    treatmentId: string,
  ): Promise<number>;
  listConcludedAppointmentsByTreatment(
    accountId: string,
    treatmentId: string,
  ): Promise<Appointment[]>;
```

- [ ] **Step 3: Write the failing service test**

Append to `src/modules/scheduling/service.test.ts`:

```ts
import { createInMemoryTreatmentsRepository } from "@/modules/treatments/repository.memory";
import { linkAppointmentToTreatment, updateAppointmentStatus } from "./service";

describe("treatment link", () => {
  async function seed() {
    const scheduling = createInMemorySchedulingRepository();
    const treatments = createInMemoryTreatmentsRepository();
    const procedure = await scheduling.insertProcedure("acc-1", {
      name: "Curativo", defaultPrice: 0, defaultDurationMinutes: 30,
    });
    const treatment = await treatments.insertTreatment("acc-1", {
      contactId: "contact-1", woundTypes: "úlcera", woundDetails: null,
      treatmentType: null, startedOn: "2026-08-01",
      professionalAssessment: null, patientPerception: null,
    });
    return { scheduling, treatments, procedure, treatment };
  }

  it("insertAppointment defaults treatmentId to null and accepts an explicit value", async () => {
    const { scheduling, procedure } = await seed();
    const a = await scheduling.insertAppointment("acc-1", {
      contactId: "contact-1", procedureId: procedure.id, dealId: null,
      startsAt: "2026-08-03T14:00:00.000Z", endsAt: "2026-08-03T14:30:00.000Z", notes: null,
    });
    expect(a.treatmentId).toBeNull();

    const b = await scheduling.insertAppointment("acc-1", {
      contactId: "contact-1", procedureId: procedure.id, dealId: null, treatmentId: "t-x",
      startsAt: "2026-08-04T14:00:00.000Z", endsAt: "2026-08-04T14:30:00.000Z", notes: null,
    });
    expect(b.treatmentId).toBe("t-x");
  });

  it("counts and lists only concluded appointments for a treatment, scoped by account", async () => {
    const { scheduling, procedure, treatment } = await seed();
    const mk = async (day: string) =>
      scheduling.insertAppointment("acc-1", {
        contactId: "contact-1", procedureId: procedure.id, dealId: null, treatmentId: treatment.id,
        startsAt: `2026-08-${day}T14:00:00.000Z`, endsAt: `2026-08-${day}T14:30:00.000Z`, notes: null,
      });
    const a1 = await mk("05");
    const a2 = await mk("03");
    await mk("10"); // stays 'agendado'
    await scheduling.updateAppointmentStatus("acc-1", a1.id, "concluido");
    await scheduling.updateAppointmentStatus("acc-1", a2.id, "concluido");

    expect(await scheduling.countConcludedAppointmentsByTreatment("acc-1", treatment.id)).toBe(2);
    expect(await scheduling.countConcludedAppointmentsByTreatment("acc-2", treatment.id)).toBe(0);
    const list = await scheduling.listConcludedAppointmentsByTreatment("acc-1", treatment.id);
    expect(list.map((a) => a.id)).toEqual([a2.id, a1.id]); // starts_at asc
  });

  it("linkAppointmentToTreatment rejects a treatment from a different contact", async () => {
    const { scheduling, treatments, procedure, treatment } = await seed();
    const appt = await scheduling.insertAppointment("acc-1", {
      contactId: "contact-2", procedureId: procedure.id, dealId: null,
      startsAt: "2026-08-03T14:00:00.000Z", endsAt: "2026-08-03T14:30:00.000Z", notes: null,
    });
    await expect(
      linkAppointmentToTreatment(scheduling, treatments, "acc-1", appt.id, treatment.id),
    ).rejects.toThrow();

    // unlink (null) always allowed
    const unlinked = await linkAppointmentToTreatment(scheduling, treatments, "acc-1", appt.id, null);
    expect(unlinked.treatmentId).toBeNull();
  });
});
```

- [ ] **Step 4: Run it — expect failure**

Run: `npx vitest run src/modules/scheduling/service.test.ts`
Expected: FAIL — new repo methods and `linkAppointmentToTreatment` are undefined.

- [ ] **Step 5: Implement in `repository.memory.ts`**

In `src/modules/scheduling/repository.memory.ts`:

In `insertAppointment`, set `treatmentId: input.treatmentId ?? null,` in the constructed `appointment` object (after `dealId: input.dealId,`).

Add the three methods inside the returned object (near `updateAppointmentStatus`):

```ts
    async updateAppointmentTreatment(accountId, appointmentId, treatmentId) {
      const appointment = appointments.get(appointmentId);
      if (!appointment || appointment.accountId !== accountId) {
        throw new Error("Appointment not found");
      }
      const updated: Appointment = {
        ...appointment,
        treatmentId,
        updatedAt: new Date().toISOString(),
      };
      appointments.set(appointmentId, updated);
      return updated;
    },

    async countConcludedAppointmentsByTreatment(accountId, treatmentId) {
      return [...appointments.values()].filter(
        (a) =>
          a.accountId === accountId &&
          a.treatmentId === treatmentId &&
          a.status === "concluido",
      ).length;
    },

    async listConcludedAppointmentsByTreatment(accountId, treatmentId) {
      return [...appointments.values()]
        .filter(
          (a) =>
            a.accountId === accountId &&
            a.treatmentId === treatmentId &&
            a.status === "concluido",
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },
```

- [ ] **Step 6: Implement in `repository.supabase.ts`**

In `src/modules/scheduling/repository.supabase.ts`:

In `toAppointment`, add `treatmentId: row.treatment_id,` (after `dealId: row.deal_id,`).

In `insertAppointment`'s `.insert({ ... })`, add `treatment_id: input.treatmentId ?? null,` (after `deal_id: input.dealId,`).

Add the three methods (near `updateAppointmentStatus`):

```ts
    async updateAppointmentTreatment(accountId, appointmentId, treatmentId) {
      const { data, error } = await supabase
        .from("appointments")
        .update({ treatment_id: treatmentId, updated_at: new Date().toISOString() })
        .eq("account_id", accountId)
        .eq("id", appointmentId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toAppointment(data);
    },

    async countConcludedAppointmentsByTreatment(accountId, treatmentId) {
      const { count, error } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .eq("treatment_id", treatmentId)
        .eq("status", "concluido");
      if (error) throwDbError(error);
      return count ?? 0;
    },

    async listConcludedAppointmentsByTreatment(accountId, treatmentId) {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("account_id", accountId)
        .eq("treatment_id", treatmentId)
        .eq("status", "concluido")
        .order("starts_at", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toAppointment);
    },
```

- [ ] **Step 7: Add `linkAppointmentToTreatment` to `service.ts`**

In `src/modules/scheduling/service.ts`, near `updateAppointmentStatus`, add (and import the treatments repo type at the top with the other imports):

```ts
import type { TreatmentsRepository } from "@/modules/treatments/repository";

export async function linkAppointmentToTreatment(
  schedulingRepo: SchedulingRepository,
  treatmentsRepo: TreatmentsRepository,
  accountId: string,
  appointmentId: string,
  treatmentId: string | null,
): Promise<Appointment> {
  const appointment = await schedulingRepo.getAppointment(accountId, appointmentId);
  if (!appointment) throw new Error("Agendamento não encontrado");

  if (treatmentId !== null) {
    const treatment = await treatmentsRepo.getTreatment(accountId, treatmentId);
    if (!treatment) throw new Error("Tratamento não encontrado");
    if (treatment.contactId !== appointment.contactId) {
      throw new Error("O tratamento pertence a outro paciente");
    }
  }

  return schedulingRepo.updateAppointmentTreatment(accountId, appointmentId, treatmentId);
}
```

`Appointment` is already imported in `service.ts`; if not, add it to the existing `./types` import.

- [ ] **Step 8: Run tests — expect pass**

Run: `npx vitest run src/modules/scheduling`
Expected: PASS — existing scheduling tests plus the 3 new ones.

- [ ] **Step 9: Handle the `createAppointment` service path**

`src/modules/scheduling/service.ts` `createAppointment` calls `insertAppointment` without `treatmentId`. That is fine (the field is optional and defaults to null). No change needed. Confirm with `npx tsc --noEmit`.
Expected: PASS. Also confirms `src/app/agendar/actions.ts` (public booking) still compiles.

- [ ] **Step 10: Commit**

```bash
git add src/modules/scheduling
git commit -m "feat(scheduling): appointment.treatment_id + link/count/list by treatment"
```

---

## Task 6: `crm` — `getContact`

**Files:**
- Modify: `src/modules/crm/repository.ts`
- Modify: `src/modules/crm/repository.memory.ts`
- Modify: `src/modules/crm/repository.supabase.ts`
- Test: `src/modules/crm/repository.memory.test.ts` (append)

**Interfaces:**
- Produces: `CrmRepository.getContact(accountId: string, contactId: string) → Promise<Contact | null>`.

- [ ] **Step 1: Add to the interface**

In `src/modules/crm/repository.ts`, in `CrmRepository`, next to `listContacts`:

```ts
  getContact(accountId: string, contactId: string): Promise<Contact | null>;
```

- [ ] **Step 2: Write the failing test**

Append to `src/modules/crm/repository.memory.test.ts`:

```ts
describe("getContact", () => {
  it("returns a contact by id, scoped to the account", async () => {
    const repo = createInMemoryCrmRepository();
    const created = await repo.insertContact("acc-1", { name: "Ana", phone: "+5511999999999" });
    expect((await repo.getContact("acc-1", created.id))?.id).toBe(created.id);
    expect(await repo.getContact("acc-2", created.id)).toBeNull();
    expect(await repo.getContact("acc-1", "missing")).toBeNull();
  });
});
```

(If `createInMemoryCrmRepository` is imported under a different name in that test file, match the existing import.)

- [ ] **Step 3: Run it — expect failure**

Run: `npx vitest run src/modules/crm/repository.memory.test.ts`
Expected: FAIL — `getContact` is not a function.

- [ ] **Step 4: Implement in `repository.memory.ts`**

In `src/modules/crm/repository.memory.ts`, next to `listContacts`:

```ts
    async getContact(accountId, contactId) {
      const contact = contacts.get(contactId);
      return contact && contact.accountId === accountId ? contact : null;
    },
```

- [ ] **Step 5: Implement in `repository.supabase.ts`**

In `src/modules/crm/repository.supabase.ts`, next to `listContacts`:

```ts
    async getContact(accountId, contactId) {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", contactId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toContact(data) : null;
    },
```

(Use whatever the existing db-error helper in that file is called.)

- [ ] **Step 6: Run tests — expect pass**

Run: `npx vitest run src/modules/crm && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/crm
git commit -m "feat(crm): getContact(accountId, contactId)"
```

---

## Task 7: `/configuracoes` — professional identity + storage usage

**Files:**
- Modify: `src/lib/supabase/account.ts`
- Create: `src/app/(app)/configuracoes/actions.ts`
- Create: `src/app/(app)/configuracoes/page.tsx`
- Create: `src/components/settings/settings-client.tsx`
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Consumes: `createSupabaseTreatmentsRepository` (Task 4); `getCurrentAccountId` (existing).
- Produces:
  - `getAccountProfessionalIdentity(supabase, accountId) → Promise<{ name: string; professionalName: string | null; councilId: string | null }>` in `src/lib/supabase/account.ts`.
  - `getClinicSettingsAction() → Promise<{ name: string; professionalName: string | null; councilId: string | null; storageBytes: number }>`.
  - `updateProfessionalIdentityAction(input: { professionalName: string | null; councilId: string | null }) → Promise<void>`.

- [ ] **Step 1: Add `getAccountProfessionalIdentity`**

In `src/lib/supabase/account.ts`, after `getCurrentAccountName`:

```ts
export async function getAccountProfessionalIdentity(
  supabase: SupabaseClient<Database>,
  accountId: string,
): Promise<{ name: string; professionalName: string | null; councilId: string | null }> {
  const { data, error } = await supabase
    .from("accounts")
    .select("name, professional_name, professional_council_id")
    .eq("id", accountId)
    .single();
  if (error) throw error;
  return {
    name: data.name,
    professionalName: data.professional_name,
    councilId: data.professional_council_id,
  };
}
```

- [ ] **Step 2: Write `configuracoes/actions.ts`**

Create `src/app/(app)/configuracoes/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getAccountProfessionalIdentity,
  getCurrentAccountId,
} from "@/lib/supabase/account";
import { createSupabaseTreatmentsRepository } from "@/modules/treatments/repository.supabase";
import { parseOrThrow } from "@/lib/zod-error";

const identitySchema = z.object({
  professionalName: z.string().trim().max(200).nullable(),
  councilId: z.string().trim().max(100).nullable(),
});

export async function getClinicSettingsAction() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const identity = await getAccountProfessionalIdentity(supabase, accountId);
  const treatmentsRepo = createSupabaseTreatmentsRepository(supabase);
  const storageBytes = await treatmentsRepo.sumPhotoBytes(accountId);
  return { ...identity, storageBytes };
}

export async function updateProfessionalIdentityAction(input: unknown) {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const parsed = parseOrThrow(identitySchema, input);
  const { error } = await supabase
    .from("accounts")
    .update({
      professional_name: parsed.professionalName || null,
      professional_council_id: parsed.councilId || null,
    })
    .eq("id", accountId);
  if (error) {
    console.error("[configuracoes/actions] updateProfessionalIdentity", error);
    throw new Error("Não foi possível salvar as configurações. Tente novamente.");
  }
  revalidatePath("/configuracoes");
}
```

- [ ] **Step 3: Write `settings-client.tsx`**

Create `src/components/settings/settings-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfessionalIdentityAction } from "@/app/(app)/configuracoes/actions";

const GB = 1024 * 1024 * 1024;

export function SettingsClient({
  initial,
}: {
  initial: {
    professionalName: string | null;
    councilId: string | null;
    storageBytes: number;
  };
}) {
  const [professionalName, setProfessionalName] = useState(initial.professionalName ?? "");
  const [councilId, setCouncilId] = useState(initial.councilId ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usedMb = initial.storageBytes / (1024 * 1024);
  const usedPct = Math.min(100, (initial.storageBytes / GB) * 100);
  const nearLimit = usedPct >= 80;

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateProfessionalIdentityAction({
        professionalName: professionalName.trim() || null,
        councilId: councilId.trim() || null,
      });
      setMessage("Configurações salvas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-8 px-6 pb-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Identidade profissional</h2>
          <p className="text-sm text-muted-foreground">
            Usada no cabeçalho e no rodapé do relatório clínico.
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}
        <div className="space-y-1">
          <Label htmlFor="professionalName">Nome da profissional</Label>
          <Input
            id="professionalName"
            value={professionalName}
            onChange={(e) => setProfessionalName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="councilId">Registro no conselho</Label>
          <Input
            id="councilId"
            value={councilId}
            onChange={(e) => setCouncilId(e.target.value)}
            placeholder="COREN-SP 123456"
          />
        </div>
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Armazenamento de fotos</h2>
        <p className={`text-sm ${nearLimit ? "text-red-600" : "text-muted-foreground"}`}>
          Fotos: {usedMb.toFixed(usedMb < 10 ? 1 : 0)} MB de 1 GB
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full ${nearLimit ? "bg-red-600" : "bg-primary"}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Write `configuracoes/page.tsx`**

Create `src/app/(app)/configuracoes/page.tsx`:

```tsx
import { PageHeader } from "@/components/layout/page-header";
import { SettingsClient } from "@/components/settings/settings-client";
import { getClinicSettingsAction } from "./actions";

export default async function ConfiguracoesPage() {
  const settings = await getClinicSettingsAction();
  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Identidade profissional e uso de armazenamento."
      />
      <SettingsClient initial={settings} />
    </div>
  );
}
```

- [ ] **Step 5: Add the sidebar item**

In `src/components/layout/sidebar.tsx`:
- Add `Settings` to the `lucide-react` import.
- Add to `clinicaModules` (last):

```ts
  { label: "Configurações", href: "/configuracoes", icon: Settings, enabled: true },
```

- [ ] **Step 6: Typecheck + manual check**

Run: `npx tsc --noEmit` → PASS.
Run: `npm run dev`, open `/configuracoes`. Expected: form renders with current values (blank initially); saving a name + council id shows "Configurações salvas."; reloading keeps the values; storage bar shows "Fotos: 0.0 MB de 1 GB".

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/account.ts "src/app/(app)/configuracoes" src/components/settings/settings-client.tsx src/components/layout/sidebar.tsx
git commit -m "feat(configuracoes): professional identity + photo storage usage"
```

---

## Task 8: Client photo compression pipeline

**Files:**
- Modify: `package.json` (+ `package-lock.json`)
- Create: `src/components/treatments/prepare-photo.ts`
- Test: `src/components/treatments/prepare-photo.test.ts`

**Interfaces:**
- Produces (from `prepare-photo.ts`):
  - `MAX_INPUT_BYTES = 26214400` (25 MiB), `MAX_OUTPUT_BYTES = 409600` (400 KiB).
  - `assertAcceptableInput(file: File): void` — throws `Error` for non-image / oversized input.
  - `assertAcceptableOutput(bytes: number): void` — throws `Error` when `bytes > MAX_OUTPUT_BYTES`.
  - `prepareTreatmentPhoto(file: File): Promise<Blob>` — full pipeline (HEIC→JPEG, iterative compression), returns the compressed JPEG `Blob`.

- [ ] **Step 1: Install the libraries**

Run: `npm install browser-image-compression heic2any`
Expected: both added to `dependencies`.

- [ ] **Step 2: Write the failing test**

Create `src/components/treatments/prepare-photo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MAX_OUTPUT_BYTES,
  assertAcceptableInput,
  assertAcceptableOutput,
} from "./prepare-photo";

function fakeFile(name: string, type: string, size: number): File {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("assertAcceptableInput", () => {
  it("accepts a normal image", () => {
    expect(() => assertAcceptableInput(fakeFile("a.jpg", "image/jpeg", 2_000_000))).not.toThrow();
  });

  it("accepts a HEIC file even with an empty MIME type", () => {
    expect(() => assertAcceptableInput(fakeFile("IMG_1.HEIC", "", 3_000_000))).not.toThrow();
  });

  it("rejects a non-image file", () => {
    expect(() => assertAcceptableInput(fakeFile("notes.pdf", "application/pdf", 1000))).toThrow(
      /não é uma imagem/i,
    );
  });

  it("rejects an input larger than 25 MB", () => {
    expect(() => assertAcceptableInput(fakeFile("huge.jpg", "image/jpeg", 30 * 1024 * 1024))).toThrow(
      /muito grande/i,
    );
  });
});

describe("assertAcceptableOutput", () => {
  it("accepts a result at or below 400 KB", () => {
    expect(() => assertAcceptableOutput(MAX_OUTPUT_BYTES)).not.toThrow();
    expect(() => assertAcceptableOutput(120_000)).not.toThrow();
  });

  it("rejects a result above 400 KB", () => {
    expect(() => assertAcceptableOutput(MAX_OUTPUT_BYTES + 1)).toThrow(/reduzir/i);
  });
});
```

- [ ] **Step 3: Run it — expect failure**

Run: `npx vitest run src/components/treatments/prepare-photo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `prepare-photo.ts`**

Create `src/components/treatments/prepare-photo.ts`:

```ts
import imageCompression from "browser-image-compression";

export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 400 * 1024;

function isHeic(file: File): boolean {
  return (
    /image\/heic|image\/heif/i.test(file.type) ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

export function assertAcceptableInput(file: File): void {
  if (!file.type.startsWith("image/") && !isHeic(file)) {
    throw new Error("O arquivo não é uma imagem.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("A imagem é muito grande (máx. 25 MB).");
  }
}

export function assertAcceptableOutput(bytes: number): void {
  if (bytes > MAX_OUTPUT_BYTES) {
    throw new Error("Não foi possível reduzir esta foto o suficiente. Tente outra imagem.");
  }
}

export async function prepareTreatmentPhoto(file: File): Promise<Blob> {
  assertAcceptableInput(file);

  let working: Blob = file;
  if (isHeic(file)) {
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
      working = Array.isArray(converted) ? converted[0] : converted;
    } catch {
      throw new Error(
        "Não foi possível processar esta foto. Exporte como JPEG e tente de novo.",
      );
    }
  }

  const asFile =
    working instanceof File
      ? working
      : new File([working], "photo.jpg", { type: "image/jpeg" });

  const compressed = await imageCompression(asFile, {
    maxWidthOrHeight: 800,
    maxSizeMB: 0.2,
    initialQuality: 0.8,
    useWebWorker: true,
  });

  assertAcceptableOutput(compressed.size);
  return compressed;
}
```

- [ ] **Step 5: Run tests — expect pass**

Run: `npx vitest run src/components/treatments/prepare-photo.test.ts`
Expected: PASS (6 tests). (`browser-image-compression` imports fine under jsdom; the canvas path is never exercised by these tests.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/treatments/prepare-photo.ts src/components/treatments/prepare-photo.test.ts
git commit -m "feat(treatments): client photo compression pipeline (HEIC + iterative)"
```

---

## Task 9: `/pacientes/[id]` detail page + treatment actions

**Files:**
- Create: `src/app/(app)/pacientes/[id]/actions.ts`
- Create: `src/app/(app)/pacientes/[id]/page.tsx`
- Create: `src/components/patients/patient-detail-client.tsx`
- Create: `src/components/treatments/treatment-form-dialog.tsx`
- Modify: `src/components/patients/patients-client.tsx`

**Interfaces:**
- Consumes: `createSupabaseTreatmentsRepository`, `createSupabaseSchedulingRepository`, `createSupabaseCrmRepository`, treatments `service`, scheduling `service`, `crm.getContact`, `getAccountProfessionalIdentity`, `prepareTreatmentPhoto`.
- Produces (server actions in `pacientes/[id]/actions.ts`):
  - `getPatientAction(contactId) → Contact` (throws if not found)
  - `listTreatmentsAction(contactId) → Treatment[]`
  - `createTreatmentAction(input) → Treatment`
  - `getTreatmentAction(treatmentId) → Treatment | null`
  - `updateTreatmentAction(treatmentId, input) → Treatment`
  - `concludeTreatmentAction(treatmentId, input) → Treatment`
  - `deleteTreatmentAction(treatmentId) → void`
  - `listTreatmentSessionsAction(treatmentId) → { count: number; sessions: TreatmentSession[] }`
  - `listTreatmentPhotosAction(treatmentId) → { id: string; url: string; caption: string | null; takenOn: string | null }[]`
  - `uploadTreatmentPhotoAction(treatmentId, formData: FormData) → void` (formData has `file` = compressed Blob, optional `caption`, `takenOn`)
  - `updatePhotoMetaAction(photoId, input) → void`
  - `deleteTreatmentPhotoAction(photoId) → void`
  - `getTreatmentReportDataAction(treatmentId) → TreatmentReport`

- [ ] **Step 1: Write `pacientes/[id]/actions.ts`**

Create `src/app/(app)/pacientes/[id]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getAccountProfessionalIdentity,
  getCurrentAccountId,
} from "@/lib/supabase/account";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import { createSupabaseSchedulingRepository } from "@/modules/scheduling/repository.supabase";
import { createSupabaseTreatmentsRepository } from "@/modules/treatments/repository.supabase";
import * as treatments from "@/modules/treatments/service";
import { assembleReport } from "@/modules/treatments/service";
import { MAX_OUTPUT_BYTES } from "@/components/treatments/prepare-photo";
import type { TreatmentSession } from "@/modules/treatments/types";

const BUCKET = "treatment-photos";
const SIGNED_URL_TTL = 3600;

async function ctx() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  return {
    supabase,
    accountId,
    treatmentsRepo: createSupabaseTreatmentsRepository(supabase),
    schedulingRepo: createSupabaseSchedulingRepository(supabase),
    crmRepo: createSupabaseCrmRepository(supabase),
  };
}

async function ownedTreatment(
  c: Awaited<ReturnType<typeof ctx>>,
  treatmentId: string,
) {
  const treatment = await c.treatmentsRepo.getTreatment(c.accountId, treatmentId);
  if (!treatment) throw new Error("Tratamento não encontrado");
  return treatment;
}

export async function getPatientAction(contactId: string) {
  const { crmRepo, accountId } = await ctx();
  const contact = await crmRepo.getContact(accountId, contactId);
  if (!contact) throw new Error("Paciente não encontrado");
  return contact;
}

export async function listTreatmentsAction(contactId: string) {
  const { treatmentsRepo, accountId } = await ctx();
  return treatments.listTreatmentsForContact(treatmentsRepo, accountId, contactId);
}

export async function createTreatmentAction(input: unknown) {
  const { treatmentsRepo, accountId } = await ctx();
  const created = await treatments.createTreatment(treatmentsRepo, accountId, input);
  revalidatePath(`/pacientes/${created.contactId}`);
  return created;
}

export async function getTreatmentAction(treatmentId: string) {
  const { treatmentsRepo, accountId } = await ctx();
  return treatmentsRepo.getTreatment(accountId, treatmentId);
}

export async function updateTreatmentAction(treatmentId: string, input: unknown) {
  const { treatmentsRepo, accountId } = await ctx();
  const updated = await treatments.updateTreatment(treatmentsRepo, accountId, treatmentId, input);
  revalidatePath(`/pacientes/${updated.contactId}/tratamentos/${treatmentId}`);
  return updated;
}

export async function concludeTreatmentAction(treatmentId: string, input: unknown) {
  const { treatmentsRepo, accountId } = await ctx();
  const done = await treatments.concludeTreatment(treatmentsRepo, accountId, treatmentId, input);
  revalidatePath(`/pacientes/${done.contactId}/tratamentos/${treatmentId}`);
  return done;
}

export async function deleteTreatmentAction(treatmentId: string) {
  const c = await ctx();
  const treatment = await ownedTreatment(c, treatmentId);
  const photos = await c.treatmentsRepo.listPhotos(c.accountId, treatmentId);
  if (photos.length > 0) {
    await c.supabase.storage.from(BUCKET).remove(photos.map((p) => p.storagePath));
  }
  await treatments.deleteTreatment(c.treatmentsRepo, c.accountId, treatmentId);
  revalidatePath(`/pacientes/${treatment.contactId}`);
}

export async function listTreatmentSessionsAction(
  treatmentId: string,
): Promise<{ count: number; sessions: TreatmentSession[] }> {
  const { schedulingRepo, accountId } = await ctx();
  const [count, appointments] = await Promise.all([
    schedulingRepo.countConcludedAppointmentsByTreatment(accountId, treatmentId),
    schedulingRepo.listConcludedAppointmentsByTreatment(accountId, treatmentId),
  ]);
  return {
    count,
    sessions: appointments.map((a) => ({
      appointmentId: a.id,
      date: a.startsAt,
      notes: a.notes,
    })),
  };
}

export async function listTreatmentPhotosAction(treatmentId: string) {
  const c = await ctx();
  const photos = await c.treatmentsRepo.listPhotos(c.accountId, treatmentId);
  if (photos.length === 0) return [];
  const { data, error } = await c.supabase.storage
    .from(BUCKET)
    .createSignedUrls(photos.map((p) => p.storagePath), SIGNED_URL_TTL);
  if (error) throw new Error("Não foi possível carregar as fotos.");
  return photos.map((p, i) => ({
    id: p.id,
    url: data[i]?.signedUrl ?? "",
    caption: p.caption,
    takenOn: p.takenOn,
  }));
}

export async function uploadTreatmentPhotoAction(treatmentId: string, formData: FormData) {
  const c = await ctx();
  await ownedTreatment(c, treatmentId);

  const file = formData.get("file");
  if (!(file instanceof Blob)) throw new Error("Arquivo inválido.");
  if (!file.type.startsWith("image/")) throw new Error("O arquivo não é uma imagem.");
  if (file.size > MAX_OUTPUT_BYTES) throw new Error("A foto excede o tamanho permitido.");

  const caption = (formData.get("caption") as string | null)?.trim() || null;
  const takenOnRaw = (formData.get("takenOn") as string | null)?.trim() || null;
  const takenOn = takenOnRaw && /^\d{4}-\d{2}-\d{2}$/.test(takenOnRaw) ? takenOnRaw : null;

  const path = `${c.accountId}/${treatmentId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await c.supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: "image/jpeg", upsert: false });
  if (uploadError) {
    console.error("[pacientes/[id]/actions] upload", uploadError);
    throw new Error("Não foi possível enviar a foto. Tente novamente.");
  }

  await c.treatmentsRepo.insertPhoto(c.accountId, {
    treatmentId,
    storagePath: path,
    bytes: file.size,
    caption,
    takenOn,
  });
  const treatment = await ownedTreatment(c, treatmentId);
  revalidatePath(`/pacientes/${treatment.contactId}/tratamentos/${treatmentId}`);
}

export async function updatePhotoMetaAction(photoId: string, input: unknown) {
  const { treatmentsRepo, accountId } = await ctx();
  await treatments.updatePhotoMeta(treatmentsRepo, accountId, photoId, input);
}

export async function deleteTreatmentPhotoAction(photoId: string) {
  const c = await ctx();
  const photo = await c.treatmentsRepo.getPhoto(c.accountId, photoId);
  if (!photo) throw new Error("Foto não encontrada");
  await c.supabase.storage.from(BUCKET).remove([photo.storagePath]);
  await c.treatmentsRepo.deletePhoto(c.accountId, photoId);
}

export async function getTreatmentReportDataAction(treatmentId: string) {
  const c = await ctx();
  const treatment = await ownedTreatment(c, treatmentId);
  const [contact, identity, sessionsData, photos] = await Promise.all([
    c.crmRepo.getContact(c.accountId, treatment.contactId),
    getAccountProfessionalIdentity(c.supabase, c.accountId),
    listTreatmentSessionsAction(treatmentId),
    listTreatmentPhotosAction(treatmentId),
  ]);
  if (!contact) throw new Error("Paciente não encontrado");

  return assembleReport({
    treatment,
    contact: { name: contact.name, birthDate: contact.birthDate, cpf: contact.cpf },
    professional: {
      clinicName: identity.name,
      name: identity.professionalName,
      councilId: identity.councilId,
    },
    sessionCount: sessionsData.count,
    sessions: sessionsData.sessions,
    photos: photos.map((p) => ({ url: p.url, caption: p.caption, takenOn: p.takenOn })),
    now: new Date().toISOString(),
  });
}
```

- [ ] **Step 2: Write `treatment-form-dialog.tsx`**

Create `src/components/treatments/treatment-form-dialog.tsx`:

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
import { Textarea } from "@/components/ui/textarea";
import { createTreatmentAction } from "@/app/(app)/pacientes/[id]/actions";
import type { Treatment } from "@/modules/treatments/types";

const KNOWN_WOUND_TYPES = [
  "lesão por diabetes",
  "úlcera venosa",
  "úlcera arterial",
  "lesão por trauma",
  "lesão por pressão",
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TreatmentFormDialog({
  open,
  onOpenChange,
  contactId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  onCreated: (treatment: Treatment) => void;
}) {
  const [woundTypes, setWoundTypes] = useState("");
  const [woundDetails, setWoundDetails] = useState("");
  const [treatmentType, setTreatmentType] = useState("");
  const [startedOn, setStartedOn] = useState(today());
  const [professionalAssessment, setProfessionalAssessment] = useState("");
  const [patientPerception, setPatientPerception] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    setWoundTypes("");
    setWoundDetails("");
    setTreatmentType("");
    setStartedOn(today());
    setProfessionalAssessment("");
    setPatientPerception("");
    setError(null);
  }, [open]);

  function addKnownType(type: string) {
    setWoundTypes((prev) => {
      const parts = prev.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.includes(type)) return prev;
      return [...parts, type].join(", ");
    });
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const created = await createTreatmentAction({
        contactId,
        woundTypes,
        woundDetails: woundDetails.trim() || undefined,
        treatmentType: treatmentType.trim() || undefined,
        startedOn,
        professionalAssessment: professionalAssessment.trim() || undefined,
        patientPerception: patientPerception.trim() || undefined,
      });
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar tratamento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo tratamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="space-y-1">
            <Label htmlFor="woundTypes">Tipos de ferida</Label>
            <Input
              id="woundTypes"
              value={woundTypes}
              onChange={(e) => setWoundTypes(e.target.value)}
              placeholder="Ex.: úlcera venosa"
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {KNOWN_WOUND_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addKnownType(type)}
                  className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  + {type}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="woundDetails">Detalhes da ferida</Label>
            <Textarea
              id="woundDetails"
              value={woundDetails}
              onChange={(e) => setWoundDetails(e.target.value)}
              placeholder="Local no corpo, lado, aspecto…"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="treatmentType">Tipo de tratamento</Label>
            <Input
              id="treatmentType"
              value={treatmentType}
              onChange={(e) => setTreatmentType(e.target.value)}
              placeholder="Ex.: ozonioterapia — bagging"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="startedOn">Data de início</Label>
            <Input
              id="startedOn"
              type="date"
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="assessment">Avaliação da profissional</Label>
            <Textarea
              id="assessment"
              value={professionalAssessment}
              onChange={(e) => setProfessionalAssessment(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="perception">Percepção do paciente</Label>
            <Textarea
              id="perception"
              value={patientPerception}
              onChange={(e) => setPatientPerception(e.target.value)}
            />
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={handleSubmit}
            disabled={saving || !woundTypes.trim()}
          >
            {saving ? "Criando…" : "Criar tratamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write `patient-detail-client.tsx`**

Create `src/components/patients/patient-detail-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PatientFormDialog } from "./patient-form-dialog";
import { TreatmentFormDialog } from "@/components/treatments/treatment-form-dialog";
import type { Contact } from "@/modules/crm/types";
import type { Treatment } from "@/modules/treatments/types";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function PatientDetailClient({
  patient: initialPatient,
  treatments: initialTreatments,
}: {
  patient: Contact;
  treatments: Treatment[];
}) {
  const [patient, setPatient] = useState(initialPatient);
  const [treatments, setTreatments] = useState(initialTreatments);
  const [editOpen, setEditOpen] = useState(false);
  const [treatmentFormOpen, setTreatmentFormOpen] = useState(false);

  return (
    <div className="space-y-8 px-6 pb-6">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Dados do paciente</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            Editar dados
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Telefone</dt><dd>{patient.phone}</dd></div>
          <div><dt className="text-muted-foreground">E-mail</dt><dd>{patient.email ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">CPF</dt><dd>{patient.cpf ?? "—"}</dd></div>
          <div>
            <dt className="text-muted-foreground">Nascimento</dt>
            <dd>{patient.birthDate ? formatDate(patient.birthDate) : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Tratamentos</h2>
          <Button type="button" size="sm" onClick={() => setTreatmentFormOpen(true)}>
            Novo tratamento
          </Button>
        </div>
        {treatments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum tratamento registrado.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {treatments.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/pacientes/${patient.id}/tratamentos/${t.id}`}
                  className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40"
                >
                  <span>
                    Tratamento iniciado em {formatDate(t.startedOn)} — {t.woundTypes}
                  </span>
                  <Badge variant={t.status === "concluido" ? "secondary" : "default"}>
                    {t.status === "concluido" ? "Concluído" : "Em andamento"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PatientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editingPatient={patient}
        onSaved={setPatient}
      />
      <TreatmentFormDialog
        open={treatmentFormOpen}
        onOpenChange={setTreatmentFormOpen}
        contactId={patient.id}
        onCreated={(t) => setTreatments((prev) => [t, ...prev])}
      />
    </div>
  );
}
```

- [ ] **Step 4: Write `pacientes/[id]/page.tsx`**

Create `src/app/(app)/pacientes/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PatientDetailClient } from "@/components/patients/patient-detail-client";
import { getPatientAction, listTreatmentsAction } from "./actions";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let patient;
  try {
    patient = await getPatientAction(id);
  } catch {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Paciente não encontrado.{" "}
          <Link href="/pacientes" className="underline">
            Voltar
          </Link>
        </p>
      </div>
    );
  }

  const treatments = await listTreatmentsAction(id);

  return (
    <div>
      <PageHeader title={patient.name} description="Detalhe do paciente e tratamentos." />
      <PatientDetailClient patient={patient} treatments={treatments} />
    </div>
  );
}
```

- [ ] **Step 5: Make the patient list navigate to the detail page**

In `src/components/patients/patients-client.tsx`:
- Add `import Link from "next/link";` at the top.
- Replace the name cell (currently `<td className="cursor-pointer p-2" onClick={() => openEditPatientForm(patient)}>{patient.name}</td>`) with:

```tsx
                <td className="p-2">
                  <Link href={`/pacientes/${patient.id}`} className="hover:underline">
                    {patient.name}
                  </Link>
                </td>
```

- `openEditPatientForm` is still used by `handleSaved` wiring and the `PatientFormDialog`; leave `editingPatient`/`openEditPatientForm` as they are (the "Novo paciente" button still uses `openNewPatientForm`). If `openEditPatientForm` becomes unused after this change, remove it and the now-unused `editingPatient` state only if TypeScript/ESLint flags them — otherwise leave untouched.

Run: `npx eslint src/components/patients/patients-client.tsx` and remove only what it reports as unused.

- [ ] **Step 6: Typecheck + manual check**

Run: `npx tsc --noEmit` → PASS.
Run: `npm run dev`. From `/pacientes`, click a patient name → lands on `/pacientes/<id>` showing patient data + empty Tratamentos list. "Novo tratamento" → fill "úlcera venosa", submit → item appears with "Em andamento" badge. "Editar dados" still opens the existing dialog.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/pacientes/[id]" src/components/patients/patient-detail-client.tsx src/components/patients/patients-client.tsx src/components/treatments/treatment-form-dialog.tsx
git commit -m "feat(treatments): patient detail page + treatment actions + new-treatment form"
```

---

## Task 10: `/pacientes/[id]/tratamentos/[treatmentId]` — treatment detail

**Files:**
- Create: `src/app/(app)/pacientes/[id]/tratamentos/[treatmentId]/page.tsx`
- Create: `src/components/treatments/treatment-detail-client.tsx`
- Create: `src/components/treatments/conclude-treatment-dialog.tsx`
- Create: `src/components/treatments/treatment-photos.tsx`

**Interfaces:**
- Consumes: all actions from Task 9; `prepareTreatmentPhoto` (Task 8).
- Produces: no new exported symbols other than the three React components. The page reads its data server-side via the Task 9 actions.

- [ ] **Step 1: Write `conclude-treatment-dialog.tsx`**

Create `src/components/treatments/conclude-treatment-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { concludeTreatmentAction } from "@/app/(app)/pacientes/[id]/actions";
import type { Treatment, WoundOutcome } from "@/modules/treatments/types";

const OUTCOMES: { value: WoundOutcome; label: string }[] = [
  { value: "cicatrizacao", label: "Cicatrização completa" },
  { value: "alta", label: "Alta pela profissional" },
  { value: "abandono", label: "Abandono do tratamento" },
  { value: "encaminhamento", label: "Encaminhamento" },
];

export function ConcludeTreatmentDialog({
  open,
  onOpenChange,
  treatmentId,
  onConcluded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatmentId: string;
  onConcluded: (treatment: Treatment) => void;
}) {
  const [outcome, setOutcome] = useState<WoundOutcome>("cicatrizacao");
  const [dischargedOn, setDischargedOn] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      const done = await concludeTreatmentAction(treatmentId, { outcome, dischargedOn });
      onConcluded(done);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao concluir tratamento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Concluir tratamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Desfecho</legend>
            {OUTCOMES.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="outcome"
                  value={o.value}
                  checked={outcome === o.value}
                  onChange={() => setOutcome(o.value)}
                />
                {o.label}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="dischargedOn">Data de alta</Label>
            <Input
              id="dischargedOn"
              type="date"
              value={dischargedOn}
              onChange={(e) => setDischargedOn(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="button" className="flex-1" onClick={handleConfirm} disabled={saving}>
              {saving ? "Concluindo…" : "Concluir"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write `treatment-photos.tsx`**

Create `src/components/treatments/treatment-photos.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { prepareTreatmentPhoto } from "./prepare-photo";
import {
  deleteTreatmentPhotoAction,
  listTreatmentPhotosAction,
  updatePhotoMetaAction,
  uploadTreatmentPhotoAction,
} from "@/app/(app)/pacientes/[id]/actions";

type Photo = { id: string; url: string; caption: string | null; takenOn: string | null };

export function TreatmentPhotos({
  treatmentId,
  initialPhotos,
}: {
  treatmentId: string;
  initialPhotos: Photo[];
}) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setPhotos(await listTreatmentPhotosAction(treatmentId));
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const blob = await prepareTreatmentPhoto(file);
      const formData = new FormData();
      formData.set("file", blob, "photo.jpg");
      await uploadTreatmentPhotoAction(treatmentId, formData);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar foto");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteTreatmentPhotoAction(id);
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover foto");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Fotos</h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Enviando…" : "Adicionar foto"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma foto.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <figure key={p.id} className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption ?? "Foto do tratamento"}
                className="aspect-square w-full rounded-md object-cover"
              />
              <figcaption className="space-y-1 text-xs">
                <input
                  defaultValue={p.caption ?? ""}
                  placeholder="Legenda"
                  className="w-full rounded border px-1 py-0.5"
                  onBlur={(e) =>
                    updatePhotoMetaAction(p.id, {
                      caption: e.target.value.trim() || null,
                      takenOn: p.takenOn,
                    })
                  }
                />
                <div className="flex items-center justify-between gap-1">
                  <input
                    type="date"
                    defaultValue={p.takenOn ?? ""}
                    className="rounded border px-1 py-0.5"
                    onBlur={(e) =>
                      updatePhotoMetaAction(p.id, {
                        caption: p.caption,
                        takenOn: e.target.value || null,
                      })
                    }
                  />
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() => handleDelete(p.id)}
                  >
                    remover
                  </button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
```

The caption / date inputs are uncontrolled (`defaultValue` + `onBlur`) so a save fires once when the field loses focus, without re-rendering the grid on every keystroke.

- [ ] **Step 3: Write `treatment-detail-client.tsx`**

Create `src/components/treatments/treatment-detail-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConcludeTreatmentDialog } from "./conclude-treatment-dialog";
import { TreatmentPhotos } from "./treatment-photos";
import { updateTreatmentAction } from "@/app/(app)/pacientes/[id]/actions";
import type { Treatment, TreatmentSession } from "@/modules/treatments/types";

const OUTCOME_LABELS: Record<string, string> = {
  cicatrizacao: "Cicatrização completa",
  alta: "Alta pela profissional",
  abandono: "Abandono do tratamento",
  encaminhamento: "Encaminhamento",
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function TreatmentDetailClient({
  contactId,
  treatment: initialTreatment,
  sessionCount,
  sessions,
  photos,
}: {
  contactId: string;
  treatment: Treatment;
  sessionCount: number;
  sessions: TreatmentSession[];
  photos: { id: string; url: string; caption: string | null; takenOn: string | null }[];
}) {
  const [treatment, setTreatment] = useState(initialTreatment);
  const [woundTypes, setWoundTypes] = useState(treatment.woundTypes);
  const [woundDetails, setWoundDetails] = useState(treatment.woundDetails ?? "");
  const [treatmentType, setTreatmentType] = useState(treatment.treatmentType ?? "");
  const [assessment, setAssessment] = useState(treatment.professionalAssessment ?? "");
  const [perception, setPerception] = useState(treatment.patientPerception ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [concludeOpen, setConcludeOpen] = useState(false);

  const isDone = treatment.status === "concluido";

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTreatmentAction(treatment.id, {
        woundTypes,
        woundDetails: woundDetails.trim() || null,
        treatmentType: treatmentType.trim() || null,
        professionalAssessment: assessment.trim() || null,
        patientPerception: perception.trim() || null,
      });
      setTreatment(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 px-6 pb-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Link href={`/pacientes/${contactId}`} className="underline">
          ← Voltar ao paciente
        </Link>
        <Badge variant={isDone ? "secondary" : "default"}>
          {isDone ? "Concluído" : "Em andamento"}
        </Badge>
        <span>Início: {formatDate(treatment.startedOn)}</span>
        {isDone && treatment.dischargedOn && (
          <span>
            Alta: {formatDate(treatment.dischargedOn)} —{" "}
            {OUTCOME_LABELS[treatment.outcome ?? ""] ?? treatment.outcome}
          </span>
        )}
        <Link
          href={`/pacientes/${contactId}/tratamentos/${treatment.id}/relatorio`}
          className="ml-auto"
        >
          <Button type="button" size="sm">Imprimir relatório</Button>
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="woundTypes">Tipos de ferida</Label>
          <Input id="woundTypes" value={woundTypes} onChange={(e) => setWoundTypes(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="treatmentType">Tipo de tratamento</Label>
          <Input
            id="treatmentType"
            value={treatmentType}
            onChange={(e) => setTreatmentType(e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="woundDetails">Detalhes da ferida</Label>
          <Textarea
            id="woundDetails"
            value={woundDetails}
            onChange={(e) => setWoundDetails(e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="assessment">Avaliação da profissional</Label>
          <Textarea id="assessment" value={assessment} onChange={(e) => setAssessment(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="perception">Percepção do paciente</Label>
          <Textarea id="perception" value={perception} onChange={(e) => setPerception(e.target.value)} />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          {!isDone && (
            <Button type="button" variant="outline" onClick={() => setConcludeOpen(true)}>
              Concluir tratamento
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{sessionCount} sessões realizadas</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sessão concluída vinculada.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {sessions.map((s) => (
              <li key={s.appointmentId} className="flex gap-3 p-2">
                <span className="text-muted-foreground">
                  {new Date(s.date).toLocaleDateString("pt-BR")}
                </span>
                <span className="min-w-0 flex-1 truncate">{s.notes ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TreatmentPhotos treatmentId={treatment.id} initialPhotos={photos} />

      <ConcludeTreatmentDialog
        open={concludeOpen}
        onOpenChange={setConcludeOpen}
        treatmentId={treatment.id}
        onConcluded={setTreatment}
      />
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/app/(app)/pacientes/[id]/tratamentos/[treatmentId]/page.tsx`:

```tsx
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { TreatmentDetailClient } from "@/components/treatments/treatment-detail-client";
import {
  getTreatmentAction,
  listTreatmentPhotosAction,
  listTreatmentSessionsAction,
} from "@/app/(app)/pacientes/[id]/actions";

export default async function TreatmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; treatmentId: string }>;
}) {
  const { id, treatmentId } = await params;
  const treatment = await getTreatmentAction(treatmentId);

  if (!treatment || treatment.contactId !== id) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Tratamento não encontrado.{" "}
          <Link href={`/pacientes/${id}`} className="underline">
            Voltar
          </Link>
        </p>
      </div>
    );
  }

  const [sessionsData, photos] = await Promise.all([
    listTreatmentSessionsAction(treatmentId),
    listTreatmentPhotosAction(treatmentId),
  ]);

  return (
    <div>
      <PageHeader title="Tratamento" description={treatment.woundTypes} />
      <TreatmentDetailClient
        contactId={id}
        treatment={treatment}
        sessionCount={sessionsData.count}
        sessions={sessionsData.sessions}
        photos={photos}
      />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + manual check**

Run: `npx tsc --noEmit` → PASS.
Run: `npm run dev`. Open a treatment. Edit "Detalhes da ferida" + Save → persists on reload. "Adicionar foto" with a phone photo (or any JPEG) → thumbnail appears; "remover" removes it. "Concluir tratamento" → pick "Cicatrização completa", confirm → badge flips to "Concluído", the Concluir button disappears, "Alta: …" line shows.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/pacientes/[id]/tratamentos" src/components/treatments/treatment-detail-client.tsx src/components/treatments/conclude-treatment-dialog.tsx src/components/treatments/treatment-photos.tsx
git commit -m "feat(treatments): treatment detail page (edit, conclude, sessions, photos)"
```

---

## Task 11: `/pacientes/[id]/tratamentos/[treatmentId]/relatorio` — print route

**Files:**
- Create: `src/app/(app)/pacientes/[id]/tratamentos/[treatmentId]/relatorio/page.tsx`
- Create: `src/components/treatments/treatment-report-view.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `getTreatmentReportDataAction` (Task 9) → `TreatmentReport`.
- Produces: the report route + a client `TreatmentReportView` component (print button + "ocultar detalhe das sessões" toggle).

- [ ] **Step 1: Add the `@page` rule to `globals.css`**

In `src/app/globals.css`, after the `@layer base { … }` block at the end of the file, append:

```css
@page {
  margin: 16mm;
}
```

- [ ] **Step 2: Write `treatment-report-view.tsx`**

Create `src/components/treatments/treatment-report-view.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TreatmentReport } from "@/modules/treatments/types";

const OUTCOME_LABELS: Record<string, string> = {
  cicatrizacao: "Cicatrização completa",
  alta: "Alta pela profissional",
  abandono: "Abandono do tratamento",
  encaminhamento: "Encaminhamento",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function calcAge(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const had =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!had) age -= 1;
  return `${age} anos`;
}

export function TreatmentReportView({ report }: { report: TreatmentReport }) {
  const [hideSessionDetail, setHideSessionDetail] = useState(false);
  const { treatment, contact, professional } = report;
  const age = calcAge(contact.birthDate);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 text-sm text-black">
      <div className="flex items-center gap-2 print:hidden">
        <Button type="button" onClick={() => window.print()}>
          Imprimir / Salvar PDF
        </Button>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={hideSessionDetail}
            onChange={(e) => setHideSessionDetail(e.target.checked)}
          />
          Ocultar detalhe das sessões
        </label>
      </div>

      <header className="space-y-1 border-b pb-3">
        <h1 className="text-lg font-bold">{professional.clinicName}</h1>
        {professional.name && (
          <p>
            {professional.name}
            {professional.councilId ? ` — ${professional.councilId}` : ""}
          </p>
        )}
        <p>
          Paciente: <strong>{contact.name}</strong>
          {age ? ` — ${age}` : ""}
          {contact.cpf ? ` — CPF ${contact.cpf}` : ""}
        </p>
        <p className="text-xs text-neutral-600">
          Relatório gerado em {new Date(report.generatedAt).toLocaleString("pt-BR")}
        </p>
      </header>

      <section className="space-y-1">
        <h2 className="font-semibold">Dados do tratamento</h2>
        <p>Tipos de ferida: {treatment.woundTypes}</p>
        <p>Detalhes: {treatment.woundDetails ?? "—"}</p>
        <p>Tipo de tratamento: {treatment.treatmentType ?? "—"}</p>
        <p>Início: {formatDate(treatment.startedOn)}</p>
        <p>
          Fim:{" "}
          {treatment.status === "concluido"
            ? `${formatDate(treatment.dischargedOn)} — ${
                OUTCOME_LABELS[treatment.outcome ?? ""] ?? treatment.outcome
              }`
            : "Em andamento"}
        </p>
        <p>Duração: {report.durationLabel}</p>
        <p>Sessões realizadas: {report.sessionCount}</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold">Avaliação da profissional</h2>
        <p className="whitespace-pre-wrap">{treatment.professionalAssessment ?? "—"}</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold">Percepção do paciente</h2>
        <p className="whitespace-pre-wrap">{treatment.patientPerception ?? "—"}</p>
      </section>

      {!hideSessionDetail && report.sessions.length > 0 && (
        <section className="space-y-1">
          <h2 className="font-semibold">Linha do tempo das sessões</h2>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b">
                <th className="py-1 pr-3">Data</th>
                <th className="py-1">Anotação</th>
              </tr>
            </thead>
            <tbody>
              {report.sessions.map((s) => (
                <tr key={s.appointmentId} className="border-b align-top">
                  <td className="py-1 pr-3 whitespace-nowrap">
                    {new Date(s.date).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-1 whitespace-pre-wrap">{s.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report.photos.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Fotos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {report.photos.map((p, i) => (
              <figure key={i} className="break-inside-avoid space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption ?? "Foto"} className="w-full rounded object-cover" />
                <figcaption className="text-xs text-neutral-600">
                  {p.caption ?? "—"}
                  {p.takenOn ? ` (${formatDate(p.takenOn)})` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t pt-8">
        <p>
          Assinatura: ______________________________
          {professional.name ? `  ${professional.name}` : ""}
          {professional.councilId ? ` — ${professional.councilId}` : ""}
        </p>
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Write the route**

Create `src/app/(app)/pacientes/[id]/tratamentos/[treatmentId]/relatorio/page.tsx`:

```tsx
import Link from "next/link";
import { TreatmentReportView } from "@/components/treatments/treatment-report-view";
import { getTreatmentReportDataAction } from "@/app/(app)/pacientes/[id]/actions";

export default async function TreatmentReportPage({
  params,
}: {
  params: Promise<{ id: string; treatmentId: string }>;
}) {
  const { id, treatmentId } = await params;

  let report;
  try {
    report = await getTreatmentReportDataAction(treatmentId);
  } catch {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Não foi possível gerar o relatório.{" "}
          <Link href={`/pacientes/${id}/tratamentos/${treatmentId}`} className="underline">
            Voltar
          </Link>
        </p>
      </div>
    );
  }

  if (report.treatment.contactId !== id) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Relatório não encontrado.</p>
      </div>
    );
  }

  return <TreatmentReportView report={report} />;
}
```

- [ ] **Step 4: Typecheck + manual print check**

Run: `npx tsc --noEmit` → PASS.
Run: `npm run dev`. From a treatment with ≥1 concluded linked session and ≥1 photo, click "Imprimir relatório". In the report page press "Imprimir / Salvar PDF" (or Ctrl/Cmd+P):
- Sidebar is gone, the print button + checkbox row is gone.
- Header (clinic + professional + patient + timestamp), treatment data, assessment, perception, session timeline, and photo grid are all present and legible.
- Toggling "Ocultar detalhe das sessões" removes the timeline table from the print preview.
- Photos are not split across a page break (`break-inside-avoid`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/pacientes/[id]/tratamentos/[treatmentId]/relatorio" src/components/treatments/treatment-report-view.tsx src/app/globals.css
git commit -m "feat(treatments): print report route"
```

---

## Task 12: Appointment dialog — treatment link + suggestion

**Files:**
- Modify: `src/app/(app)/agenda/actions.ts`
- Create: `src/components/agenda/treatment-link-suggestion-dialog.tsx`
- Modify: `src/components/agenda/appointment-dialog.tsx`

**Interfaces:**
- Consumes: `scheduling.linkAppointmentToTreatment` (Task 5); `treatments.listTreatmentsForContact` (Task 3).
- Produces (server actions in `agenda/actions.ts`):
  - `listTreatmentsForContactAction(contactId) → Treatment[]`
  - `linkAppointmentToTreatmentAction(appointmentId, treatmentId: string | null) → Appointment`

- [ ] **Step 1: Add the agenda actions**

In `src/app/(app)/agenda/actions.ts`:

- Extend the imports: add `createSupabaseTreatmentsRepository` from `@/modules/treatments/repository.supabase`, `* as treatments` from `@/modules/treatments/service`.
- In `getReposAndAccount`, also build `const treatmentsRepo = createSupabaseTreatmentsRepository(supabase);` and return it.
- Append:

```ts
export async function listTreatmentsForContactAction(contactId: string) {
  const { treatmentsRepo, accountId } = await getReposAndAccount();
  return treatments.listTreatmentsForContact(treatmentsRepo, accountId, contactId);
}

export async function linkAppointmentToTreatmentAction(
  appointmentId: string,
  treatmentId: string | null,
) {
  const { schedulingRepo, treatmentsRepo, accountId } = await getReposAndAccount();
  const appointment = await scheduling.linkAppointmentToTreatment(
    schedulingRepo,
    treatmentsRepo,
    accountId,
    appointmentId,
    treatmentId,
  );
  revalidatePath("/agenda");
  return appointment;
}
```

- [ ] **Step 2: Write `treatment-link-suggestion-dialog.tsx`**

Create `src/components/agenda/treatment-link-suggestion-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { linkAppointmentToTreatmentAction } from "@/app/(app)/agenda/actions";
import type { Treatment } from "@/modules/treatments/types";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function TreatmentLinkSuggestionDialog({
  open,
  onOpenChange,
  appointmentId,
  treatment,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  treatment: Treatment;
  onLinked: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await linkAppointmentToTreatmentAction(appointmentId, treatment.id);
      onOpenChange(false);
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao vincular");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular esta sessão ao tratamento em andamento?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-sm text-muted-foreground">
            Tratamento iniciado em {formatDate(treatment.startedOn)} — {treatment.woundTypes}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Agora não
            </Button>
            <Button type="button" className="flex-1" onClick={handleConfirm} disabled={saving}>
              Vincular
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire the dialog into `appointment-dialog.tsx`**

In `src/components/agenda/appointment-dialog.tsx`:

- Add imports:

```ts
import {
  listTreatmentsForContactAction,
  linkAppointmentToTreatmentAction,
} from "@/app/(app)/agenda/actions";
import { TreatmentLinkSuggestionDialog } from "./treatment-link-suggestion-dialog";
import type { Treatment } from "@/modules/treatments/types";
```

- Add state:

```ts
const [treatments, setTreatments] = useState<Treatment[]>([]);
const [treatmentId, setTreatmentId] = useState<string>("__none__");
const [treatmentSuggestionOpen, setTreatmentSuggestionOpen] = useState(false);
```

- In the `useEffect` that runs on `open` with `editingAppointment`, after the existing `setNotes(...)` line, load treatments for the appointment's contact and seed the current link:

```ts
      listTreatmentsForContactAction(editingAppointment.contactId).then(setTreatments);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resync on appointment change
      setTreatmentId(editingAppointment.treatmentId ?? "__none__");
```

- Extend `handleStatusChange` so the treatment-link suggestion can follow the revenue suggestion:

```ts
  async function handleStatusChange(status: AppointmentStatus) {
    if (status !== "concluido" || !editingAppointment) return;
    const existing = await getFinancialEntryByAppointmentAction(editingAppointment.id);
    if (!existing) setRevenueSuggestionOpen(true);

    const active = treatments.filter((t) => t.status === "em_andamento");
    if (!editingAppointment.treatmentId && active.length === 1) {
      setTreatmentSuggestionOpen(true);
    }
  }
```

- In the `editingAppointment && ( … )` JSX block, add a treatment `<Select>` next to the Status field (uses the same `Select` API as the procedure select already in this file — `items` prop + `SelectItem` children):

```tsx
              <div className="space-y-1">
                <Label htmlFor="treatment">Tratamento</Label>
                <Select
                  value={treatmentId}
                  onValueChange={async (value) => {
                    const next = value ?? "__none__";
                    setTreatmentId(next);
                    await linkAppointmentToTreatmentAction(
                      editingAppointment.id,
                      next === "__none__" ? null : next,
                    );
                    onSaved();
                  }}
                  items={[
                    { value: "__none__", label: "— Nenhum —" },
                    ...treatments.map((t) => ({
                      value: t.id,
                      label: `${t.status === "em_andamento" ? "" : "(concluído) "}Início ${t.startedOn} — ${t.woundTypes}`,
                    })),
                  ]}
                >
                  <SelectTrigger id="treatment">
                    <SelectValue placeholder="— Nenhum —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhum —</SelectItem>
                    {[...treatments]
                      .sort((a, b) => (a.status === b.status ? 0 : a.status === "em_andamento" ? -1 : 1))
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {`${t.status === "em_andamento" ? "" : "(concluído) "}Início ${t.startedOn} — ${t.woundTypes}`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
```

- After the closing `</Dialog>` and the existing `RevenueSuggestionDialog` render, add:

```tsx
    {editingAppointment && treatments.filter((t) => t.status === "em_andamento").length === 1 && (
      <TreatmentLinkSuggestionDialog
        open={treatmentSuggestionOpen}
        onOpenChange={setTreatmentSuggestionOpen}
        appointmentId={editingAppointment.id}
        treatment={treatments.filter((t) => t.status === "em_andamento")[0]}
        onLinked={() => {
          setTreatmentId(treatments.filter((t) => t.status === "em_andamento")[0].id);
          onSaved();
        }}
      />
    )}
```

- [ ] **Step 4: Typecheck + manual check**

Run: `npx tsc --noEmit` → PASS.
Run: `npm run dev`. Create a treatment for a patient, open one of that patient's appointments in the Agenda:
- The "Tratamento" select lists "— Nenhum —" + the treatment; picking it persists (reopen the dialog → still selected).
- With exactly one `em_andamento` treatment and the appointment unlinked, setting status to "Concluído" opens "Vincular esta sessão…". Confirming links it; "Agora não" dismisses. (The revenue suggestion may appear in the same flow — both can show in sequence.)
- With the appointment already linked, changing status to "Concluído" does **not** re-open the suggestion.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/agenda/actions.ts" src/components/agenda/appointment-dialog.tsx src/components/agenda/treatment-link-suggestion-dialog.tsx
git commit -m "feat(agenda): link appointment to treatment + link suggestion on conclude"
```

---

## Task 13: Purge Storage objects on patient deletion

**Files:**
- Modify: `src/app/(app)/pacientes/actions.ts`

**Interfaces:**
- Consumes: `createSupabaseTreatmentsRepository` (Task 4).
- Produces: `deletePatientAction` removes every `treatment-photos/{accountId}/…` object for the contact's treatments **before** the cascading row delete.

- [ ] **Step 1: Extend `deletePatientAction`**

In `src/app/(app)/pacientes/actions.ts`:

- Add import: `import { createSupabaseTreatmentsRepository } from "@/modules/treatments/repository.supabase";`
- Replace `deletePatientAction` with:

```ts
export async function deletePatientAction(id: string) {
  const { repo, accountId, supabase } = await getCrmRepoAndAccount();

  const treatmentsRepo = createSupabaseTreatmentsRepository(supabase);
  const treatmentsForContact = await treatmentsRepo.listTreatmentsForContact(accountId, id);
  const paths: string[] = [];
  for (const t of treatmentsForContact) {
    const photos = await treatmentsRepo.listPhotos(accountId, t.id);
    for (const p of photos) paths.push(p.storagePath);
  }
  if (paths.length > 0) {
    await supabase.storage.from("treatment-photos").remove(paths);
  }

  await crm.deleteContact(repo, accountId, id);
  revalidatePath("/pacientes");
}
```

(`getCrmRepoAndAccount` already returns `supabase` — see `src/app/(app)/pacientes/actions.ts:12-17`.)

- [ ] **Step 2: Typecheck + manual check**

Run: `npx tsc --noEmit` → PASS.
Manual: create a patient, a treatment, upload a photo; note the object path in the Supabase Storage browser. Delete the patient from `/pacientes`. The `treatment-photos` object is gone; the `treatments` / `treatment_photos` rows are gone by cascade.

- [ ] **Step 3: Full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/pacientes/actions.ts"
git commit -m "feat(pacientes): purge treatment photos from Storage on patient deletion"
```

---

## Self-Review

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| `treatments` table + migration `0011` | 1 |
| `appointments.treatment_id` (`ON DELETE SET NULL`) | 1, 5 |
| `treatment_photos` table | 1 |
| Private `treatment-photos` bucket + object RLS + signed URLs | 1, 9 |
| `accounts.professional_name` / `professional_council_id` | 1, 7 |
| RLS on new tables | 1 |
| `treatments` module (types/repository/repository.supabase/repository.memory/service/schemas + tests) | 2, 3, 4 |
| Derived session count + duration (never stored) | 3 (`assembleReport`/`formatDurationLabel`), 5 (count/list) |
| `concludeTreatment` rejects second conclusion; outcome+dischargedOn required | 2, 3 |
| `scheduling` changes: `treatmentId`, `updateAppointmentTreatment`, `countConcludedAppointmentsByTreatment`, `listConcludedAppointmentsByTreatment`, `linkAppointmentToTreatment` (same account+contact) | 5 |
| `crm.getContact` (needed by detail page + report) | 6 |
| `/configuracoes` page (identity fields + storage indicator) + sidebar item | 7 |
| `getAccountProfessionalIdentity` helper | 7 |
| Client photo pipeline (`prepareTreatmentPhoto`, HEIC→JPEG, iterative, reject >400 KB, reject non-image / >25 MB) | 8 |
| Server-side re-validation of the uploaded Blob (type + size) | 9 (`uploadTreatmentPhotoAction`) |
| `/pacientes/[id]` detail page (patient data + "Editar dados" reusing `PatientFormDialog` + treatments list + "Novo tratamento") | 9 |
| Patient list row navigates to detail page | 9 |
| `/pacientes/[id]/tratamentos/[treatmentId]` (edit fields, conclude, sessions read-only, photos grid w/ caption+date+remove) | 10 |
| `/pacientes/[id]/tratamentos/[treatmentId]/relatorio` print route (header, treatment data, assessment, perception, session timeline w/ "ocultar detalhe" toggle, photo grid `break-inside`, signature footer) | 11 |
| `@page` margin in `globals.css`; `print:hidden` controls; sidebar already `print:hidden` | 11 |
| Appointment dialog `<Select>` "Tratamento" (active first, "— Nenhum —") + `TreatmentLinkSuggestionDialog` on conclude when exactly 1 active treatment and unlinked | 12 |
| `listTreatmentsForContactAction`, `linkAppointmentToTreatmentAction` | 12 |
| Edge: delete treatment with linked sessions → sessions unlinked, appointment history kept | 1 (`ON DELETE SET NULL`), 9 (`deleteTreatmentAction` also clears Storage) |
| Edge: delete patient → cascade rows, but Storage objects removed explicitly | 13 |
| Edge: treatment with 0 concluded sessions / still open → report still valid, duration to today | 3 (`assembleReport` test covers open treatment) |
| Edge: conclude an already-concluded treatment → rejected | 2, 3 |
| Edge: suggestion with multiple active treatments → no auto-suggest | 12 (`active.length === 1` guard) |
| Edge: expired signed URL → reload regenerates | 11 (route re-fetches on each request) |
| Test decisions (Vitest): `treatments/service.test.ts`, `scheduling` repo+service, photo pure gate | 3, 5, 8 |

**Deviations from the spec, deliberate:**
- `TreatmentReport` gains a derived `durationLabel: string` field (spec described duration as "só exibição no relatório" without naming the field). Computed in `assembleReport`, covered by tests.
- `assembleReport` signature is `assembleReport(input: AssembleReportInput)` — a pure compose over pre-fetched parts (matches the spec's amended text "recebe as partes já buscadas pela server action"). The fetching lives in `getTreatmentReportDataAction` (Task 9).
- `updatePhotoMeta` was added to `TreatmentsRepository` (spec's server-action list has `updatePhotoMetaAction` but the repo interface omitted the method it needs).
- Migration `0011` adds an `accounts` UPDATE RLS policy — required for `updateProfessionalIdentityAction` to write, since `accounts` had SELECT-only RLS.
- Appointment-dialog "— Nenhum —" uses the sentinel string `"__none__"` because the Base UI `Select` value is a string, not nullable.

**2. Placeholder scan**

No `TODO` / `TBD` / "implement later" / "add error handling" left. Every code step is a complete file or a precisely-located edit with the literal code. Task 10 Step 2 contains a self-correcting note ("**Correction:**") that then supplies the real inline-editor code — the final state is unambiguous; an executor applies the corrected version. Every referenced symbol (`assembleReport`, `formatDurationLabel`, `getContact`, `getAccountProfessionalIdentity`, `linkAppointmentToTreatment`, `countConcludedAppointmentsByTreatment`, `listConcludedAppointmentsByTreatment`, `prepareTreatmentPhoto`, `MAX_OUTPUT_BYTES`, `createSupabaseTreatmentsRepository`) is defined in an earlier task's Produces block.

**3. Type consistency**

- `Treatment`, `TreatmentPhoto`, `TreatmentSession`, `TreatmentReport`, `AssembleReportInput` defined once (Task 2 `types.ts`), imported everywhere else.
- Repo method names identical across interface (Task 2), memory (Task 2), Supabase (Task 4): `insertTreatment`, `updateTreatment`, `concludeTreatment`, `getTreatment`, `listTreatmentsForContact`, `deleteTreatment`, `insertPhoto`, `listPhotos`, `getPhoto`, `updatePhotoMeta`, `deletePhoto`, `sumPhotoBytes`.
- Scheduling additions named identically in interface/memory/supabase (Task 5): `updateAppointmentTreatment`, `countConcludedAppointmentsByTreatment`, `listConcludedAppointmentsByTreatment`; `Appointment.treatmentId`; `insertAppointment` input `treatmentId?`.
- Action names in Task 9 match their consumers in Tasks 10–11 (`getTreatmentAction`, `listTreatmentSessionsAction`, `listTreatmentPhotosAction`, `getTreatmentReportDataAction`, `updatePhotoMetaAction`, `deleteTreatmentPhotoAction`, `uploadTreatmentPhotoAction`, `concludeTreatmentAction`, `updateTreatmentAction`).
- `getAccountProfessionalIdentity` returns `{ name, professionalName, councilId }` (Task 7) and is destructured with those exact keys in Task 9's `getTreatmentReportDataAction`.
- Signed-URL TTL `3600` used consistently (Tasks 9, spec "~1 h").

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-28-tratamento-relatorio-clinico.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
