# Assinatura Eletrônica dos Consentimentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o paciente assine eletronicamente 3 documentos de consentimento (texto fixo) presencialmente — no aparelho da enfermeira ou, via link/QR, no próprio celular — gerando um PDF assinado por documento, anexado ao paciente.

**Architecture:** Novo módulo `src/modules/consents/` espelhando `src/modules/treatments/` (types / schemas / repository / repository.supabase / repository.memory / service + testes). Uma tabela `signed_consents` + bucket privado `signed-consents` (migração 0013), ambos cópias do padrão de `treatment_photos`. O PDF é montado no browser com `pdf-lib`, a assinatura é capturada com `signature_pad`. Fluxo autenticado em `/pacientes/[id]/documentos`; fluxo público em `/assinar/[token]` com token HMAC stateless (`crypto.subtle`) e client service-role, espelhando `/agendar/[accountId]`.

**Tech Stack:** Next.js 16.3.1 (App Router, Server Actions), React 19.2.8, TypeScript 5, Zod 4, Supabase (Postgres + Storage + RLS), Cloudflare Workers (`@opennextjs/cloudflare`, `nodejs_compat`), Vitest 4 + Testing Library, Base UI (`@base-ui/react`) para dialogs, date-fns. Deps novas: `pdf-lib`, `signature_pad`, `qrcode`.

**Spec:** `docs/superpowers/specs/2026-08-30-assinatura-consentimentos-design.md`

## Global Constraints

- **Sem geração de PDF no servidor.** Cloudflare Workers não tem Chrome headless. Todo PDF é montado client-side.
- **Alias de import:** `@/` → `src/` (configurado em `vitest.config.ts` e `tsconfig.json`).
- **Padrão de módulo:** todo módulo em `src/modules/<nome>/` tem `types.ts`, `schemas.ts`, `repository.ts` (interface), `repository.memory.ts`, `repository.supabase.ts`, `service.ts`, e testes `repository.memory.test.ts` + `service.test.ts`. Repositório Supabase converte snake_case → camelCase com uma função `toX(row)`. Erros de banco passam por `throwDbError`.
- **RLS padrão do projeto:** policy `for all to authenticated` com `account_id in (select account_id from account_users where user_id = auth.uid())` em `using` e `with check`.
- **Bucket de Storage:** privado, policy em `storage.objects` por `(storage.foldername(name))[1] = account_id`. Signed URLs com TTL de `3600` s.
- **Validação:** schemas Zod + `parseOrThrow(schema, rawInput)` de `@/lib/zod-error`. Mensagens de erro em português.
- **Nomes de `kind`:** `tcle`, `imagem`, `lgpd` (provisórios — a profissional ainda vai enviar os textos; a migração não foi aplicada, então os nomes podem mudar antes da aplicação).
- **Migração:** próxima livre é a **0013** (`supabase/migrations/`). A 0011 e a 0012 já existem.
- **`database.types.ts`** é editado à mão neste projeto (ver planos anteriores). Não depender de `supabase gen types` (pede senha interativa).
- **Comandos:** testes `npx vitest run <path>`; typecheck `npx tsc --noEmit`; lint `npx eslint <paths>`.

---

## File Structure

**Criar:**
- `supabase/migrations/0013_signed_consents.sql` — tabela `signed_consents` + RLS + bucket `signed-consents` + policy de storage.
- `src/modules/consents/types.ts` — `SignedConsent`.
- `src/modules/consents/schemas.ts` — `CONSENT_KINDS`, `ConsentKind`, `recordConsentInputSchema`.
- `src/modules/consents/repository.ts` — interface `ConsentsRepository`.
- `src/modules/consents/repository.memory.ts` — `createInMemoryConsentsRepository`.
- `src/modules/consents/repository.supabase.ts` — `createSupabaseConsentsRepository`.
- `src/modules/consents/repository.memory.test.ts`
- `src/modules/consents/service.ts` — `recordConsent`, `listConsentsForContact`, `getConsent`, `deleteConsent`.
- `src/modules/consents/service.test.ts`
- `src/modules/consents/templates.ts` — `TemplateContext`, `renderTemplate`, `formatBrDate`, `formatBrDateTime`.
- `src/modules/consents/templates.test.ts`
- `src/modules/consents/token.ts` — `ConsentClaims`, `signConsentToken`, `verifyConsentToken`.
- `src/modules/consents/token.test.ts`
- `src/components/consents/pdf.ts` — `wrapLine`, `layoutParagraphs`, `paginate`, `buildConsentPdf`, `ConsentPdfInput`.
- `src/components/consents/pdf.test.ts`
- `src/components/consents/signature-pad.tsx` — `SignaturePad`, `SignaturePadHandle`.
- `src/components/consents/consent-sign-form.tsx` — `ConsentSignForm`, `ConsentSignFormProps`.
- `src/components/consents/consent-sign-form.test.tsx`
- `src/components/consents/consent-cards.tsx` — `ConsentCards`.
- `src/components/consents/public-consent-form.tsx` — `PublicConsentForm`.
- `src/app/(app)/pacientes/[id]/documentos/page.tsx`
- `src/app/assinar/[token]/page.tsx`
- `src/app/assinar/actions.ts` — `submitPublicConsentAction`.
- `docs/ops/consent-link-secret.md` — nota sobre a env var.

**Modificar:**
- `src/lib/supabase/database.types.ts` — adicionar tipos da tabela `signed_consents`.
- `src/app/(app)/pacientes/[id]/actions.ts` — adicionar `listConsentsAction`, `uploadConsentAction`, `deleteConsentAction`, `createConsentLinkAction`, `getConsentPageDataAction`.
- `src/components/patients/patient-detail-client.tsx` — link "Documentos" na ficha do paciente.
- `src/app/(app)/pacientes/actions.ts` — purgar objetos `signed-consents` na exclusão de paciente.
- `src/lib/rate-limit.ts` — `withinConsentSignRateLimit`.
- `wrangler.toml` — binding `CONSENT_SIGN_RATE_LIMIT`.

---

## Task 1: Migração 0013 + tipos do banco

**Files:**
- Create: `supabase/migrations/0013_signed_consents.sql`
- Modify: `src/lib/supabase/database.types.ts` (inserir bloco `signed_consents` entre `procedures` e `treatment_photos`)

**Interfaces:**
- Produces: tabela `signed_consents` (colunas `id, account_id, contact_id, kind, storage_path, signer_name, signed_via, signed_at, created_at`); bucket `signed-consents`; `Database["public"]["Tables"]["signed_consents"]`.

- [ ] **Step 1: Escrever a migração**

Criar `supabase/migrations/0013_signed_consents.sql`:

```sql
-- Feature: assinatura eletrônica dos consentimentos.
-- Um PDF assinado por documento, anexado ao paciente. Espelha o padrão de
-- treatment_photos (bucket privado + RLS por prefixo de account_id).

create table signed_consents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  kind text not null check (kind in ('tcle', 'imagem', 'lgpd')),
  storage_path text not null,
  signer_name text not null,
  signed_via text not null check (signed_via in ('inline', 'link')),
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index signed_consents_account_contact_idx
  on signed_consents (account_id, contact_id);

alter table signed_consents enable row level security;

create policy "account members can manage signed_consents"
  on signed_consents for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('signed-consents', 'signed-consents', false)
on conflict (id) do nothing;

create policy "account members manage signed consent objects"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'signed-consents'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'signed-consents'
    and (storage.foldername(name))[1] in (
      select account_id::text from account_users where user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Adicionar os tipos em `database.types.ts`**

Abrir `src/lib/supabase/database.types.ts`. Localizar o fim do bloco `procedures: { ... }` (antes de `treatment_photos: {`). Inserir, mantendo a ordem alfabética:

```ts
      signed_consents: {
        Row: {
          account_id: string
          contact_id: string
          created_at: string
          id: string
          kind: string
          signed_at: string
          signed_via: string
          signer_name: string
          storage_path: string
        }
        Insert: {
          account_id: string
          contact_id: string
          created_at?: string
          id?: string
          kind: string
          signed_at?: string
          signed_via: string
          signer_name: string
          storage_path: string
        }
        Update: {
          account_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          kind?: string
          signed_at?: string
          signed_via?: string
          signer_name?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "signed_consents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signed_consents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (sem novos erros).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_signed_consents.sql src/lib/supabase/database.types.ts
git commit -m "feat(consents): migração 0013 — signed_consents + bucket privado"
```

> **Nota de operação (não é passo de código):** a migração precisa ser aplicada pelo usuário (`npx supabase db push` pede senha interativa). O fluxo não funciona end-to-end até isso ser feito, mas todas as tarefas seguintes podem ser implementadas e ter seus testes passando (repositório memory + unidades puras).

---

## Task 2: Módulo consents — types + schemas

**Files:**
- Create: `src/modules/consents/types.ts`
- Create: `src/modules/consents/schemas.ts`

**Interfaces:**
- Produces:
  - `SignedConsent` (interface)
  - `CONSENT_KINDS: readonly ["tcle", "imagem", "lgpd"]`
  - `type ConsentKind = "tcle" | "imagem" | "lgpd"`
  - `type SignedVia = "inline" | "link"`
  - `recordConsentInputSchema` (Zod) + `type RecordConsentInput`

- [ ] **Step 1: Escrever `types.ts`**

```ts
import type { ConsentKind, SignedVia } from "./schemas";

export interface SignedConsent {
  id: string;
  accountId: string;
  contactId: string;
  kind: ConsentKind;
  storagePath: string;
  signerName: string;
  signedVia: SignedVia;
  signedAt: string; // ISO
  createdAt: string; // ISO
}
```

- [ ] **Step 2: Escrever `schemas.ts`**

```ts
import { z } from "zod";

export const CONSENT_KINDS = ["tcle", "imagem", "lgpd"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];
export type SignedVia = "inline" | "link";

export const recordConsentInputSchema = z.object({
  contactId: z.string().uuid(),
  kind: z.enum(CONSENT_KINDS),
  storagePath: z.string().trim().min(1),
  signerName: z.string().trim().min(1, "Informe o nome de quem assina").max(200),
  signedVia: z.enum(["inline", "link"]),
});
export type RecordConsentInput = z.infer<typeof recordConsentInputSchema>;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/consents/types.ts src/modules/consents/schemas.ts
git commit -m "feat(consents): types + schemas"
```

---

## Task 3: Módulo consents — repository (interface + memory + supabase)

**Files:**
- Create: `src/modules/consents/repository.ts`
- Create: `src/modules/consents/repository.memory.ts`
- Create: `src/modules/consents/repository.supabase.ts`
- Test: `src/modules/consents/repository.memory.test.ts`

**Interfaces:**
- Consumes: `SignedConsent` (Task 2), `ConsentKind` / `SignedVia` (Task 2), `Database` from `@/lib/supabase/database.types` (Task 1).
- Produces:
  - `interface ConsentsRepository` com métodos:
    - `insertConsent(accountId: string, input: { contactId: string; kind: ConsentKind; storagePath: string; signerName: string; signedVia: SignedVia }): Promise<SignedConsent>`
    - `listConsentsForContact(accountId: string, contactId: string): Promise<SignedConsent[]>` — ordenado por `signedAt` desc
    - `getConsent(accountId: string, id: string): Promise<SignedConsent | null>`
    - `deleteConsent(accountId: string, id: string): Promise<void>`
  - `createInMemoryConsentsRepository(): ConsentsRepository`
  - `createSupabaseConsentsRepository(supabase: SupabaseClient<Database>): ConsentsRepository`

- [ ] **Step 1: Escrever a interface `repository.ts`**

```ts
import type { ConsentKind, SignedVia } from "./schemas";
import type { SignedConsent } from "./types";

export interface ConsentsRepository {
  insertConsent(
    accountId: string,
    input: {
      contactId: string;
      kind: ConsentKind;
      storagePath: string;
      signerName: string;
      signedVia: SignedVia;
    },
  ): Promise<SignedConsent>;
  listConsentsForContact(accountId: string, contactId: string): Promise<SignedConsent[]>;
  getConsent(accountId: string, id: string): Promise<SignedConsent | null>;
  deleteConsent(accountId: string, id: string): Promise<void>;
}
```

- [ ] **Step 2: Escrever o teste do repositório memory (falhando)**

Criar `src/modules/consents/repository.memory.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createInMemoryConsentsRepository } from "./repository.memory";

function baseInput(overrides: Partial<Parameters<
  ReturnType<typeof createInMemoryConsentsRepository>["insertConsent"]
>[1]> = {}) {
  return {
    contactId: "contact-1",
    kind: "tcle" as const,
    storagePath: "acc-1/contact-1/tcle-1.pdf",
    signerName: "Maria Silva",
    signedVia: "inline" as const,
    ...overrides,
  };
}

describe("createInMemoryConsentsRepository", () => {
  it("inserts and reads a consent scoped to its account", async () => {
    const repo = createInMemoryConsentsRepository();
    const c = await repo.insertConsent("acc-1", baseInput());

    expect(c.kind).toBe("tcle");
    expect(c.signerName).toBe("Maria Silva");
    expect(c.signedVia).toBe("inline");
    expect(await repo.getConsent("acc-1", c.id)).not.toBeNull();
    expect(await repo.getConsent("acc-2", c.id)).toBeNull();
  });

  it("lists a contact's consents newest-signed first", async () => {
    const repo = createInMemoryConsentsRepository();
    const a = await repo.insertConsent("acc-1", baseInput({ kind: "tcle" }));
    await new Promise((r) => setTimeout(r, 2));
    const b = await repo.insertConsent("acc-1", baseInput({ kind: "imagem" }));
    await repo.insertConsent("acc-1", baseInput({ contactId: "other" }));

    const list = await repo.listConsentsForContact("acc-1", "contact-1");
    expect(list.map((c) => c.id)).toEqual([b.id, a.id]);
  });

  it("deletes a consent scoped to its account", async () => {
    const repo = createInMemoryConsentsRepository();
    const c = await repo.insertConsent("acc-1", baseInput());
    await expect(repo.deleteConsent("acc-2", c.id)).rejects.toThrow();
    await repo.deleteConsent("acc-1", c.id);
    expect(await repo.getConsent("acc-1", c.id)).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `npx vitest run src/modules/consents/repository.memory.test.ts`
Expected: FAIL — `createInMemoryConsentsRepository` não existe.

- [ ] **Step 4: Escrever `repository.memory.ts`**

```ts
import type { ConsentsRepository } from "./repository";
import type { SignedConsent } from "./types";

export function createInMemoryConsentsRepository(): ConsentsRepository {
  const rows = new Map<string, SignedConsent>();

  function owned(row: SignedConsent | undefined, accountId: string): SignedConsent | null {
    return row && row.accountId === accountId ? row : null;
  }

  return {
    async insertConsent(accountId, input) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const row: SignedConsent = {
        id,
        accountId,
        contactId: input.contactId,
        kind: input.kind,
        storagePath: input.storagePath,
        signerName: input.signerName,
        signedVia: input.signedVia,
        signedAt: now,
        createdAt: now,
      };
      rows.set(id, row);
      return row;
    },

    async listConsentsForContact(accountId, contactId) {
      return [...rows.values()]
        .filter((r) => r.accountId === accountId && r.contactId === contactId)
        .sort((a, b) => b.signedAt.localeCompare(a.signedAt));
    },

    async getConsent(accountId, id) {
      return owned(rows.get(id), accountId);
    },

    async deleteConsent(accountId, id) {
      const current = owned(rows.get(id), accountId);
      if (!current) throw new Error("Consent not found");
      rows.delete(id);
    },
  };
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npx vitest run src/modules/consents/repository.memory.test.ts`
Expected: PASS.

- [ ] **Step 6: Escrever `repository.supabase.ts`**

```ts
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ConsentsRepository } from "./repository";
import type { ConsentKind, SignedVia } from "./schemas";
import type { SignedConsent } from "./types";

function throwDbError(error: PostgrestError): never {
  console.error("[consents/repository.supabase]", error);
  throw new Error("Erro ao acessar o banco de dados. Tente novamente.");
}

function toConsent(row: Database["public"]["Tables"]["signed_consents"]["Row"]): SignedConsent {
  return {
    id: row.id,
    accountId: row.account_id,
    contactId: row.contact_id,
    kind: row.kind as ConsentKind,
    storagePath: row.storage_path,
    signerName: row.signer_name,
    signedVia: row.signed_via as SignedVia,
    signedAt: row.signed_at,
    createdAt: row.created_at,
  };
}

export function createSupabaseConsentsRepository(
  supabase: SupabaseClient<Database>,
): ConsentsRepository {
  return {
    async insertConsent(accountId, input) {
      const { data, error } = await supabase
        .from("signed_consents")
        .insert({
          account_id: accountId,
          contact_id: input.contactId,
          kind: input.kind,
          storage_path: input.storagePath,
          signer_name: input.signerName,
          signed_via: input.signedVia,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toConsent(data);
    },

    async listConsentsForContact(accountId, contactId) {
      const { data, error } = await supabase
        .from("signed_consents")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("signed_at", { ascending: false });
      if (error) throwDbError(error);
      return data.map(toConsent);
    },

    async getConsent(accountId, id) {
      const { data, error } = await supabase
        .from("signed_consents")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", id)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toConsent(data) : null;
    },

    async deleteConsent(accountId, id) {
      const { error } = await supabase
        .from("signed_consents")
        .delete()
        .eq("account_id", accountId)
        .eq("id", id);
      if (error) throwDbError(error);
    },
  };
}
```

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add src/modules/consents/repository.ts src/modules/consents/repository.memory.ts src/modules/consents/repository.supabase.ts src/modules/consents/repository.memory.test.ts
git commit -m "feat(consents): repository (interface + memory + supabase)"
```

---

## Task 4: Módulo consents — service

**Files:**
- Create: `src/modules/consents/service.ts`
- Test: `src/modules/consents/service.test.ts`

**Interfaces:**
- Consumes: `ConsentsRepository` (Task 3), `recordConsentInputSchema` (Task 2), `parseOrThrow` from `@/lib/zod-error`.
- Produces:
  - `recordConsent(repo: ConsentsRepository, accountId: string, rawInput: unknown): Promise<SignedConsent>`
  - `listConsentsForContact(repo, accountId: string, contactId: string): Promise<SignedConsent[]>`
  - `getConsent(repo, accountId: string, id: string): Promise<SignedConsent | null>`
  - `deleteConsent(repo, accountId: string, id: string): Promise<void>`

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `src/modules/consents/service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createInMemoryConsentsRepository } from "./repository.memory";
import * as service from "./service";

function raw(overrides: Record<string, unknown> = {}) {
  return {
    contactId: "11111111-1111-1111-1111-111111111111",
    kind: "tcle",
    storagePath: "acc-1/c/tcle-1.pdf",
    signerName: "  Maria Silva  ",
    signedVia: "inline",
    ...overrides,
  };
}

describe("consents service", () => {
  it("records a consent, trimming the signer name", async () => {
    const repo = createInMemoryConsentsRepository();
    const c = await service.recordConsent(repo, "acc-1", raw());
    expect(c.signerName).toBe("Maria Silva");
    expect(c.kind).toBe("tcle");
  });

  it("rejects an unknown kind", async () => {
    const repo = createInMemoryConsentsRepository();
    await expect(service.recordConsent(repo, "acc-1", raw({ kind: "outro" }))).rejects.toThrow();
  });

  it("rejects an empty signer name", async () => {
    const repo = createInMemoryConsentsRepository();
    await expect(service.recordConsent(repo, "acc-1", raw({ signerName: "   " }))).rejects.toThrow(
      "Informe o nome de quem assina",
    );
  });

  it("rejects an invalid signedVia", async () => {
    const repo = createInMemoryConsentsRepository();
    await expect(service.recordConsent(repo, "acc-1", raw({ signedVia: "email" }))).rejects.toThrow();
  });

  it("lists, gets and deletes through the repo", async () => {
    const repo = createInMemoryConsentsRepository();
    const c = await service.recordConsent(repo, "acc-1", raw());
    expect((await service.listConsentsForContact(repo, "acc-1", c.contactId)).length).toBe(1);
    expect(await service.getConsent(repo, "acc-1", c.id)).not.toBeNull();
    await service.deleteConsent(repo, "acc-1", c.id);
    expect(await service.getConsent(repo, "acc-1", c.id)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/consents/service.test.ts`
Expected: FAIL — `./service` não existe.

- [ ] **Step 3: Escrever `service.ts`**

```ts
import { parseOrThrow } from "@/lib/zod-error";
import type { ConsentsRepository } from "./repository";
import { recordConsentInputSchema } from "./schemas";
import type { SignedConsent } from "./types";

export async function recordConsent(
  repo: ConsentsRepository,
  accountId: string,
  rawInput: unknown,
): Promise<SignedConsent> {
  const input = parseOrThrow(recordConsentInputSchema, rawInput);
  return repo.insertConsent(accountId, {
    contactId: input.contactId,
    kind: input.kind,
    storagePath: input.storagePath,
    signerName: input.signerName,
    signedVia: input.signedVia,
  });
}

export async function listConsentsForContact(
  repo: ConsentsRepository,
  accountId: string,
  contactId: string,
): Promise<SignedConsent[]> {
  return repo.listConsentsForContact(accountId, contactId);
}

export async function getConsent(
  repo: ConsentsRepository,
  accountId: string,
  id: string,
): Promise<SignedConsent | null> {
  return repo.getConsent(accountId, id);
}

export async function deleteConsent(
  repo: ConsentsRepository,
  accountId: string,
  id: string,
): Promise<void> {
  await repo.deleteConsent(accountId, id);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/consents/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/consents/service.ts src/modules/consents/service.test.ts
git commit -m "feat(consents): service"
```

---

## Task 5: Módulo consents — templates + formatadores de data

**Files:**
- Create: `src/modules/consents/templates.ts`
- Test: `src/modules/consents/templates.test.ts`

**Interfaces:**
- Consumes: `CONSENT_KINDS`, `ConsentKind` (Task 2).
- Produces:
  - `interface TemplateContext { pacienteNome: string; pacienteCpf: string | null; pacienteNascimento: string | null; clinicaNome: string; profissionalNome: string | null; profissionalConselho: string | null; data: string }`
  - `renderTemplate(kind: ConsentKind, ctx: TemplateContext): { title: string; paragraphs: string[] }`
  - `formatBrDate(date: Date): string` → `"DD/MM/AAAA"`
  - `formatBrDateTime(date: Date): string` → `"DD/MM/AAAA HH:mm"`

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `src/modules/consents/templates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderTemplate, formatBrDate, formatBrDateTime, type TemplateContext } from "./templates";

const ctx: TemplateContext = {
  pacienteNome: "Maria Silva",
  pacienteCpf: null,
  pacienteNascimento: null,
  clinicaNome: "Clínica Ozônio",
  profissionalNome: "Silvana Enfermeira",
  profissionalConselho: "COREN-SP 123456",
  data: "12/03/2026",
};

describe("renderTemplate", () => {
  it("replaces known placeholders", () => {
    const r = renderTemplate("tcle", ctx);
    expect(r.title).toBe("Termo de Consentimento Livre e Esclarecido");
    const joined = r.paragraphs.join("\n");
    expect(joined).toContain("Maria Silva");
    expect(joined).toContain("12/03/2026");
    expect(joined).not.toMatch(/\{\{/);
  });

  it("renders an em-dash for null or unknown placeholders", () => {
    const r = renderTemplate("imagem", { ...ctx, pacienteNome: "" });
    // template body references {{pacienteNome}} and (in the fixture body) {{foo}}
    const joined = r.paragraphs.join("\n");
    expect(joined).toContain("—");
  });

  it("splits paragraphs on blank lines", () => {
    const r = renderTemplate("lgpd", ctx);
    expect(r.paragraphs.length).toBeGreaterThan(1);
    expect(r.paragraphs.every((p) => p.length > 0)).toBe(true);
  });
});

describe("date formatters", () => {
  it("formats a date as DD/MM/AAAA", () => {
    expect(formatBrDate(new Date("2026-03-09T13:05:00Z"))).toBe("09/03/2026");
  });
  it("formats a datetime as DD/MM/AAAA HH:mm", () => {
    expect(formatBrDateTime(new Date("2026-03-09T13:05:00Z"))).toBe("09/03/2026 13:05");
  });
});
```

> Vitest roda com `TZ=UTC` (ver `vitest.config.ts`), então os formatadores devem usar os getters UTC.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/consents/templates.test.ts`
Expected: FAIL — `./templates` não existe.

- [ ] **Step 3: Escrever `templates.ts`**

```ts
import type { ConsentKind } from "./schemas";

export interface TemplateContext {
  pacienteNome: string;
  pacienteCpf: string | null;
  pacienteNascimento: string | null; // YYYY-MM-DD
  clinicaNome: string;
  profissionalNome: string | null;
  profissionalConselho: string | null;
  data: string; // DD/MM/AAAA
}

interface TemplateDef {
  title: string;
  body: string;
}

// TEXTOS PROVISÓRIOS — a profissional (Silvana) vai fornecer o conteúdo real
// dos 3 documentos. Só a estrutura de placeholders é definitiva.
const TEMPLATES: Record<ConsentKind, TemplateDef> = {
  tcle: {
    title: "Termo de Consentimento Livre e Esclarecido",
    body: `[Texto do TCLE a ser fornecido pela profissional.]

Paciente: {{pacienteNome}}
Profissional responsável: {{profissionalNome}} ({{profissionalConselho}})
Clínica: {{clinicaNome}}
Data: {{data}}`,
  },
  imagem: {
    title: "Autorização de Uso de Imagem",
    body: `[Texto da autorização de uso de imagem a ser fornecido pela profissional. {{foo}}]

Paciente: {{pacienteNome}}
Data: {{data}}`,
  },
  lgpd: {
    title: "Consentimento para Tratamento de Dados Pessoais (LGPD)",
    body: `[Texto do consentimento LGPD a ser fornecido pela profissional.]

Paciente: {{pacienteNome}}
Clínica: {{clinicaNome}}
Data: {{data}}`,
  },
};

const TOKEN_RE = /\{\{(\w+)\}\}/g;

const FIELDS: Record<string, keyof TemplateContext> = {
  pacienteNome: "pacienteNome",
  pacienteCpf: "pacienteCpf",
  pacienteNascimento: "pacienteNascimento",
  clinicaNome: "clinicaNome",
  profissionalNome: "profissionalNome",
  profissionalConselho: "profissionalConselho",
  data: "data",
};

export function renderTemplate(
  kind: ConsentKind,
  ctx: TemplateContext,
): { title: string; paragraphs: string[] } {
  const def = TEMPLATES[kind];
  const filled = def.body.replace(TOKEN_RE, (_match, name: string) => {
    const key = FIELDS[name];
    if (!key) return "—";
    const value = ctx[key];
    return value == null || value === "" ? "—" : String(value);
  });
  const paragraphs = filled
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return { title: def.title, paragraphs };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatBrDate(date: Date): string {
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

export function formatBrDateTime(date: Date): string {
  return `${formatBrDate(date)} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}
```

> **Nota:** `formatBrDate` / `formatBrDateTime` usam getters UTC para casar com `TZ=UTC` dos testes e com o ambiente do Worker (que roda em UTC). Em produção a hora exibida no rodapé do PDF é UTC — aceitável para um carimbo interno; se a profissional pedir horário local, trocar por `Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" })` numa iteração futura.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/consents/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/consents/templates.ts src/modules/consents/templates.test.ts
git commit -m "feat(consents): templates de documento + formatadores de data"
```

---

## Task 6: Módulo consents — token HMAC stateless

**Files:**
- Create: `src/modules/consents/token.ts`
- Test: `src/modules/consents/token.test.ts`

**Interfaces:**
- Consumes: `CONSENT_KINDS`, `ConsentKind` (Task 2). Usa `crypto.subtle` (Web Crypto) e `Buffer` (`nodejs_compat`) — **não** o módulo `node:crypto`.
- Produces:
  - `interface ConsentClaims { accountId: string; contactId: string; kind: ConsentKind }`
  - `signConsentToken(claims: ConsentClaims, ttlSeconds: number, now?: number): Promise<string>`
  - `verifyConsentToken(token: string, now?: number): Promise<ConsentClaims | null>`

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `src/modules/consents/token.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { signConsentToken, verifyConsentToken, type ConsentClaims } from "./token";

const claims: ConsentClaims = {
  accountId: "acc-1",
  contactId: "contact-1",
  kind: "tcle",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("consent token", () => {
  it("round-trips valid claims", async () => {
    const token = await signConsentToken(claims, 3600);
    expect(await verifyConsentToken(token)).toEqual(claims);
  });

  it("rejects an expired token", async () => {
    const past = Date.now() - 10_000;
    const token = await signConsentToken(claims, 1, past);
    expect(await verifyConsentToken(token)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signConsentToken(claims, 3600);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ a: "acc-2", c: "contact-1", k: "tcle", e: 9999999999 }),
    ).toString("base64url");
    expect(await verifyConsentToken(`${forged}.${sig}`)).toBeNull();
    expect(await verifyConsentToken(`${body}.AAAA`)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    vi.stubEnv("CONSENT_LINK_SECRET", "secret-a");
    const token = await signConsentToken(claims, 3600);
    vi.stubEnv("CONSENT_LINK_SECRET", "secret-b");
    expect(await verifyConsentToken(token)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifyConsentToken("not-a-token")).toBeNull();
    expect(await verifyConsentToken("")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/modules/consents/token.test.ts`
Expected: FAIL — `./token` não existe.

- [ ] **Step 3: Escrever `token.ts`**

```ts
import { CONSENT_KINDS, type ConsentKind } from "./schemas";

const DEV_FALLBACK_SECRET = "arkdoctor-dev-consent-secret-not-for-production";

function getSecret(): string {
  const secret = process.env.CONSENT_LINK_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("CONSENT_LINK_SECRET não configurado");
  }
  return DEV_FALLBACK_SECRET;
}

export interface ConsentClaims {
  accountId: string;
  contactId: string;
  kind: ConsentKind;
}

interface TokenPayload {
  a: string;
  c: string;
  k: string;
  e: number; // expiry, epoch seconds
}

async function hmac(data: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function b64url(input: Uint8Array | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buf.toString("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function signConsentToken(
  claims: ConsentClaims,
  ttlSeconds: number,
  now: number = Date.now(),
): Promise<string> {
  const payload: TokenPayload = {
    a: claims.accountId,
    c: claims.contactId,
    k: claims.kind,
    e: Math.floor(now / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(await hmac(body, getSecret()));
  return `${body}.${sig}`;
}

export async function verifyConsentToken(
  token: string,
  now: number = Date.now(),
): Promise<ConsentClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = b64url(await hmac(body, getSecret()));
  if (!timingSafeEqual(sig, expected)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }
  if (typeof payload.e !== "number" || payload.e * 1000 < now) return null;
  if (!CONSENT_KINDS.includes(payload.k as ConsentKind)) return null;
  if (typeof payload.a !== "string" || typeof payload.c !== "string") return null;

  return { accountId: payload.a, contactId: payload.c, kind: payload.k as ConsentKind };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/modules/consents/token.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/consents/token.ts src/modules/consents/token.test.ts
git commit -m "feat(consents): token HMAC stateless para o link de assinatura"
```

---

## Task 7: Montagem do PDF (client-side)

**Files:**
- Create: `src/components/consents/pdf.ts`
- Test: `src/components/consents/pdf.test.ts`
- Modify: `package.json` (dep `pdf-lib`)

**Interfaces:**
- Produces:
  - `wrapLine(text: string, maxWidth: number, measure: (s: string) => number): string[]`
  - `layoutParagraphs(paragraphs: string[], maxWidth: number, measure: (s: string) => number): string[]` — linhas achatadas, parágrafos separados por `""`
  - `paginate(lines: string[], linesPerPage: number): string[][]`
  - `interface ConsentPdfInput { documentTitle: string; headerLines: string[]; paragraphs: string[]; signatureDataUrl: string; signerName: string; signedAtLabel: string }`
  - `buildConsentPdf(input: ConsentPdfInput): Promise<Uint8Array>`

- [ ] **Step 1: Instalar `pdf-lib`**

Run: `npm install pdf-lib@^1.17.1`
Expected: adiciona `pdf-lib` a `dependencies`.

- [ ] **Step 2: Escrever o teste das funções puras (falhando)**

Criar `src/components/consents/pdf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { wrapLine, layoutParagraphs, paginate } from "./pdf";

// medida fake: 1 unidade por caractere
const measure = (s: string) => s.length;

describe("wrapLine", () => {
  it("wraps on word boundaries at maxWidth", () => {
    expect(wrapLine("aaa bbb ccc", 7, measure)).toEqual(["aaa bbb", "ccc"]);
  });

  it("keeps a single over-long word on its own line", () => {
    expect(wrapLine("supercalifragilistic word", 5, measure)).toEqual([
      "supercalifragilistic",
      "word",
    ]);
  });

  it("returns a single blank line for empty input", () => {
    expect(wrapLine("", 5, measure)).toEqual([""]);
  });
});

describe("layoutParagraphs", () => {
  it("flattens paragraphs with a blank separator between them", () => {
    expect(layoutParagraphs(["ab cd", "ef"], 5, measure)).toEqual(["ab cd", "", "ef"]);
  });
});

describe("paginate", () => {
  it("chunks lines into pages", () => {
    expect(paginate(["a", "b", "c", "d", "e"], 2)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/components/consents/pdf.test.ts`
Expected: FAIL — `./pdf` não existe.

- [ ] **Step 4: Escrever `pdf.ts`**

```ts
import type { PDFFont } from "pdf-lib";

export function wrapLine(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  if (text === "") return [""];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export function layoutParagraphs(
  paragraphs: string[],
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const out: string[] = [];
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) out.push("");
    out.push(...wrapLine(paragraph, maxWidth, measure));
  });
  return out;
}

export function paginate(lines: string[], linesPerPage: number): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  return pages;
}

export interface ConsentPdfInput {
  documentTitle: string;
  headerLines: string[];
  paragraphs: string[];
  signatureDataUrl: string; // PNG data URL
  signerName: string;
  signedAtLabel: string;
}

const PAGE_WIDTH = 595.28; // A4 pt
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const BODY_SIZE = 11;
const LINE_HEIGHT = 16;

export async function buildConsentPdf(input: ConsentPdfInput): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const measure = (s: string) => font.widthOfTextAtSize(s, BODY_SIZE);
  const bodyLines = layoutParagraphs(input.paragraphs, contentWidth, measure);

  // primeira página reserva espaço p/ título + cabeçalho; usamos um cálculo
  // conservador de linhas por página e deixamas a última página com a assinatura.
  const linesPerPage = Math.floor((PAGE_HEIGHT - MARGIN * 2 - 120) / LINE_HEIGHT);
  const pages = paginate(bodyLines, Math.max(linesPerPage, 1));

  pages.forEach((pageLines, pageIndex) => {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    if (pageIndex === 0) {
      page.drawText(input.documentTitle, { x: MARGIN, y, size: 15, font: bold });
      y -= 26;
      for (const line of input.headerLines) {
        page.drawText(line, { x: MARGIN, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
        y -= 13;
      }
      y -= 12;
    }

    for (const line of pageLines) {
      page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font });
      y -= LINE_HEIGHT;
    }
  });

  // assinatura no rodapé da última página
  const last = doc.getPage(doc.getPageCount() - 1);
  const png = await doc.embedPng(input.signatureDataUrl);
  const sigWidth = 180;
  const sigHeight = (png.height / png.width) * sigWidth;
  last.drawImage(png, { x: MARGIN, y: MARGIN + 24, width: sigWidth, height: sigHeight });
  last.drawLine({
    start: { x: MARGIN, y: MARGIN + 20 },
    end: { x: MARGIN + 260, y: MARGIN + 20 },
    thickness: 0.5,
    color: rgb(0.2, 0.2, 0.2),
  });
  last.drawText(
    `Assinado eletronicamente por ${input.signerName} em ${input.signedAtLabel}`,
    { x: MARGIN, y: MARGIN + 6, size: 8, font, color: rgb(0.3, 0.3, 0.3) },
  );

  return doc.save();
}

// re-export do tipo para consumidores que só querem a medida
export type { PDFFont };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/components/consents/pdf.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add package.json package-lock.json src/components/consents/pdf.ts src/components/consents/pdf.test.ts
git commit -m "feat(consents): montagem client-side do PDF (pdf-lib)"
```

---

## Task 8: SignaturePad + ConsentSignForm

**Files:**
- Create: `src/components/consents/signature-pad.tsx`
- Create: `src/components/consents/consent-sign-form.tsx`
- Test: `src/components/consents/consent-sign-form.test.tsx`
- Modify: `package.json` (dep `signature_pad`)

**Interfaces:**
- Consumes: `buildConsentPdf`, `ConsentPdfInput` (Task 7); `formatBrDateTime` (Task 5); `Button` from `@/components/ui/button`.
- Produces:
  - `interface SignaturePadHandle { isEmpty: () => boolean; toDataURL: () => string; clear: () => void }`
  - `SignaturePad` — `forwardRef<SignaturePadHandle, { className?: string }>`
  - `interface ConsentSignFormProps { documentTitle: string; headerLines: string[]; paragraphs: string[]; defaultSignerName: string; submitLabel: string; onComplete: (args: { pdfBytes: Uint8Array; signerName: string }) => Promise<{ ok: boolean; error?: string }>; onDone?: () => void }`
  - `ConsentSignForm(props: ConsentSignFormProps)` — componente client

- [ ] **Step 1: Instalar `signature_pad`**

Run: `npm install signature_pad@^5.0.4`

- [ ] **Step 2: Escrever `signature-pad.tsx`**

```tsx
"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type SignaturePadLib from "signature_pad";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
}

export const SignaturePad = forwardRef<SignaturePadHandle, { className?: string }>(
  function SignaturePad({ className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePadLib | null>(null);

    useEffect(() => {
      let disposed = false;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);

      void import("signature_pad").then(({ default: Lib }) => {
        if (disposed || !canvasRef.current) return;
        padRef.current = new Lib(canvasRef.current, { penColor: "#111827" });
      });

      return () => {
        disposed = true;
        padRef.current?.off();
        padRef.current = null;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toDataURL: () => padRef.current?.toDataURL("image/png") ?? "",
      clear: () => padRef.current?.clear(),
    }));

    return <canvas ref={canvasRef} className={className} />;
  },
);
```

- [ ] **Step 3: Escrever `consent-sign-form.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBrDateTime } from "@/modules/consents/templates";
import { buildConsentPdf } from "./pdf";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

export interface ConsentSignFormProps {
  documentTitle: string;
  headerLines: string[];
  paragraphs: string[];
  defaultSignerName: string;
  submitLabel: string;
  onComplete: (args: {
    pdfBytes: Uint8Array;
    signerName: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onDone?: () => void;
}

export function ConsentSignForm(props: ConsentSignFormProps) {
  const [signerName, setSignerName] = useState(props.defaultSignerName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  async function handleSubmit() {
    if (busy) return;
    if (!signerName.trim()) {
      setError("Informe o nome de quem assina.");
      return;
    }
    if (padRef.current?.isEmpty() ?? true) {
      setError("Assine no quadro antes de confirmar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pdfBytes = await buildConsentPdf({
        documentTitle: props.documentTitle,
        headerLines: props.headerLines,
        paragraphs: props.paragraphs,
        signatureDataUrl: padRef.current!.toDataURL(),
        signerName: signerName.trim(),
        signedAtLabel: formatBrDateTime(new Date()),
      });
      const res = await props.onComplete({ pdfBytes, signerName: signerName.trim() });
      if (!res.ok) {
        setError(res.error ?? "Não foi possível salvar. Tente novamente.");
        return;
      }
      props.onDone?.();
    } catch {
      setError("Não foi possível gerar o documento neste aparelho.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3 text-sm">
        {props.paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {p}
          </p>
        ))}
      </div>

      <label className="block text-sm">
        <span className="text-muted-foreground">Nome de quem assina</span>
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          className="mt-1 w-full rounded border px-2 py-1"
        />
      </label>

      <div className="space-y-1">
        <span className="text-sm text-muted-foreground">Assinatura</span>
        <SignaturePad className="h-40 w-full touch-none rounded-md border bg-white" />
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => padRef.current?.clear()}
        >
          Limpar
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="button" disabled={busy} onClick={handleSubmit}>
        {busy ? "Salvando…" : props.submitLabel}
      </Button>
    </div>
  );
}
```

> **Bug de ref:** `SignaturePad` usa `forwardRef` mas o `padRef` acima é passado como `ref={padRef}` — adicionar `ref={padRef}` ao `<SignaturePad>` no JSX. Corrigir: `<SignaturePad ref={padRef} className="..." />`.

- [ ] **Step 4: Corrigir o `ref` do SignaturePad no JSX**

No `consent-sign-form.tsx`, trocar `<SignaturePad className="h-40 w-full touch-none rounded-md border bg-white" />` por:

```tsx
<SignaturePad ref={padRef} className="h-40 w-full touch-none rounded-md border bg-white" />
```

- [ ] **Step 5: Escrever o teste (falhando)**

Criar `src/components/consents/consent-sign-form.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsentSignForm } from "./consent-sign-form";

vi.mock("./pdf", () => ({
  buildConsentPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock("./signature-pad", () => ({
  SignaturePad: () => <div data-testid="pad" />,
}));

describe("ConsentSignForm", () => {
  it("shows the document text", () => {
    render(
      <ConsentSignForm
        documentTitle="TCLE"
        headerLines={["Clínica X"]}
        paragraphs={["Primeiro parágrafo.", "Segundo parágrafo."]}
        defaultSignerName="Maria"
        submitLabel="Confirmar"
        onComplete={async () => ({ ok: true })}
      />,
    );
    expect(screen.getByText("Primeiro parágrafo.")).toBeInTheDocument();
  });

  it("blocks submit when the signer name is empty", async () => {
    const onComplete = vi.fn(async () => ({ ok: true }));
    render(
      <ConsentSignForm
        documentTitle="TCLE"
        headerLines={[]}
        paragraphs={["x"]}
        defaultSignerName=""
        submitLabel="Confirmar"
        onComplete={onComplete}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getByText("Informe o nome de quem assina.")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/components/consents/consent-sign-form.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck + lint + commit**

Run: `npx tsc --noEmit && npx eslint src/components/consents`
Expected: PASS.

```bash
git add package.json package-lock.json src/components/consents/signature-pad.tsx src/components/consents/consent-sign-form.tsx src/components/consents/consent-sign-form.test.tsx
git commit -m "feat(consents): SignaturePad + ConsentSignForm compartilhado"
```

---

## Task 9: Server actions autenticadas

**Files:**
- Modify: `src/app/(app)/pacientes/[id]/actions.ts` (adicionar imports + 5 actions no fim do arquivo)

**Interfaces:**
- Consumes: `ctx()` (helper já existente no arquivo — retorna `{ supabase, accountId, treatmentsRepo, schedulingRepo, crmRepo }`); `SIGNED_URL_TTL` (const já existente = 3600); `createSupabaseConsentsRepository` (Task 3); `consents.recordConsent/listConsentsForContact/getConsent/deleteConsent` (Task 4); `CONSENT_KINDS`, `ConsentKind` (Task 2); `renderTemplate`, `TemplateContext`, `formatBrDate` (Task 5); `signConsentToken` (Task 6); `getAccountProfessionalIdentity` (já importado no arquivo).
- Produces (todas `"use server"`):
  - `listConsentsAction(contactId: string): Promise<{ id: string; kind: ConsentKind; signerName: string; signedAt: string; url: string }[]>`
  - `uploadConsentAction(contactId: string, kind: string, formData: FormData): Promise<void>`
  - `deleteConsentAction(consentId: string): Promise<void>`
  - `createConsentLinkAction(contactId: string, kind: string): Promise<{ url: string }>`
  - `getConsentPageDataAction(contactId: string): Promise<{ patientName: string; professionalMissing: boolean; headerLines: string[]; docs: { kind: ConsentKind; title: string; paragraphs: string[] }[]; consents: Awaited<ReturnType<typeof listConsentsAction>> }>`

- [ ] **Step 1: Adicionar imports no topo de `actions.ts`**

Após os imports existentes, acrescentar:

```ts
import { headers } from "next/headers";
import { createSupabaseConsentsRepository } from "@/modules/consents/repository.supabase";
import * as consents from "@/modules/consents/service";
import { CONSENT_KINDS, type ConsentKind } from "@/modules/consents/schemas";
import { renderTemplate, formatBrDate } from "@/modules/consents/templates";
import { signConsentToken } from "@/modules/consents/token";
```

E as constantes, junto de `const BUCKET` / `const SIGNED_URL_TTL` existentes:

```ts
const CONSENT_BUCKET = "signed-consents";
const CONSENT_LINK_TTL_SECONDS = 48 * 60 * 60;
const MAX_CONSENT_PDF_BYTES = 2 * 1024 * 1024;
```

- [ ] **Step 2: Adicionar as actions no fim de `actions.ts`**

```ts
function assertConsentKind(kind: string): asserts kind is ConsentKind {
  if (!CONSENT_KINDS.includes(kind as ConsentKind)) throw new Error("Documento inválido.");
}

export async function listConsentsAction(contactId: string) {
  const c = await ctx();
  const repo = createSupabaseConsentsRepository(c.supabase);
  const rows = await consents.listConsentsForContact(repo, c.accountId, contactId);
  if (rows.length === 0) return [];
  const { data, error } = await c.supabase.storage
    .from(CONSENT_BUCKET)
    .createSignedUrls(rows.map((r) => r.storagePath), SIGNED_URL_TTL);
  if (error) throw new Error("Não foi possível carregar os documentos.");
  return rows.map((r, i) => ({
    id: r.id,
    kind: r.kind,
    signerName: r.signerName,
    signedAt: r.signedAt,
    url: data[i]?.signedUrl ?? "",
  }));
}

export async function uploadConsentAction(contactId: string, kind: string, formData: FormData) {
  assertConsentKind(kind);
  const c = await ctx();
  const contact = await c.crmRepo.getContact(c.accountId, contactId);
  if (!contact) throw new Error("Paciente não encontrado");

  const file = formData.get("file");
  if (!(file instanceof Blob)) throw new Error("Arquivo inválido.");
  if (file.type !== "application/pdf") throw new Error("O arquivo não é um PDF.");
  if (file.size > MAX_CONSENT_PDF_BYTES) throw new Error("O documento excede o tamanho permitido.");
  const signerName = (formData.get("signerName") as string | null)?.trim();
  if (!signerName) throw new Error("Informe o nome de quem assina.");

  const repo = createSupabaseConsentsRepository(c.supabase);
  const path = `${c.accountId}/${contactId}/${kind}-${Date.now()}.pdf`;
  const { error: uploadError } = await c.supabase.storage
    .from(CONSENT_BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("[pacientes/[id]/actions] consent upload", uploadError);
    throw new Error("Não foi possível salvar o documento. Tente novamente.");
  }
  try {
    await consents.recordConsent(repo, c.accountId, {
      contactId,
      kind,
      storagePath: path,
      signerName,
      signedVia: "inline",
    });
  } catch (err) {
    await c.supabase.storage.from(CONSENT_BUCKET).remove([path]);
    throw err;
  }
  revalidatePath(`/pacientes/${contactId}/documentos`);
}

export async function deleteConsentAction(consentId: string) {
  const c = await ctx();
  const repo = createSupabaseConsentsRepository(c.supabase);
  const row = await consents.getConsent(repo, c.accountId, consentId);
  if (!row) throw new Error("Documento não encontrado");
  await c.supabase.storage.from(CONSENT_BUCKET).remove([row.storagePath]);
  await consents.deleteConsent(repo, c.accountId, consentId);
  revalidatePath(`/pacientes/${row.contactId}/documentos`);
}

export async function createConsentLinkAction(contactId: string, kind: string) {
  assertConsentKind(kind);
  const c = await ctx();
  const contact = await c.crmRepo.getContact(c.accountId, contactId);
  if (!contact) throw new Error("Paciente não encontrado");
  const token = await signConsentToken(
    { accountId: c.accountId, contactId, kind },
    CONSENT_LINK_TTL_SECONDS,
  );
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "";
  return { url: `${proto}://${host}/assinar/${token}` };
}

export async function getConsentPageDataAction(contactId: string) {
  const c = await ctx();
  const [contact, identity, consentRows] = await Promise.all([
    c.crmRepo.getContact(c.accountId, contactId),
    getAccountProfessionalIdentity(c.supabase, c.accountId),
    listConsentsAction(contactId),
  ]);
  if (!contact) throw new Error("Paciente não encontrado");

  const templateCtx = {
    pacienteNome: contact.name,
    pacienteCpf: contact.cpf,
    pacienteNascimento: contact.birthDate,
    clinicaNome: identity.name,
    profissionalNome: identity.professionalName,
    profissionalConselho: identity.councilId,
    data: formatBrDate(new Date()),
  };

  const docs = CONSENT_KINDS.map((kind) => {
    const t = renderTemplate(kind, templateCtx);
    return { kind, title: t.title, paragraphs: t.paragraphs };
  });

  const headerLines = [
    identity.name,
    identity.professionalName
      ? `${identity.professionalName}${identity.councilId ? ` - ${identity.councilId}` : ""}`
      : null,
    `Paciente: ${contact.name}`,
  ].filter((l): l is string => Boolean(l));

  return {
    patientName: contact.name,
    professionalMissing: !identity.professionalName,
    headerLines,
    docs,
    consents: consentRows,
  };
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/pacientes/[id]/actions.ts"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/pacientes/[id]/actions.ts"
git commit -m "feat(consents): server actions autenticadas (list/upload/delete/link/page-data)"
```

---

## Task 10: Página `/pacientes/[id]/documentos` + ConsentCards + entrada na ficha

**Files:**
- Create: `src/components/consents/consent-cards.tsx`
- Create: `src/app/(app)/pacientes/[id]/documentos/page.tsx`
- Modify: `src/components/patients/patient-detail-client.tsx` (link "Documentos")
- Modify: `package.json` (dep `qrcode`)

**Interfaces:**
- Consumes: `ConsentSignForm` (Task 8); `listConsentsAction`, `uploadConsentAction`, `deleteConsentAction`, `createConsentLinkAction`, `getConsentPageDataAction` (Task 9); `ConsentKind` (Task 2); `Dialog` primitives from `@base-ui/react/dialog` (ver uso existente em `src/components/**` — seguir o padrão de outro dialog do projeto, ex.: `src/components/patients/patient-form-dialog.tsx`); `Button` from `@/components/ui/button`; `formatBrDate` from `@/modules/consents/templates`.
- Produces: `ConsentCards({ contactId, patientName, professionalMissing, headerLines, docs, initialConsents }: { contactId: string; patientName: string; professionalMissing: boolean; headerLines: string[]; docs: { kind: ConsentKind; title: string; paragraphs: string[] }[]; initialConsents: Awaited<ReturnType<typeof listConsentsAction>> })`

- [ ] **Step 1: Instalar `qrcode`**

Run: `npm install qrcode@^1.5.4 && npm install -D @types/qrcode@^1.5.5`

- [ ] **Step 2: Ler um dialog existente para seguir o padrão**

Abrir `src/components/patients/patient-form-dialog.tsx` e anotar como o projeto usa `@base-ui/react` `Dialog` (Portal / Backdrop / Popup / Title / Close). O `ConsentCards` reusa exatamente esse padrão.

- [ ] **Step 3: Escrever `consent-cards.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";
import { formatBrDate } from "@/modules/consents/templates";
import type { ConsentKind } from "@/modules/consents/schemas";
import { ConsentSignForm } from "./consent-sign-form";
import {
  createConsentLinkAction,
  deleteConsentAction,
  listConsentsAction,
  uploadConsentAction,
} from "@/app/(app)/pacientes/[id]/actions";

type ConsentRow = Awaited<ReturnType<typeof listConsentsAction>>[number];
type Doc = { kind: ConsentKind; title: string; paragraphs: string[] };

export function ConsentCards({
  contactId,
  patientName,
  professionalMissing,
  headerLines,
  docs,
  initialConsents,
}: {
  contactId: string;
  patientName: string;
  professionalMissing: boolean;
  headerLines: string[];
  docs: Doc[];
  initialConsents: ConsentRow[];
}) {
  const [consents, setConsents] = useState<ConsentRow[]>(initialConsents);
  const [signing, setSigning] = useState<Doc | null>(null);
  const [linkFor, setLinkFor] = useState<{ doc: Doc; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setConsents(await listConsentsAction(contactId));
  }

  function latestFor(kind: ConsentKind): ConsentRow | undefined {
    return consents.find((c) => c.kind === kind); // lista já vem signed_at desc
  }

  async function handleComplete(kind: ConsentKind, pdfBytes: Uint8Array, signerName: string) {
    const fd = new FormData();
    fd.set("file", new Blob([pdfBytes], { type: "application/pdf" }), "consent.pdf");
    fd.set("signerName", signerName);
    try {
      await uploadConsentAction(contactId, kind, fd);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : undefined };
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteConsentAction(id);
      setConsents((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover documento");
    }
  }

  async function handleLink(doc: Doc) {
    setError(null);
    try {
      const { url } = await createConsentLinkAction(contactId, doc.kind);
      setLinkFor({ doc, url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar link");
    }
  }

  return (
    <div className="space-y-3">
      {professionalMissing && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Preencha seus dados profissionais em{" "}
          <Link href="/configuracoes" className="underline">
            Configurações
          </Link>{" "}
          para que apareçam no documento.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y rounded-lg border">
        {docs.map((doc) => {
          const latest = latestFor(doc.kind);
          return (
            <li key={doc.kind} className="flex items-center justify-between gap-3 p-3">
              <div className="text-sm">
                <p className="font-medium">{doc.title}</p>
                {latest ? (
                  <p className="text-muted-foreground">
                    Assinado em {formatBrDate(new Date(latest.signedAt))} por {latest.signerName}
                  </p>
                ) : (
                  <p className="text-muted-foreground">Pendente</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {latest && (
                  <>
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => window.open(latest.url, "_blank", "noopener")}
                    >
                      Ver PDF
                    </button>
                    <button
                      type="button"
                      className="text-sm text-red-600 hover:underline"
                      onClick={() => handleDelete(latest.id)}
                    >
                      Excluir
                    </button>
                  </>
                )}
                <Button type="button" size="sm" variant="outline" onClick={() => handleLink(doc)}>
                  Enviar link
                </Button>
                <Button type="button" size="sm" onClick={() => setSigning(doc)}>
                  {latest ? "Assinar novamente" : "Assinar"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog.Root open={signing !== null} onOpenChange={(open) => !open && setSigning(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 bg-black/40" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 w-[min(32rem,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-4 shadow-lg">
            {signing && (
              <>
                <Dialog.Title className="mb-3 text-sm font-semibold">{signing.title}</Dialog.Title>
                <ConsentSignForm
                  documentTitle={signing.title}
                  headerLines={headerLines}
                  paragraphs={signing.paragraphs}
                  defaultSignerName={patientName}
                  submitLabel="Confirmar assinatura"
                  onComplete={({ pdfBytes, signerName }) =>
                    handleComplete(signing.kind, pdfBytes, signerName)
                  }
                  onDone={async () => {
                    setSigning(null);
                    await refresh();
                  }}
                />
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={linkFor !== null} onOpenChange={(open) => !open && setLinkFor(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 bg-black/40" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 w-[min(24rem,92vw)] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-lg bg-background p-4 shadow-lg">
            {linkFor && (
              <>
                <Dialog.Title className="text-sm font-semibold">
                  Link para {linkFor.doc.title}
                </Dialog.Title>
                <QrCode url={linkFor.url} />
                <input
                  readOnly
                  value={linkFor.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded border px-2 py-1 text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  O link expira em 48 horas. Mostre o QR ou envie pelo WhatsApp.
                </p>
              </>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function QrCode({ url }: { url: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let cancelled = false;
    void import("qrcode").then(async (QR) => {
      const out = await QR.toString(url, { type: "svg", margin: 1, width: 200 });
      if (!cancelled) setSvg(out);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <div
      className="mx-auto h-[200px] w-[200px] [&>svg]:h-full [&>svg]:w-full"
      // SVG gerado pela lib qrcode: markup estático, sem script
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
```

> Se `@base-ui/react/dialog` não expuser exatamente `Dialog.Root/Portal/Backdrop/Popup/Title`, usar os nomes que `patient-form-dialog.tsx` usa (mesma lib, mesma versão). Não introduzir outra biblioteca de dialog.

- [ ] **Step 4: Escrever a página `documentos/page.tsx`**

Criar `src/app/(app)/pacientes/[id]/documentos/page.tsx`:

```tsx
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ConsentCards } from "@/components/consents/consent-cards";
import { getConsentPageDataAction } from "../actions";

export default async function ConsentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getConsentPageDataAction(id);
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

  return (
    <div>
      <PageHeader
        title={`Documentos — ${data.patientName}`}
        description="Consentimentos assinados pelo paciente."
      />
      <div className="px-6 pb-6">
        <ConsentCards
          contactId={id}
          patientName={data.patientName}
          professionalMissing={data.professionalMissing}
          headerLines={data.headerLines}
          docs={data.docs}
          initialConsents={data.consents}
        />
      </div>
    </div>
  );
}
```

> Confirmar que `@/components/layout/page-header` exporta `PageHeader` (usado em `src/app/(app)/pacientes/[id]/page.tsx`). Se o nome/caminho divergir, seguir o que aquela página importa.

- [ ] **Step 5: Adicionar o link "Documentos" na ficha do paciente**

Em `src/components/patients/patient-detail-client.tsx`, dentro do `<section>` "Dados do paciente", trocar o bloco do botão "Editar dados" por um par de ações:

```tsx
        <div className="flex items-center gap-2">
          <Link
            href={`/pacientes/${patient.id}/documentos`}
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-muted/40"
          >
            Documentos
          </Link>
          <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            Editar dados
          </Button>
        </div>
```

(`Link` já está importado no arquivo.)

- [ ] **Step 6: Rodar a suíte + typecheck + lint**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/components/consents "src/app/(app)/pacientes"`
Expected: PASS (suíte inteira verde).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/components/consents/consent-cards.tsx "src/app/(app)/pacientes/[id]/documentos/page.tsx" src/components/patients/patient-detail-client.tsx
git commit -m "feat(consents): página de documentos do paciente + cards de assinatura + QR"
```

---

## Task 11: Rota pública `/assinar/[token]` + rate limit

**Files:**
- Create: `src/app/assinar/[token]/page.tsx`
- Create: `src/app/assinar/actions.ts`
- Create: `src/components/consents/public-consent-form.tsx`
- Create: `docs/ops/consent-link-secret.md`
- Modify: `src/lib/rate-limit.ts` (`withinConsentSignRateLimit`)
- Modify: `wrangler.toml` (binding `CONSENT_SIGN_RATE_LIMIT`)

**Interfaces:**
- Consumes: `verifyConsentToken` (Task 6); `renderTemplate`, `formatBrDate` (Task 5); `createServiceRoleSupabaseClient` from `@/lib/supabase/service-role`; `getAccountProfessionalIdentity` from `@/lib/supabase/account`; `createSupabaseConsentsRepository` (Task 3); `consents.recordConsent` (Task 4); `ConsentSignForm` (Task 8); `getCloudflareContext` + `headers` (padrão de `src/lib/rate-limit.ts`).
- Produces:
  - `withinConsentSignRateLimit(): Promise<boolean>`
  - `submitPublicConsentAction(token: string, formData: FormData): Promise<{ ok: true } | { ok: false; error: string }>`
  - `PublicConsentForm({ token, documentTitle, headerLines, paragraphs, defaultSignerName }: { token: string; documentTitle: string; headerLines: string[]; paragraphs: string[]; defaultSignerName: string })`

- [ ] **Step 1: Adicionar `withinConsentSignRateLimit` em `src/lib/rate-limit.ts`**

Ao fim do arquivo:

```ts
/**
 * Per-IP rate limit for the public consent-signing route (/assinar). Backed by
 * the CONSENT_SIGN_RATE_LIMIT Workers binding. Fails open when unavailable.
 */
export async function withinConsentSignRateLimit(): Promise<boolean> {
  let limiter: RateLimiter | undefined;
  try {
    limiter = (getCloudflareContext().env as Record<string, unknown>)
      .CONSENT_SIGN_RATE_LIMIT as RateLimiter | undefined;
  } catch {
    return true;
  }
  if (!limiter) return true;

  const ip = (await headers()).get("cf-connecting-ip") ?? "unknown";
  const { success } = await limiter.limit({ key: ip });
  return success;
}
```

- [ ] **Step 2: Adicionar o binding em `wrangler.toml`**

Após o bloco `[[ratelimit]]` existente do `BOOKING_RATE_LIMIT`:

```toml
# Per-IP rate limit for the public consent-signing route (/assinar). 5
# submissions per minute per IP.
[[ratelimit]]
name = "CONSENT_SIGN_RATE_LIMIT"
namespace_id = "1002"
simple = { limit = 5, period = 60 }
```

- [ ] **Step 3: Escrever `src/app/assinar/actions.ts`**

```ts
"use server";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createSupabaseConsentsRepository } from "@/modules/consents/repository.supabase";
import * as consents from "@/modules/consents/service";
import { verifyConsentToken } from "@/modules/consents/token";
import { withinConsentSignRateLimit } from "@/lib/rate-limit";

const CONSENT_BUCKET = "signed-consents";
const MAX_CONSENT_PDF_BYTES = 2 * 1024 * 1024;

export async function submitPublicConsentAction(
  token: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await withinConsentSignRateLimit())) {
    return { ok: false, error: "Muitas tentativas. Aguarde um minuto e tente novamente." };
  }

  const claims = await verifyConsentToken(token);
  if (!claims) return { ok: false, error: "Este link expirou ou é inválido." };

  const file = formData.get("file");
  if (!(file instanceof Blob)) return { ok: false, error: "Arquivo inválido." };
  if (file.type !== "application/pdf") return { ok: false, error: "O arquivo não é um PDF." };
  if (file.size > MAX_CONSENT_PDF_BYTES) {
    return { ok: false, error: "O documento excede o tamanho permitido." };
  }
  const signerName = (formData.get("signerName") as string | null)?.trim();
  if (!signerName) return { ok: false, error: "Informe o nome de quem assina." };

  const supabase = createServiceRoleSupabaseClient();
  const path = `${claims.accountId}/${claims.contactId}/${claims.kind}-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from(CONSENT_BUCKET)
    .upload(path, file, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("[assinar/actions] upload", uploadError);
    return { ok: false, error: "Não foi possível salvar o documento. Tente novamente." };
  }

  try {
    await consents.recordConsent(createSupabaseConsentsRepository(supabase), claims.accountId, {
      contactId: claims.contactId,
      kind: claims.kind,
      storagePath: path,
      signerName,
      signedVia: "link",
    });
  } catch {
    await supabase.storage.from(CONSENT_BUCKET).remove([path]);
    return { ok: false, error: "Não foi possível registrar a assinatura. Tente novamente." };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Escrever `src/components/consents/public-consent-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ConsentSignForm } from "./consent-sign-form";
import { submitPublicConsentAction } from "@/app/assinar/actions";

export function PublicConsentForm(props: {
  token: string;
  documentTitle: string;
  headerLines: string[];
  paragraphs: string[];
  defaultSignerName: string;
}) {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="rounded-md bg-green-50 p-4 text-sm text-green-800">
        Assinatura registrada. Você já pode devolver o aparelho à profissional.
      </p>
    );
  }

  return (
    <ConsentSignForm
      documentTitle={props.documentTitle}
      headerLines={props.headerLines}
      paragraphs={props.paragraphs}
      defaultSignerName={props.defaultSignerName}
      submitLabel="Confirmar assinatura"
      onComplete={async ({ pdfBytes, signerName }) => {
        const fd = new FormData();
        fd.set("file", new Blob([pdfBytes], { type: "application/pdf" }), "consent.pdf");
        fd.set("signerName", signerName);
        return submitPublicConsentAction(props.token, fd);
      }}
      onDone={() => setDone(true)}
    />
  );
}
```

- [ ] **Step 5: Escrever `src/app/assinar/[token]/page.tsx`**

```tsx
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { getAccountProfessionalIdentity } from "@/lib/supabase/account";
import { verifyConsentToken } from "@/modules/consents/token";
import { renderTemplate, formatBrDate } from "@/modules/consents/templates";
import { PublicConsentForm } from "@/components/consents/public-consent-form";

function Invalid() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <p className="max-w-sm text-center text-muted-foreground">
        Este link expirou ou é inválido. Peça um novo à clínica.
      </p>
    </div>
  );
}

export default async function PublicConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claims = await verifyConsentToken(token);
  if (!claims) return <Invalid />;

  const supabase = createServiceRoleSupabaseClient();
  let patientName: string;
  let identity: Awaited<ReturnType<typeof getAccountProfessionalIdentity>>;
  try {
    const { data, error } = await supabase
      .from("contacts")
      .select("name")
      .eq("id", claims.contactId)
      .eq("account_id", claims.accountId)
      .single();
    if (error || !data) return <Invalid />;
    patientName = data.name;
    identity = await getAccountProfessionalIdentity(supabase, claims.accountId);
  } catch {
    return <Invalid />;
  }

  const t = renderTemplate(claims.kind, {
    pacienteNome: patientName,
    pacienteCpf: null,
    pacienteNascimento: null,
    clinicaNome: identity.name,
    profissionalNome: identity.professionalName,
    profissionalConselho: identity.councilId,
    data: formatBrDate(new Date()),
  });

  const headerLines = [
    identity.name,
    identity.professionalName
      ? `${identity.professionalName}${identity.councilId ? ` - ${identity.councilId}` : ""}`
      : null,
    `Paciente: ${patientName}`,
  ].filter((l): l is string => Boolean(l));

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-bold">{t.title}</h1>
      <PublicConsentForm
        token={token}
        documentTitle={t.title}
        headerLines={headerLines}
        paragraphs={t.paragraphs}
        defaultSignerName={patientName}
      />
    </div>
  );
}
```

- [ ] **Step 6: Escrever `docs/ops/consent-link-secret.md`**

```markdown
# CONSENT_LINK_SECRET

Segredo HMAC que assina os tokens dos links públicos de assinatura de
consentimento (`/assinar/[token]`). Sem ele configurado em produção, a
rota falha fechada (nenhum link é aceito).

- **Local:** adicionar `CONSENT_LINK_SECRET=<string aleatória longa>` ao
  `.env.local`. Sem isso, `next dev` usa um fallback fixo (não serve para
  produção).
- **Produção (Cloudflare):** Workers & Pages → `arkdoctor` → Settings →
  Variables and Secrets → adicionar `CONSENT_LINK_SECRET` como **Secret**.
  Mesmo procedimento dos demais segredos após a Git integration.
- Gerar um valor: `openssl rand -base64 48`.
- Trocar o segredo invalida todos os links já enviados (aceitável — são de
  vida curta, 48 h).
```

- [ ] **Step 7: Typecheck + lint + suíte**

Run: `npx tsc --noEmit && npx eslint src/app/assinar src/lib/rate-limit.ts src/components/consents && npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/assinar src/components/consents/public-consent-form.tsx src/lib/rate-limit.ts wrangler.toml docs/ops/consent-link-secret.md
git commit -m "feat(consents): rota pública /assinar/[token] + rate limit por IP"
```

---

## Task 12: Purga de Storage na exclusão do paciente

**Files:**
- Modify: `src/app/(app)/pacientes/actions.ts` (`deletePatientAction`)

**Interfaces:**
- Consumes: `createSupabaseConsentsRepository` (Task 3); `supabase` + `accountId` já disponíveis em `deletePatientAction` via `getCrmRepoAndAccount()`.
- Produces: nenhuma nova assinatura pública — só amplia o efeito da action existente.

- [ ] **Step 1: Adicionar o import**

Em `src/app/(app)/pacientes/actions.ts`, junto do import de `createSupabaseTreatmentsRepository`:

```ts
import { createSupabaseConsentsRepository } from "@/modules/consents/repository.supabase";
```

- [ ] **Step 2: Purgar os PDFs de consentimento antes de `crm.deleteContact`**

Em `deletePatientAction`, logo após o bloco que remove as fotos de `treatment-photos` e antes de `await crm.deleteContact(repo, accountId, id);`:

```ts
  const consentsRepo = createSupabaseConsentsRepository(supabase);
  const consentRows = await consentsRepo.listConsentsForContact(accountId, id);
  if (consentRows.length > 0) {
    const { error } = await supabase.storage
      .from("signed-consents")
      .remove(consentRows.map((r) => r.storagePath));
    if (error) {
      console.error("[pacientes/actions] consent storage remove", error);
      throw new Error("Não foi possível remover os documentos do armazenamento. Tente novamente.");
    }
  }
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/pacientes/actions.ts"`
Expected: PASS.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npx vitest run`
Expected: PASS — todos os testes verdes.

- [ ] **Step 5: Build de produção**

Run: `npm run build`
Expected: PASS — sem erros de tipo/bundle.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/pacientes/actions.ts"
git commit -m "feat(consents): purgar PDFs de consentimento ao excluir paciente"
```

---

## Smoke-test manual (usuário — pré-requisito: migração 0013 aplicada + `CONSENT_LINK_SECRET` definido)

1. `npm run dev`. Abrir um paciente → botão **Documentos**.
2. Card "Pendente" → **Assinar** → texto aparece, desenhar no quadro, confirmar → card vira "Assinado em DD/MM"; **Ver PDF** abre o PDF numa aba, com a assinatura e o rodapé de data/hora.
3. **Assinar novamente** no mesmo card → 2ª linha; o card mostra a mais recente.
4. **Excluir** → some da tela; conferir no Supabase Storage que o objeto sumiu.
5. **Enviar link** → dialog com QR + URL. Abrir a URL no celular (ou outra aba) → assinar → mensagem de sucesso; voltar ao card e recarregar → aparece "Assinado" com `signed_via = 'link'` (checar na tabela `signed_consents`).
6. Editar a URL do link (trocar um caractere) → abrir → tela "Este link expirou ou é inválido."
7. Excluir o paciente → conferir que os PDFs de `signed-consents/<accountId>/<contactId>/` sumiram do bucket.

---

## Self-Review

**1. Cobertura do spec:**

| Requisito do spec | Task |
|---|---|
| Migração 0013 `signed_consents` + RLS + bucket privado | 1 |
| Path `{account_id}/{contact_id}/{kind}-{timestamp}.pdf` | 9 (`uploadConsentAction`), 11 (`submitPublicConsentAction`) |
| Signed URLs ~1h | 9 (`listConsentsAction`, usa `SIGNED_URL_TTL`) |
| Sem unicidade por (contact, kind); reassinar cria linha nova; card mostra a mais recente | 3 (sem constraint), 10 (`latestFor`) |
| Purga de Storage na exclusão de paciente | 12 |
| Módulo `src/modules/consents/` espelhando `treatments` | 2–6 |
| `recordConsent` valida kind/signerName/signedVia | 4 |
| Templates de texto fixo com `{{placeholders}}`; token desconhecido → `—` | 5 |
| Placeholders só de dados existentes (paciente, clínica, identidade profissional, data) | 5 (`TemplateContext`), 9 (`getConsentPageDataAction` monta o contexto) |
| Corpo provisório "[Silvana vai fornecer o texto]" | 5 |
| PDF client-side via `pdf-lib` + `signature_pad`, lazy-load | 7, 8 |
| Helvetica/WinAnsi, sem fonte embutida | 7 |
| Helper de quebra/paginação testado | 7 (`pdf.test.ts`) |
| Rodapé "Assinado eletronicamente por X em DD/MM/AAAA HH:mm" | 7 (`buildConsentPdf`), 8 (`formatBrDateTime`) |
| Revalidação `application/pdf` + tamanho < 2MB no servidor | 9, 11 |
| "Ver PDF" via `window.open` (sem mexer no CSP) | 10 |
| Fluxo inline em `/pacientes/[id]/documentos` com 3 cards | 10 |
| Estado derivado só da existência de linha | 10 (`latestFor`) |
| Dialog Base UI com nome + texto + pad | 8, 10 |
| Ponto de entrada a partir da ficha do paciente | 10 |
| Token HMAC stateless `{accountId, contactId, kind, exp}`, `crypto.subtle`, exp 48h | 6, 9 (`CONSENT_LINK_TTL_SECONDS`) |
| Env var `CONSENT_LINK_SECRET` + doc em `docs/ops/` | 6, 11 |
| "Enviar link" gera URL + QR via `qrcode` SVG inline | 10 |
| Rota pública `/assinar/[token]` + `assinar/actions.ts` service-role | 11 |
| Token inválido/expirado → tela neutra sem vazar | 11 (`Invalid`) |
| Rate limit por IP, sem Turnstile | 11 |
| `signedVia` `'inline'` vs `'link'` conforme o fluxo | 9, 11 |
| Insert falha após upload → remove objeto órfão | 9, 11 |
| Aviso quando identidade profissional ausente, sem bloquear | 10 (`professionalMissing`) |
| Fora de escopo: sem status estruturado / dashboard / bloqueio de agenda / versionamento de template / editor em configuracoes | respeitado — nenhuma task os implementa |

**2. Placeholders:** nenhum "TBD"/"implementar depois". Os textos "[Texto ... a ser fornecido pela profissional.]" são conteúdo de template intencional e documentado no spec, não lacunas do plano.

**3. Consistência de tipos:** `ConsentKind`/`CONSENT_KINDS` (schemas) usados igual em types/repository/service/actions/token/templates. `SignedConsent` com os mesmos campos no memory e no supabase repo. `listConsentsAction` retorna `{ id, kind, signerName, signedAt, url }` e `ConsentCards` consome via `Awaited<ReturnType<typeof listConsentsAction>>[number]`. `ConsentSignFormProps.onComplete` retorna `{ ok: boolean; error?: string }` — os dois callers (`ConsentCards.handleComplete`, `PublicConsentForm`) retornam esse shape; `submitPublicConsentAction` retorna `{ ok: true } | { ok: false; error }`, compatível. `buildConsentPdf` recebe `ConsentPdfInput` idêntico ao objeto montado em `ConsentSignForm`.

**Ponto de atenção para o executor:** a API exata de `@base-ui/react` `Dialog` (Task 10) deve ser copiada de `src/components/patients/patient-form-dialog.tsx` — não assumir os nomes `Root/Portal/Backdrop/Popup/Title` sem conferir.
