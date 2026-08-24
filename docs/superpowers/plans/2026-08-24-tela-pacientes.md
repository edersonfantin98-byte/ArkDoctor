# Tela de Pacientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated `/pacientes` screen for patient registration/listing (extending the existing `Contact` entity with clinical fields) plus a select-and-send bulk WhatsApp messaging flow.

**Architecture:** Extends the existing `modules/crm` domain (no new entity) with 6 new nullable `Contact` fields and a `listContacts` repository method. Adds a `sendBulkMessages` function to `modules/whatsapp/service.ts` that reuses the existing `WhatsappProvider.sendMessage` and conversation-logging plumbing, sequentially, with a randomized delay between sends. New route `/pacientes` with its own server actions file that composes both modules. Follows the exact repository-pattern (interface + in-memory + Supabase) and server-action conventions already established by `modules/crm` and `app/(app)/pipeline`.

**Tech Stack:** Next.js Server Actions, Zod, Supabase (Postgres + RLS), Vitest, `@base-ui/react` UI primitives already in `src/components/ui`.

**Spec:** `docs/superpowers/specs/2026-08-24-tela-pacientes-design.md`

## Global Constraints

- No new entity — patient data lives on the existing `contacts` table/`Contact` type (per spec's confirmed decision).
- All 6 new fields are nullable/optional everywhere (type, schema, DB column) — must not break the existing Pipeline flow, which never sets them.
- CPF and e-mail have no server-side format validation (explicitly out of scope per spec).
- Bulk send: sequential (not parallel), random 5–10s delay between sends (not fixed), a single failed send must not abort the rest of the batch.
- Reuse existing server action patterns exactly: `"use server"` file per route, a local `getRepoAndAccount()` helper, `revalidatePath` after mutations.
- Follow existing code style: no comments unless explaining a non-obvious constraint, no UI abstractions beyond what's already in `src/components/ui` (e.g. no new generic `Table`/`Checkbox` component — plain HTML elements with Tailwind, matching `ProceduresClient`'s existing style).

---

### Task 1: Extend `Contact` type + repository interface + in-memory repository

**Files:**
- Modify: `src/modules/crm/types.ts`
- Modify: `src/modules/crm/repository.ts`
- Modify: `src/modules/crm/repository.memory.ts`
- Test: `src/modules/crm/repository.memory.test.ts`

**Interfaces:**
- Produces: `Contact` gains `email: string | null`, `birthDate: string | null`, `cpf: string | null`, `sex: "M" | "F" | null`, `guardianName: string | null`, `guardianPhone: string | null`, `guardianRelationship: string | null`.
- Produces: `CrmRepository.listContacts(accountId: string): Promise<Contact[]>`.
- Produces: `CrmRepository.insertContact`/`updateContact` accept the 6 new fields (all optional in insert, optional-nullable in update — same shape as the existing `origin`/`notes` fields).

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/crm/repository.memory.test.ts` (append inside the existing `describe("createInMemoryCrmRepository", ...)` block, after the existing `"inserts and retrieves a contact scoped to its account"` test):

```ts
  it("persists the new patient fields on insert and defaults them to null when omitted", async () => {
    const repo = createInMemoryCrmRepository();

    const withFields = await repo.insertContact("acc-1", {
      name: "Ana",
      phone: "11999990000",
      email: "ana@example.com",
      birthDate: "1990-05-10",
      cpf: "12345678900",
      sex: "F",
      guardianName: "Maria",
      guardianPhone: "11988887777",
      guardianRelationship: "mãe",
    });
    expect(withFields.email).toBe("ana@example.com");
    expect(withFields.birthDate).toBe("1990-05-10");
    expect(withFields.cpf).toBe("12345678900");
    expect(withFields.sex).toBe("F");
    expect(withFields.guardianName).toBe("Maria");
    expect(withFields.guardianPhone).toBe("11988887777");
    expect(withFields.guardianRelationship).toBe("mãe");

    const withoutFields = await repo.insertContact("acc-1", { name: "Beatriz", phone: "11988887777" });
    expect(withoutFields.email).toBeNull();
    expect(withoutFields.birthDate).toBeNull();
    expect(withoutFields.cpf).toBeNull();
    expect(withoutFields.sex).toBeNull();
    expect(withoutFields.guardianName).toBeNull();
    expect(withoutFields.guardianPhone).toBeNull();
    expect(withoutFields.guardianRelationship).toBeNull();
  });

  it("updates the new patient fields, including clearing them with null", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await repo.insertContact("acc-1", {
      name: "Ana",
      phone: "11999990000",
      email: "ana@example.com",
    });

    const updated = await repo.updateContact("acc-1", contact.id, {
      email: "nova@example.com",
      sex: "F",
    });
    expect(updated.email).toBe("nova@example.com");
    expect(updated.sex).toBe("F");

    const cleared = await repo.updateContact("acc-1", contact.id, { email: null });
    expect(cleared.email).toBeNull();
  });

  it("listContacts returns all contacts for the account, sorted by name", async () => {
    const repo = createInMemoryCrmRepository();
    await repo.insertContact("acc-1", { name: "Carla", phone: "11977776666" });
    await repo.insertContact("acc-1", { name: "Ana", phone: "11999990000" });
    await repo.insertContact("acc-2", { name: "Zeca", phone: "11955554444" });

    const result = await repo.listContacts("acc-1");
    expect(result.map((c) => c.name)).toEqual(["Ana", "Carla"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/modules/crm/repository.memory.test.ts`
Expected: FAIL — `listContacts` is not a function, and the new fields are `undefined` instead of the expected values (property doesn't exist on `insertContact`'s return type / implementation ignores it).

- [ ] **Step 3: Extend the `Contact` type**

In `src/modules/crm/types.ts`, replace the `Contact` interface:

```ts
export interface Contact {
  id: string;
  accountId: string;
  name: string;
  phone: string;
  origin: string | null;
  notes: string | null;
  email: string | null;
  birthDate: string | null;
  cpf: string | null;
  sex: "M" | "F" | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianRelationship: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 4: Extend the repository interface**

In `src/modules/crm/repository.ts`, replace the `insertContact`/`updateContact` signatures and add `listContacts`:

```ts
  insertContact(
    accountId: string,
    input: {
      name: string;
      phone: string;
      origin?: string;
      notes?: string;
      email?: string;
      birthDate?: string;
      cpf?: string;
      sex?: "M" | "F";
      guardianName?: string;
      guardianPhone?: string;
      guardianRelationship?: string;
    },
  ): Promise<Contact>;
  updateContact(
    accountId: string,
    contactId: string,
    input: {
      name?: string;
      phone?: string;
      origin?: string | null;
      notes?: string | null;
      email?: string | null;
      birthDate?: string | null;
      cpf?: string | null;
      sex?: "M" | "F" | null;
      guardianName?: string | null;
      guardianPhone?: string | null;
      guardianRelationship?: string | null;
    },
  ): Promise<Contact>;
  listContacts(accountId: string): Promise<Contact[]>;
```

(Insert these in place of the current `insertContact`/`updateContact` lines; keep `searchContacts`, `findContactByPhone`, `deleteContact`, `countNewContacts` unchanged, `listContacts` goes right after `countNewContacts`.)

- [ ] **Step 5: Implement in the in-memory repository**

In `src/modules/crm/repository.memory.ts`, replace the `insertContact` implementation:

```ts
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
        email: input.email ?? null,
        birthDate: input.birthDate ?? null,
        cpf: input.cpf ?? null,
        sex: input.sex ?? null,
        guardianName: input.guardianName ?? null,
        guardianPhone: input.guardianPhone ?? null,
        guardianRelationship: input.guardianRelationship ?? null,
        createdAt: now,
        updatedAt: now,
      };
      contacts.set(id, contact);
      return contact;
    },
```

Replace `updateContact`:

```ts
    async updateContact(accountId, contactId, input) {
      const contact = contacts.get(contactId);
      if (!contact || contact.accountId !== accountId) throw new Error("Contact not found");
      const updated: Contact = {
        ...contact,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.origin !== undefined ? { origin: input.origin } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
        ...(input.cpf !== undefined ? { cpf: input.cpf } : {}),
        ...(input.sex !== undefined ? { sex: input.sex } : {}),
        ...(input.guardianName !== undefined ? { guardianName: input.guardianName } : {}),
        ...(input.guardianPhone !== undefined ? { guardianPhone: input.guardianPhone } : {}),
        ...(input.guardianRelationship !== undefined
          ? { guardianRelationship: input.guardianRelationship }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      contacts.set(contactId, updated);
      return updated;
    },
```

Add `listContacts`, right after `countNewContacts`'s implementation:

```ts
    async listContacts(accountId) {
      return [...contacts.values()]
        .filter((c) => c.accountId === accountId)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/modules/crm/repository.memory.test.ts`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 7: Commit**

```bash
git add src/modules/crm/types.ts src/modules/crm/repository.ts src/modules/crm/repository.memory.ts src/modules/crm/repository.memory.test.ts
git commit -m "feat(crm): extend Contact with patient fields and add listContacts"
```

---

### Task 2: Extend Zod schemas and `createContact`/`updateContact` service functions

**Files:**
- Modify: `src/modules/crm/schemas.ts`
- Test: `src/modules/crm/service.test.ts`

**Interfaces:**
- Consumes: `Contact`, `CrmRepository` from Task 1.
- Produces: `createContactInputSchema`/`updateContactInputSchema` accept the 6 new fields; `CreateContactInput`/`UpdateContactInput` types update accordingly. `createContact`/`updateContact` in `service.ts` need no code changes (they already just `.parse(rawInput)` and pass through to the repo) but are covered by new tests here to lock in the validation behavior.

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/crm/service.test.ts`, inside the existing `describe("createContact", ...)` block:

```ts
  it("accepts the optional patient fields and passes them through to the repository", async () => {
    const repo = createInMemoryCrmRepository();

    const contact = await createContact(repo, "acc-1", {
      name: "Ana",
      phone: "11999990000",
      email: "ana@example.com",
      birthDate: "1990-05-10",
      cpf: "12345678900",
      sex: "F",
      guardianName: "Maria",
      guardianPhone: "11988887777",
      guardianRelationship: "mãe",
    });

    expect(contact.email).toBe("ana@example.com");
    expect(contact.sex).toBe("F");
    expect(contact.guardianRelationship).toBe("mãe");
  });

  it("rejects an invalid sex value", async () => {
    const repo = createInMemoryCrmRepository();
    await expect(
      createContact(repo, "acc-1", { name: "Ana", phone: "11999990000", sex: "X" }),
    ).rejects.toThrow();
  });
```

Add a new `describe` block at the end of the file for update:

```ts
describe("updateContact patient fields", () => {
  it("updates and clears patient fields via null", async () => {
    const repo = createInMemoryCrmRepository();
    const contact = await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    const updated = await updateContact(repo, "acc-1", contact.id, { cpf: "12345678900" });
    expect(updated.cpf).toBe("12345678900");

    const cleared = await updateContact(repo, "acc-1", contact.id, { cpf: null });
    expect(cleared.cpf).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/modules/crm/service.test.ts`
Expected: FAIL — Zod strips the unknown keys (`email`, `sex`, etc. come back as `undefined`) since the schema doesn't declare them yet, so `contact.email` is `undefined` instead of `"ana@example.com"`; the invalid-`sex` test fails because nothing rejects it.

- [ ] **Step 3: Extend the schemas**

Replace the full contents of `src/modules/crm/schemas.ts`:

```ts
import { z } from "zod";

export const createContactInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(200),
  phone: z.string().trim().min(8, "Telefone inválido").max(30),
  origin: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().min(1).max(5000).optional(),
  email: z.string().trim().email("E-mail inválido").max(200).optional(),
  birthDate: z.string().trim().min(1).max(30).optional(),
  cpf: z.string().trim().min(1).max(20).optional(),
  sex: z.enum(["M", "F"]).optional(),
  guardianName: z.string().trim().min(1).max(200).optional(),
  guardianPhone: z.string().trim().min(1).max(30).optional(),
  guardianRelationship: z.string().trim().min(1).max(100).optional(),
});

export type CreateContactInput = z.infer<typeof createContactInputSchema>;

export const updateContactInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(8).max(30).optional(),
  origin: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  email: z.string().trim().email("E-mail inválido").max(200).nullable().optional(),
  birthDate: z.string().trim().max(30).nullable().optional(),
  cpf: z.string().trim().max(20).nullable().optional(),
  sex: z.enum(["M", "F"]).nullable().optional(),
  guardianName: z.string().trim().max(200).nullable().optional(),
  guardianPhone: z.string().trim().max(30).nullable().optional(),
  guardianRelationship: z.string().trim().max(100).nullable().optional(),
});

export type UpdateContactInput = z.infer<typeof updateContactInputSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/modules/crm/service.test.ts`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm run test`
Expected: PASS — no other module depended on the old `Contact`/schema shape in a way that breaks (TypeScript would catch shape mismatches at build time too, checked in Task 3's final step).

- [ ] **Step 6: Commit**

```bash
git add src/modules/crm/schemas.ts src/modules/crm/service.test.ts
git commit -m "feat(crm): validate patient fields in contact create/update schemas"
```

---

### Task 3: Supabase migration + Supabase repository implementation

**Files:**
- Create: `supabase/migrations/0010_contacts_patient_fields.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated, not hand-edited)
- Modify: `src/modules/crm/repository.supabase.ts`

**Interfaces:**
- Consumes: `CrmRepository` interface from Task 1 (must implement `listContacts` and the extended `insertContact`/`updateContact`).
- Produces: `createSupabaseCrmRepository` fully implements the Task 1 interface against the real `contacts` table.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_contacts_patient_fields.sql`:

```sql
alter table contacts
  add column email text,
  add column birth_date date,
  add column cpf text,
  add column sex text check (sex in ('M', 'F')),
  add column guardian_name text,
  add column guardian_phone text,
  add column guardian_relationship text;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`
Expected: CLI reports the migration applied with no errors; `contacts` now has the 7 new nullable columns.

(If not yet linked to the project, run `npx supabase link --project-ref nrfpjqrirmqktnnfqqex` first — project ref from the ArkDoctor Supabase project memory.)

- [ ] **Step 3: Regenerate types**

Run: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
Expected: `contacts.Row`/`Insert`/`Update` in `src/lib/supabase/database.types.ts` now include `email`, `birth_date`, `cpf`, `sex`, `guardian_name`, `guardian_phone`, `guardian_relationship` (all nullable/optional).

- [ ] **Step 4: Update the Supabase repository's `toContact` mapper**

In `src/modules/crm/repository.supabase.ts`, replace `toContact`:

```ts
function toContact(row: Database["public"]["Tables"]["contacts"]["Row"]): Contact {
  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    phone: row.phone,
    origin: row.origin,
    notes: row.notes,
    email: row.email,
    birthDate: row.birth_date,
    cpf: row.cpf,
    sex: row.sex as Contact["sex"],
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
    guardianRelationship: row.guardian_relationship,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 5: Update `insertContact`**

Replace the `insertContact` implementation:

```ts
    async insertContact(accountId, input) {
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          account_id: accountId,
          name: input.name,
          phone: input.phone,
          origin: input.origin ?? null,
          notes: input.notes ?? null,
          email: input.email ?? null,
          birth_date: input.birthDate ?? null,
          cpf: input.cpf ?? null,
          sex: input.sex ?? null,
          guardian_name: input.guardianName ?? null,
          guardian_phone: input.guardianPhone ?? null,
          guardian_relationship: input.guardianRelationship ?? null,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toContact(data);
    },
```

- [ ] **Step 6: Update `updateContact`**

Replace the `updateContact` implementation:

```ts
    async updateContact(accountId, contactId, input) {
      const { data, error } = await supabase
        .from("contacts")
        .update({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.origin !== undefined ? { origin: input.origin } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.birthDate !== undefined ? { birth_date: input.birthDate } : {}),
          ...(input.cpf !== undefined ? { cpf: input.cpf } : {}),
          ...(input.sex !== undefined ? { sex: input.sex } : {}),
          ...(input.guardianName !== undefined ? { guardian_name: input.guardianName } : {}),
          ...(input.guardianPhone !== undefined ? { guardian_phone: input.guardianPhone } : {}),
          ...(input.guardianRelationship !== undefined
            ? { guardian_relationship: input.guardianRelationship }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", accountId)
        .eq("id", contactId)
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toContact(data);
    },
```

- [ ] **Step 7: Add `listContacts`**

Add, right after `countNewContacts`'s implementation:

```ts
    async listContacts(accountId) {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("account_id", accountId)
        .order("name", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toContact);
    },
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. This is the real verification for this task, since `repository.supabase.ts` has no dedicated unit tests (matches the existing codebase convention — Supabase repositories are verified by type-checking against `database.types.ts` plus manual testing, not mocked DB tests).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0010_contacts_patient_fields.sql src/lib/supabase/database.types.ts src/modules/crm/repository.supabase.ts
git commit -m "feat(crm): add patient fields migration and Supabase repository support"
```

---

### Task 4: Bulk WhatsApp messaging in `modules/whatsapp/service.ts`

**Files:**
- Modify: `src/modules/whatsapp/service.ts`
- Test: `src/modules/whatsapp/service.test.ts`

**Interfaces:**
- Consumes: `WhatsappRepository` (`getConversationByPhone`, `insertConversation`, `linkConversationContact`, `insertMessage`, `touchConversation`) and `WhatsappProvider.sendMessage` — both already defined in `repository.ts`/`provider.ts`.
- Produces:
  - `personalizeMessage(template: string, contactName: string): string`
  - `sendBulkMessages(whatsappRepo: WhatsappRepository, provider: WhatsappProvider, accountId: string, contacts: { id: string; name: string; phone: string }[], messageTemplate: string, wait?: (ms: number) => Promise<void>, randomDelayMs?: () => number): Promise<{ sent: string[]; failed: { contactId: string; error: string }[] }>`
  - Later tasks (Task 5) call `sendBulkMessages` with its default `wait`/`randomDelayMs`.

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/whatsapp/service.test.ts` (new `describe` block at the end of the file):

```ts
describe("personalizeMessage", () => {
  it("replaces {{nome}} with the contact's name", () => {
    expect(personalizeMessage("Olá {{nome}}, tudo bem?", "Ana")).toBe("Olá Ana, tudo bem?");
  });

  it("leaves the message unchanged when there's no placeholder", () => {
    expect(personalizeMessage("Mensagem fixa", "Ana")).toBe("Mensagem fixa");
  });

  it("replaces every occurrence of the placeholder", () => {
    expect(personalizeMessage("{{nome}}, oi {{nome}}", "Ana")).toBe("Ana, oi Ana");
  });
});

describe("sendBulkMessages", () => {
  const noWait = async () => {};
  const noDelay = () => 0;

  it("sends a personalized message to every contact and logs it as an outbound message", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    const sendSpy = vi.spyOn(provider, "sendMessage");

    const result = await sendBulkMessages(
      repo,
      provider,
      "acc-1",
      [
        { id: "contact-1", name: "Ana", phone: "11999990000" },
        { id: "contact-2", name: "Beatriz", phone: "11988887777" },
      ],
      "Olá {{nome}}!",
      noWait,
      noDelay,
    );

    expect(result.sent).toEqual(["contact-1", "contact-2"]);
    expect(result.failed).toEqual([]);
    expect(sendSpy).toHaveBeenNthCalledWith(1, "acc-1", "11999990000", "Olá Ana!");
    expect(sendSpy).toHaveBeenNthCalledWith(2, "acc-1", "11988887777", "Olá Beatriz!");

    const conversation = await repo.getConversationByPhone("acc-1", "11999990000");
    expect(conversation).not.toBeNull();
    const messages = await repo.listMessages("acc-1", conversation!.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe("Olá Ana!");
    expect(messages[0].direction).toBe("outbound");
  });

  it("reuses an existing conversation instead of creating a duplicate", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    const existing = await repo.insertConversation("acc-1", {
      contactId: "contact-1",
      contactName: "Ana",
      contactPhone: "11999990000",
    });

    await sendBulkMessages(
      repo,
      provider,
      "acc-1",
      [{ id: "contact-1", name: "Ana", phone: "11999990000" }],
      "Oi {{nome}}",
      noWait,
      noDelay,
    );

    const conversations = await repo.listConversations("acc-1");
    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe(existing.id);
  });

  it("continues sending to the remaining contacts when one send fails", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    vi.spyOn(provider, "sendMessage").mockImplementation(async (_accountId, toPhone) => {
      if (toPhone === "11988887777") throw new Error("Falha no provedor");
      return { providerMessageId: "msg-1" };
    });

    const result = await sendBulkMessages(
      repo,
      provider,
      "acc-1",
      [
        { id: "contact-1", name: "Ana", phone: "11999990000" },
        { id: "contact-2", name: "Beatriz", phone: "11988887777" },
        { id: "contact-3", name: "Carla", phone: "11977776666" },
      ],
      "Oi {{nome}}",
      noWait,
      noDelay,
    );

    expect(result.sent).toEqual(["contact-1", "contact-3"]);
    expect(result.failed).toEqual([{ contactId: "contact-2", error: "Falha no provedor" }]);
  });

  it("waits between sends but not after the last one", async () => {
    const repo = createInMemoryWhatsappRepository();
    const provider = createFakeWhatsappProvider(repo);
    const waitSpy = vi.fn(async () => {});

    await sendBulkMessages(
      repo,
      provider,
      "acc-1",
      [
        { id: "contact-1", name: "Ana", phone: "11999990000" },
        { id: "contact-2", name: "Beatriz", phone: "11988887777" },
      ],
      "Oi {{nome}}",
      waitSpy,
      () => 7000,
    );

    expect(waitSpy).toHaveBeenCalledTimes(1);
    expect(waitSpy).toHaveBeenCalledWith(7000);
  });
});
```

Add the new imports at the top of the file (extend the existing `import { ... } from "./service"` line with `personalizeMessage, sendBulkMessages`, and add `vi` to the existing `vitest` import if not already present — it already is, per the file's first line).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/modules/whatsapp/service.test.ts`
Expected: FAIL — `personalizeMessage`/`sendBulkMessages` are not exported from `./service`.

- [ ] **Step 3: Implement `personalizeMessage` and `sendBulkMessages`**

Add to `src/modules/whatsapp/service.ts`, after `handleInboundMessage`:

```ts
export function personalizeMessage(template: string, contactName: string): string {
  return template.replaceAll("{{nome}}", contactName);
}

function randomBulkSendDelayMs(): number {
  return 5000 + Math.random() * 5000;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendBulkMessages(
  whatsappRepo: WhatsappRepository,
  provider: WhatsappProvider,
  accountId: string,
  contacts: { id: string; name: string; phone: string }[],
  messageTemplate: string,
  wait: (ms: number) => Promise<void> = waitMs,
  randomDelayMs: () => number = randomBulkSendDelayMs,
): Promise<{ sent: string[]; failed: { contactId: string; error: string }[] }> {
  const sent: string[] = [];
  const failed: { contactId: string; error: string }[] = [];

  for (let i = 0; i < contacts.length; i += 1) {
    const contact = contacts[i];
    try {
      const body = personalizeMessage(messageTemplate, contact.name);

      let conversation = await whatsappRepo.getConversationByPhone(accountId, contact.phone);
      if (!conversation) {
        conversation = await whatsappRepo.insertConversation(accountId, {
          contactId: contact.id,
          contactName: contact.name,
          contactPhone: contact.phone,
        });
      } else if (conversation.contactId === null) {
        await whatsappRepo.linkConversationContact(accountId, conversation.id, contact.id);
      }

      await provider.sendMessage(accountId, contact.phone, body);
      const message = await whatsappRepo.insertMessage(accountId, conversation.id, {
        direction: "outbound",
        body,
      });
      await whatsappRepo.touchConversation(accountId, conversation.id, body, message.sentAt);

      sent.push(contact.id);
    } catch (err) {
      failed.push({
        contactId: contact.id,
        error: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }

    if (i < contacts.length - 1) {
      await wait(randomDelayMs());
    }
  }

  return { sent, failed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/modules/whatsapp/service.test.ts`
Expected: PASS (all tests, including the 7 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/modules/whatsapp/service.ts src/modules/whatsapp/service.test.ts
git commit -m "feat(whatsapp): add sendBulkMessages with randomized send interval"
```

---

### Task 5: Server actions for `/pacientes`

**Files:**
- Create: `src/app/(app)/pacientes/actions.ts`

**Interfaces:**
- Consumes: `crm.createContact`/`updateContact`/`deleteContact`/`searchContacts`/`listContacts` (Tasks 1–2), `whatsapp.sendBulkMessages` (Task 4), `createSupabaseCrmRepository`, `createSupabaseWhatsappRepository`, `getWhatsappProvider`, `getCurrentAccountId`, `createServerSupabaseClient` — all pre-existing.
- Produces: `listPatientsAction()`, `searchPatientsAction(query: string)`, `createPatientAction(input: unknown)`, `updatePatientAction(id: string, input: unknown)`, `deletePatientAction(id: string)`, `sendBulkMessageAction(input: { contactIds: string[]; message: string })` — consumed by Task 9's UI.

- [ ] **Step 1: Implement the actions file**

Create `src/app/(app)/pacientes/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import { createSupabaseWhatsappRepository } from "@/modules/whatsapp/repository.supabase";
import { getWhatsappProvider } from "@/modules/whatsapp/provider";
import * as crm from "@/modules/crm/service";
import { sendBulkMessages } from "@/modules/whatsapp/service";

async function getCrmRepoAndAccount() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const repo = createSupabaseCrmRepository(supabase);
  return { repo, accountId, supabase };
}

export async function listPatientsAction() {
  const { repo, accountId } = await getCrmRepoAndAccount();
  return repo.listContacts(accountId);
}

export async function searchPatientsAction(query: string) {
  const { repo, accountId } = await getCrmRepoAndAccount();
  return crm.searchContacts(repo, accountId, query);
}

export async function createPatientAction(input: unknown) {
  const { repo, accountId } = await getCrmRepoAndAccount();
  const contact = await crm.createContact(repo, accountId, input);
  revalidatePath("/pacientes");
  return contact;
}

export async function updatePatientAction(id: string, input: unknown) {
  const { repo, accountId } = await getCrmRepoAndAccount();
  const contact = await crm.updateContact(repo, accountId, id, input);
  revalidatePath("/pacientes");
  return contact;
}

export async function deletePatientAction(id: string) {
  const { repo, accountId } = await getCrmRepoAndAccount();
  await crm.deleteContact(repo, accountId, id);
  revalidatePath("/pacientes");
}

export async function sendBulkMessageAction(input: { contactIds: string[]; message: string }) {
  const { repo: crmRepo, accountId, supabase } = await getCrmRepoAndAccount();
  const allContacts = await crmRepo.listContacts(accountId);
  const targets = allContacts.filter((c) => input.contactIds.includes(c.id));

  const whatsappRepo = createSupabaseWhatsappRepository(supabase);
  const connection = await whatsappRepo.getConnection(accountId);
  const provider = getWhatsappProvider(connection?.provider ?? "fake", whatsappRepo);

  const result = await sendBulkMessages(
    whatsappRepo,
    provider,
    accountId,
    targets.map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
    input.message,
  );

  revalidatePath("/pacientes");
  return result;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. No dedicated test file here, matching the existing codebase convention that `app/(app)/**/actions.ts` files (thin composition wrappers) aren't unit-tested — the logic they call is already covered in Tasks 1–4.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/pacientes/actions.ts"
git commit -m "feat(pacientes): add server actions for patient CRUD and bulk messaging"
```

---

### Task 6: "Pacientes" sidebar navigation item

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: a working nav link to `/pacientes` (route created in Task 9).

- [ ] **Step 1: Add the nav entry**

In `src/components/layout/sidebar.tsx`, add `Users` to the `lucide-react` import list (alongside `LayoutDashboard`, `Filter`, etc.), then add a new entry to `generalModules` right after `"Pipeline"`:

```ts
  { label: "Pacientes", href: "/pacientes", icon: Users, enabled: true },
```

- [ ] **Step 2: Manually verify**

Run: `npm run dev` (skip if already running), open the app in a browser, confirm "Pacientes" appears in the sidebar between "Pipeline" and "Agenda" and is clickable (will 404 until Task 9 adds the route — that's expected at this point).

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat(pacientes): add sidebar navigation entry"
```

---

### Task 7: `PatientFormDialog` component

**Files:**
- Create: `src/components/patients/patient-form-dialog.tsx`

**Interfaces:**
- Consumes: `createPatientAction`, `updatePatientAction` (Task 5); `Contact` type (Task 1); `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`, `Input`, `Label`, `Textarea`, `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue`, `Button` (all pre-existing in `src/components/ui`).
- Produces: `PatientFormDialog({ open, onOpenChange, editingPatient, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; editingPatient: Contact | null; onSaved: (patient: Contact) => void })` — consumed by Task 9.

- [ ] **Step 1: Implement the component**

Create `src/components/patients/patient-form-dialog.tsx`:

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPatientAction, updatePatientAction } from "@/app/(app)/pacientes/actions";
import type { Contact } from "@/modules/crm/types";

const SEX_OPTIONS = [
  { value: "M", label: "Masculino" },
  { value: "F", label: "Feminino" },
];

export function PatientFormDialog({
  open,
  onOpenChange,
  editingPatient,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPatient: Contact | null;
  onSaved: (patient: Contact) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [cpf, setCpf] = useState("");
  const [sex, setSex] = useState<string>("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs the form when a different patient is opened in this persistent dialog
    setName(editingPatient?.name ?? "");
    setPhone(editingPatient?.phone ?? "");
    setEmail(editingPatient?.email ?? "");
    setBirthDate(editingPatient?.birthDate ?? "");
    setCpf(editingPatient?.cpf ?? "");
    setSex(editingPatient?.sex ?? "");
    setGuardianName(editingPatient?.guardianName ?? "");
    setGuardianPhone(editingPatient?.guardianPhone ?? "");
    setGuardianRelationship(editingPatient?.guardianRelationship ?? "");
    setNotes(editingPatient?.notes ?? "");
    setError(null);
  }, [open, editingPatient]);

  async function handleSubmit() {
    setError(null);
    const input = {
      name,
      phone,
      email: email || undefined,
      birthDate: birthDate || undefined,
      cpf: cpf || undefined,
      sex: sex === "M" || sex === "F" ? sex : undefined,
      guardianName: guardianName || undefined,
      guardianPhone: guardianPhone || undefined,
      guardianRelationship: guardianRelationship || undefined,
      notes: notes || undefined,
    };

    try {
      const saved = editingPatient
        ? await updatePatientAction(editingPatient.id, input)
        : await createPatientAction(input);
      onOpenChange(false);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar paciente");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingPatient ? "Editar paciente" : "Novo paciente"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="space-y-1">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="birthDate">Data de nascimento</Label>
            <Input
              id="birthDate"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="sex">Sexo</Label>
            <Select
              value={sex}
              onValueChange={(value) => setSex(value ?? "")}
              items={SEX_OPTIONS}
            >
              <SelectTrigger id="sex">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {SEX_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="guardianName">Responsável — nome</Label>
            <Input
              id="guardianName"
              value={guardianName}
              onChange={(e) => setGuardianName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="guardianPhone">Responsável — telefone</Label>
            <Input
              id="guardianPhone"
              value={guardianPhone}
              onChange={(e) => setGuardianPhone(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="guardianRelationship">Responsável — parentesco</Label>
            <Input
              id="guardianRelationship"
              value={guardianRelationship}
              onChange={(e) => setGuardianRelationship(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={handleSubmit}
            disabled={!name.trim() || !phone.trim()}
          >
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/patients/patient-form-dialog.tsx
git commit -m "feat(pacientes): add patient create/edit form dialog"
```

---

### Task 8: `BulkMessageDialog` component

**Files:**
- Create: `src/components/patients/bulk-message-dialog.tsx`

**Interfaces:**
- Consumes: `sendBulkMessageAction` (Task 5).
- Produces: `BulkMessageDialog({ open, onOpenChange, selectedCount, contactIds, onSent }: { open: boolean; onOpenChange: (open: boolean) => void; selectedCount: number; contactIds: string[]; onSent: () => void })` — consumed by Task 9.

- [ ] **Step 1: Implement the component**

Create `src/components/patients/bulk-message-dialog.tsx`:

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
import { Textarea } from "@/components/ui/textarea";
import { sendBulkMessageAction } from "@/app/(app)/pacientes/actions";

export function BulkMessageDialog({
  open,
  onOpenChange,
  selectedCount,
  contactIds,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  contactIds: string[];
  onSent: () => void;
}) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: string[]; failed: { contactId: string; error: string }[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setMessage("");
      setResult(null);
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSend() {
    setError(null);
    setSending(true);
    try {
      const outcome = await sendBulkMessageAction({ contactIds, message });
      setResult(outcome);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar mensagens");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar mensagem para {selectedCount} paciente(s)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!result && (
            <>
              <Textarea
                placeholder="Escreva a mensagem. Use {{nome}} para inserir o nome do paciente."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending}
              />
              <Button
                type="button"
                className="w-full"
                onClick={handleSend}
                disabled={sending || !message.trim() || contactIds.length === 0}
              >
                {sending ? "Enviando..." : `Enviar para ${selectedCount} paciente(s)`}
              </Button>
            </>
          )}

          {result && (
            <div className="space-y-2 text-sm">
              <p>{result.sent.length} mensagem(ns) enviada(s) com sucesso.</p>
              {result.failed.length > 0 && (
                <div className="text-red-600">
                  <p>{result.failed.length} falha(s):</p>
                  <ul className="list-disc pl-5">
                    {result.failed.map((f) => (
                      <li key={f.contactId}>{f.error}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Button type="button" className="w-full" onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/patients/bulk-message-dialog.tsx
git commit -m "feat(pacientes): add bulk WhatsApp message dialog"
```

---

### Task 9: `PatientsClient` component + `/pacientes` route

**Files:**
- Create: `src/components/patients/patients-client.tsx`
- Create: `src/app/(app)/pacientes/page.tsx`

**Interfaces:**
- Consumes: `PatientFormDialog` (Task 7), `BulkMessageDialog` (Task 8), `searchPatientsAction`, `deletePatientAction` (Task 5), `listPatientsAction` (Task 5), `PageHeader` (pre-existing), `Contact` type (Task 1).
- Produces: the working `/pacientes` page — terminal deliverable of this plan.

- [ ] **Step 1: Implement `PatientsClient`**

Create `src/components/patients/patients-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchPatientsAction, deletePatientAction } from "@/app/(app)/pacientes/actions";
import { PatientFormDialog } from "./patient-form-dialog";
import { BulkMessageDialog } from "./bulk-message-dialog";
import type { Contact } from "@/modules/crm/types";

function calculateAge(birthDate: string | null): string {
  if (!birthDate) return "—";
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return String(age);
}

export function PatientsClient({ initialPatients }: { initialPatients: Contact[] }) {
  const [patients, setPatients] = useState(initialPatients);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Contact | null>(null);
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(value: string) {
    setQuery(value);
    setError(null);
    try {
      const results = value.trim() ? await searchPatientsAction(value) : initialPatients;
      setPatients(results);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar pacientes");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === patients.length ? new Set() : new Set(patients.map((p) => p.id)),
    );
  }

  function openNewPatientForm() {
    setEditingPatient(null);
    setFormOpen(true);
  }

  function openEditPatientForm(patient: Contact) {
    setEditingPatient(patient);
    setFormOpen(true);
  }

  function handleSaved(saved: Contact) {
    setPatients((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deletePatientAction(id);
      setPatients((prev) => prev.filter((p) => p.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover paciente");
    }
  }

  return (
    <div className="space-y-4 px-6 pb-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <Input
          placeholder="Buscar por nome ou telefone"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="max-w-sm"
        />
        <Button type="button" onClick={openNewPatientForm}>
          Novo paciente
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={selectedIds.size === 0}
          onClick={() => setBulkMessageOpen(true)}
        >
          Enviar mensagem ({selectedIds.size})
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="w-10 p-2">
                <input
                  type="checkbox"
                  checked={patients.length > 0 && selectedIds.size === patients.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-2">Nome</th>
              <th className="p-2">Telefone</th>
              <th className="p-2">E-mail</th>
              <th className="p-2">Idade</th>
              <th className="w-24 p-2"></th>
            </tr>
          </thead>
          <tbody>
            {patients.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                  Nenhum paciente encontrado.
                </td>
              </tr>
            )}
            {patients.map((patient) => (
              <tr key={patient.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(patient.id)}
                    onChange={() => toggleSelected(patient.id)}
                  />
                </td>
                <td className="cursor-pointer p-2" onClick={() => openEditPatientForm(patient)}>
                  {patient.name}
                </td>
                <td className="p-2">{patient.phone}</td>
                <td className="p-2">{patient.email ?? "—"}</td>
                <td className="p-2">{calculateAge(patient.birthDate)}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(patient.id)}>
                    Remover
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PatientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingPatient={editingPatient}
        onSaved={handleSaved}
      />

      <BulkMessageDialog
        open={bulkMessageOpen}
        onOpenChange={setBulkMessageOpen}
        selectedCount={selectedIds.size}
        contactIds={[...selectedIds]}
        onSent={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
```

- [ ] **Step 2: Implement the page**

Create `src/app/(app)/pacientes/page.tsx`:

```tsx
import { listPatientsAction } from "@/app/(app)/pacientes/actions";
import { PatientsClient } from "@/components/patients/patients-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function PatientsPage() {
  const patients = await listPatientsAction();

  return (
    <div>
      <PageHeader
        title="Pacientes"
        description="Cadastre pacientes e envie mensagens em massa pelo WhatsApp."
      />
      <PatientsClient initialPatients={patients} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and run the full test suite**

Run: `npx tsc --noEmit && npm run test`
Expected: no type errors, all tests pass.

- [ ] **Step 4: Manually verify in the browser**

Run: `npm run dev` (skip if already running). Open `/pacientes`:
- Confirm the empty/seeded list renders without errors.
- Click "Novo paciente", fill name + phone, save — confirm the new row appears in the table.
- Click the new row, edit the e-mail field, save — confirm the change reflects in the table.
- Select 1+ patients via checkboxes, click "Enviar mensagem (N)", type a message with `{{nome}}`, send — confirm it completes and shows a sent/failed summary (the `fake` WhatsApp provider is used by default in dev, so sends succeed without a real WhatsApp connection).
- Click "Remover" on a patient — confirm it disappears from the table.

- [ ] **Step 5: Commit**

```bash
git add src/components/patients/patients-client.tsx "src/app/(app)/pacientes/page.tsx"
git commit -m "feat(pacientes): add patients list page with search, edit, and bulk send"
```

---

## Fora de Escopo (herdado da spec)

Ver seção "Fora de Escopo" em `docs/superpowers/specs/2026-08-24-tela-pacientes-design.md` — entidade `Patient` separada, templates/campanhas, validação de CPF/e-mail no servidor, deduplicação automática, progresso incremental (streaming) do envio em massa, opt-out.
