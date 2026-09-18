# Despesas parceladas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cadastrar uma despesa parcelada (ex.: boleto 3x) que gera sozinha um lançamento por mês.

**Architecture:** Nova tabela `installment_plans`; `financial_entries` ganha `plan_id` e `installment_number`. Ao criar a compra, o serviço gera N lançamentos de despesa com `occurred_at` = vencimento de cada parcela (o dashboard já filtra por período, então cada parcela só conta no mês dela). Exclusão em lote por compra ("futuras" ou "todas").

**Tech Stack:** Next.js (server actions), Supabase, zod, vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-despesas-parceladas-design.md`

## Global Constraints

- Toda UI e mensagens de erro em pt-BR.
- Parcelas: inteiro de 2 a 48; categoria obrigatória; só despesas.
- Valor da parcela = total/N em centavos; a última parcela absorve a diferença.
- Vencimento: mês a mês; se o dia não existe no mês, usa o último dia do mês.
- Descrição da parcela: `"<descrição> (2/3)"`.
- Não alterar as consultas de totais existentes (dashboard/histórico).
- Desvios do spec: atomicidade via inserção em lote + `delete` de compensação (sem RPC); detalhe da compra dentro do `EditEntryDialog` (sem tela nova).

---

### Task 1: Migração e tipos do banco

**Files:**
- Create: `supabase/migrations/0018_installment_plans.sql`
- Modify: `src/lib/supabase/database.types.ts` (tabela `financial_entries`, ~linha 384; novo bloco `installment_plans`)

**Interfaces:**
- Produces: tabela `installment_plans` (`id`, `account_id`, `description`, `category`, `total_amount`, `installments`, `first_due_date`, `created_at`); colunas `financial_entries.plan_id uuid null`, `financial_entries.installment_number int null`.

- [ ] **Step 1: Escrever a migração**

```sql
create table installment_plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  description text,
  category text not null,
  total_amount numeric(10,2) not null check (total_amount > 0),
  installments int not null check (installments between 2 and 48),
  first_due_date date not null,
  created_at timestamptz not null default now()
);

alter table installment_plans enable row level security;

create policy "account members can manage installment_plans"
  on installment_plans for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

alter table financial_entries
  add column plan_id uuid references installment_plans(id) on delete set null,
  add column installment_number int,
  add constraint financial_entries_plan_only_expense
    check (plan_id is null or type = 'expense');

create index financial_entries_plan_id_idx on financial_entries(plan_id) where plan_id is not null;
```

- [ ] **Step 2: Atualizar `database.types.ts`**

Em `financial_entries` adicionar, nas três seções (`Row`: `plan_id: string | null` e `installment_number: number | null`; `Insert`/`Update`: `plan_id?: string | null` e `installment_number?: number | null`). Em `Relationships` adicionar:

```ts
          {
            foreignKeyName: "financial_entries_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "installment_plans"
            referencedColumns: ["id"]
          },
```

Antes de `pipeline_stages` (ordem alfabética), adicionar:

```ts
      installment_plans: {
        Row: {
          account_id: string
          category: string
          created_at: string
          description: string | null
          first_due_date: string
          id: string
          installments: number
          total_amount: number
        }
        Insert: {
          account_id: string
          category: string
          created_at?: string
          description?: string | null
          first_due_date: string
          id?: string
          installments: number
          total_amount: number
        }
        Update: {
          account_id?: string
          category?: string
          created_at?: string
          description?: string | null
          first_due_date?: string
          id?: string
          installments?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "installment_plans_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
```

- [ ] **Step 3: Aplicar a migração** (ação em banco real: **pedir confirmação ao usuário antes**) — `npx supabase db push` (projeto já linkado, ver memória `arkdoctor_supabase_project`). Esperado: migração 0018 aplicada sem erro. Nota: a 0017 (drop photos) também está pendente e NÃO deve ser aplicada junto sem o usuário esvaziar o bucket — se `db push` listar a 0017, parar e perguntar.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0018_installment_plans.sql src/lib/supabase/database.types.ts
git commit -m "feat(financeiro): tabela installment_plans e colunas de parcela"
```

---

### Task 2: Cálculo das parcelas (função pura)

**Files:**
- Create: `src/modules/finance/installments.ts`
- Test: `src/modules/finance/installments.test.ts`

**Interfaces:**
- Produces: `buildInstallments(totalAmount: number, count: number, firstDueDate: string): { number: number; amount: number; dueDate: string }[]` (datas `YYYY-MM-DD`).

- [ ] **Step 1: Teste falhando**

```ts
import { describe, it, expect } from "vitest";
import { buildInstallments } from "./installments";

describe("buildInstallments", () => {
  it("divide em centavos e a última parcela absorve a diferença", () => {
    const parcels = buildInstallments(100, 3, "2026-10-10");
    expect(parcels.map((p) => p.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(parcels.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it("soma exatamente o total", () => {
    const parcels = buildInstallments(1000.01, 7, "2026-01-05");
    const sum = parcels.reduce((s, p) => s + Math.round(p.amount * 100), 0);
    expect(sum).toBe(100001);
  });

  it("avança mês a mês mantendo o dia", () => {
    const parcels = buildInstallments(300, 3, "2026-10-10");
    expect(parcels.map((p) => p.dueDate)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
  });

  it("usa o último dia do mês quando o dia não existe", () => {
    const parcels = buildInstallments(300, 3, "2026-01-31");
    expect(parcels.map((p) => p.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("vira o ano", () => {
    const parcels = buildInstallments(200, 2, "2026-12-15");
    expect(parcels.map((p) => p.dueDate)).toEqual(["2026-12-15", "2027-01-15"]);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/modules/finance/installments.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
export interface InstallmentParcel {
  number: number;
  amount: number;
  dueDate: string;
}

export function buildInstallments(
  totalAmount: number,
  count: number,
  firstDueDate: string,
): InstallmentParcel[] {
  const [year, month, day] = firstDueDate.split("-").map(Number);
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / count);

  return Array.from({ length: count }, (_, i) => {
    const cents = i === count - 1 ? totalCents - baseCents * (count - 1) : baseCents;
    const lastDay = new Date(Date.UTC(year, month - 1 + i + 1, 0)).getUTCDate();
    const due = new Date(Date.UTC(year, month - 1 + i, Math.min(day, lastDay)));
    return { number: i + 1, amount: cents / 100, dueDate: due.toISOString().slice(0, 10) };
  });
}
```

- [ ] **Step 4:** rodar o teste → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/finance/installments.ts src/modules/finance/installments.test.ts
git commit -m "feat(financeiro): cálculo das parcelas"
```

---

### Task 3: Tipos, schema, repositórios e serviço

**Files:**
- Modify: `src/modules/finance/types.ts`, `schemas.ts`, `repository.ts`, `repository.memory.ts`, `repository.supabase.ts`, `service.ts`
- Test: `src/modules/finance/service.test.ts` (acrescentar `describe`)

**Interfaces:**
- Consumes: `buildInstallments` (Task 2).
- Produces:
  - `FinancialEntry` ganha `planId: string | null; installmentNumber: number | null`.
  - `createInstallmentPurchaseInputSchema` → `{ description?: string; category: string; totalAmount: number; installments: number; firstDueDate: string }`.
  - `FinanceRepository.insertInstallmentPurchase(accountId, plan: { description: string | null; category: string; totalAmount: number; installments: number; firstDueDate: string }, entries: { amount: number; description: string; occurredAt: string; installmentNumber: number }[]): Promise<FinancialEntry[]>`
  - `FinanceRepository.listEntriesByPlan(accountId, planId): Promise<FinancialEntry[]>`
  - `FinanceRepository.deleteEntriesByPlan(accountId, planId, afterDate: string | null): Promise<void>` (`null` = todas; senão só `occurredAt > afterDate`)
  - `FinanceRepository.deleteInstallmentPlan(accountId, planId): Promise<void>`
  - Serviço: `createInstallmentPurchase(repo, accountId, rawInput): Promise<FinancialEntry[]>`; `getInstallmentPlanSummary(repo, accountId, planId, today): Promise<InstallmentPlanSummary>`; `deleteInstallmentPlanEntries(repo, accountId, planId, scope: "future" | "all", today): Promise<void>`.
  - `InstallmentPlanSummary = { planId: string; totalAmount: number; count: number; elapsedCount: number; elapsedAmount: number; remainingAmount: number }`.

- [ ] **Step 1: Testes falhando** (acrescentar ao fim de `service.test.ts`; adicionar os imports novos ao topo)

```ts
import {
  createInstallmentPurchase,
  getInstallmentPlanSummary,
  deleteInstallmentPlanEntries,
} from "./service";

describe("despesas parceladas", () => {
  const input = {
    description: "Boleto fornecedor",
    category: "Material",
    totalAmount: 300,
    installments: 3,
    firstDueDate: "2026-10-10",
  };

  it("gera uma despesa por parcela com o vencimento e a descrição certos", async () => {
    const repo = createInMemoryFinanceRepository();
    const entries = await createInstallmentPurchase(repo, "acc-1", input);

    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.type === "expense" && e.planId === entries[0].planId)).toBe(true);
    expect(entries.map((e) => e.occurredAt)).toEqual(["2026-10-10", "2026-11-10", "2026-12-10"]);
    expect(entries.map((e) => e.description)).toEqual([
      "Boleto fornecedor (1/3)",
      "Boleto fornecedor (2/3)",
      "Boleto fornecedor (3/3)",
    ]);
  });

  it("cada parcela só aparece no período do seu mês", async () => {
    const repo = createInMemoryFinanceRepository();
    await createInstallmentPurchase(repo, "acc-1", input);
    const nov = await listFinancialEntries(repo, "acc-1", { from: "2026-11-01", to: "2026-11-30" });
    expect(nov).toHaveLength(1);
    expect(nov[0].installmentNumber).toBe(2);
  });

  it("rejeita 1 parcela, 49 parcelas e categoria vazia", async () => {
    const repo = createInMemoryFinanceRepository();
    await expect(createInstallmentPurchase(repo, "acc-1", { ...input, installments: 1 })).rejects.toThrow();
    await expect(createInstallmentPurchase(repo, "acc-1", { ...input, installments: 49 })).rejects.toThrow();
    await expect(createInstallmentPurchase(repo, "acc-1", { ...input, category: "" })).rejects.toThrow();
  });

  it("resumo separa vencidas e restantes", async () => {
    const repo = createInMemoryFinanceRepository();
    const [first] = await createInstallmentPurchase(repo, "acc-1", input);
    const summary = await getInstallmentPlanSummary(repo, "acc-1", first.planId!, "2026-11-15");
    expect(summary).toEqual({
      planId: first.planId,
      totalAmount: 300,
      count: 3,
      elapsedCount: 2,
      elapsedAmount: 200,
      remainingAmount: 100,
    });
  });

  it("excluir 'futuras' mantém as já vencidas", async () => {
    const repo = createInMemoryFinanceRepository();
    const [first] = await createInstallmentPurchase(repo, "acc-1", input);
    await deleteInstallmentPlanEntries(repo, "acc-1", first.planId!, "future", "2026-11-15");
    const left = await repo.listEntriesByPlan("acc-1", first.planId!);
    expect(left.map((e) => e.installmentNumber)).toEqual([1, 2]);
  });

  it("excluir 'todas' remove tudo", async () => {
    const repo = createInMemoryFinanceRepository();
    const [first] = await createInstallmentPurchase(repo, "acc-1", input);
    await deleteInstallmentPlanEntries(repo, "acc-1", first.planId!, "all", "2026-11-15");
    expect(await repo.listEntriesByPlan("acc-1", first.planId!)).toEqual([]);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/modules/finance` → FAIL.

- [ ] **Step 3: `types.ts`** — em `FinancialEntry` adicionar após `description`:

```ts
  planId: string | null;
  installmentNumber: number | null;
```

E ao fim do arquivo:

```ts
export interface InstallmentPlanSummary {
  planId: string;
  totalAmount: number;
  count: number;
  elapsedCount: number;
  elapsedAmount: number;
  remainingAmount: number;
}
```

- [ ] **Step 4: `schemas.ts`** — adicionar após `createFinancialEntryInputSchema`:

```ts
export const createInstallmentPurchaseInputSchema = z.object({
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().min(1, "Categoria é obrigatória").max(200),
  totalAmount: z.number().positive("Valor deve ser maior que zero"),
  installments: z.number().int().min(2, "Mínimo de 2 parcelas").max(48, "Máximo de 48 parcelas"),
  firstDueDate: isoDate,
});
export type CreateInstallmentPurchaseInput = z.infer<typeof createInstallmentPurchaseInputSchema>;
```

- [ ] **Step 5: `repository.ts`** — adicionar à interface:

```ts
  insertInstallmentPurchase(
    accountId: string,
    plan: {
      description: string | null;
      category: string;
      totalAmount: number;
      installments: number;
      firstDueDate: string;
    },
    entries: {
      amount: number;
      description: string;
      occurredAt: string;
      installmentNumber: number;
    }[],
  ): Promise<FinancialEntry[]>;
  listEntriesByPlan(accountId: string, planId: string): Promise<FinancialEntry[]>;
  deleteEntriesByPlan(accountId: string, planId: string, afterDate: string | null): Promise<void>;
  deleteInstallmentPlan(accountId: string, planId: string): Promise<void>;
```

- [ ] **Step 6: `repository.memory.ts`** — no objeto de entrada existente em `insertFinancialEntry` adicionar `planId: null, installmentNumber: null,`. Adicionar `const plans = new Set<string>();` junto de `entries` e os métodos:

```ts
    async insertInstallmentPurchase(accountId, plan, planEntries) {
      const planId = crypto.randomUUID();
      plans.add(planId);
      return planEntries.map((input) => {
        const entry: FinancialEntry = {
          id: crypto.randomUUID(),
          accountId,
          type: "expense",
          amount: input.amount,
          defaultAmount: null,
          category: plan.category,
          procedureId: null,
          appointmentId: null,
          description: input.description,
          occurredAt: input.occurredAt,
          planId,
          installmentNumber: input.installmentNumber,
          createdAt: new Date().toISOString(),
        };
        entries.set(entry.id, entry);
        return entry;
      });
    },

    async listEntriesByPlan(accountId, planId) {
      return [...entries.values()]
        .filter((e) => e.accountId === accountId && e.planId === planId)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },

    async deleteEntriesByPlan(accountId, planId, afterDate) {
      for (const [id, e] of entries) {
        if (e.accountId !== accountId || e.planId !== planId) continue;
        if (afterDate === null || e.occurredAt > afterDate) entries.delete(id);
      }
    },

    async deleteInstallmentPlan(_accountId, planId) {
      plans.delete(planId);
    },
```

- [ ] **Step 7: `repository.supabase.ts`** — em `toFinancialEntry` adicionar `planId: row.plan_id, installmentNumber: row.installment_number,` (antes de `occurredAt`). Adicionar os métodos:

```ts
    async insertInstallmentPurchase(accountId, plan, planEntries) {
      const { data: planRow, error: planError } = await supabase
        .from("installment_plans")
        .insert({
          account_id: accountId,
          description: plan.description,
          category: plan.category,
          total_amount: plan.totalAmount,
          installments: plan.installments,
          first_due_date: plan.firstDueDate,
        })
        .select("id")
        .single();
      if (planError) throwDbError(planError);

      const { data, error } = await supabase
        .from("financial_entries")
        .insert(
          planEntries.map((e) => ({
            account_id: accountId,
            type: "expense",
            amount: e.amount,
            category: plan.category,
            description: e.description,
            occurred_at: e.occurredAt,
            plan_id: planRow.id,
            installment_number: e.installmentNumber,
          })),
        )
        .select("*");
      if (error) {
        await supabase.from("installment_plans").delete().eq("id", planRow.id);
        throwDbError(error);
      }
      return data.map(toFinancialEntry);
    },

    async listEntriesByPlan(accountId, planId) {
      const { data, error } = await supabase
        .from("financial_entries")
        .select("*")
        .eq("account_id", accountId)
        .eq("plan_id", planId)
        .order("occurred_at", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toFinancialEntry);
    },

    async deleteEntriesByPlan(accountId, planId, afterDate) {
      let query = supabase
        .from("financial_entries")
        .delete()
        .eq("account_id", accountId)
        .eq("plan_id", planId);
      if (afterDate !== null) query = query.gt("occurred_at", afterDate);
      const { error } = await query;
      if (error) throwDbError(error);
    },

    async deleteInstallmentPlan(accountId, planId) {
      const { error } = await supabase
        .from("installment_plans")
        .delete()
        .eq("account_id", accountId)
        .eq("id", planId);
      if (error) throwDbError(error);
    },
```

- [ ] **Step 8: `service.ts`** — importar `createInstallmentPurchaseInputSchema` e `buildInstallments` (`import { buildInstallments } from "./installments";`) e `InstallmentPlanSummary`; adicionar:

```ts
export async function createInstallmentPurchase(
  repo: FinanceRepository,
  accountId: string,
  rawInput: unknown,
): Promise<FinancialEntry[]> {
  const input = parseOrThrow(createInstallmentPurchaseInputSchema, rawInput);
  const parcels = buildInstallments(input.totalAmount, input.installments, input.firstDueDate);
  const base = input.description ?? input.category;

  return repo.insertInstallmentPurchase(
    accountId,
    {
      description: input.description ?? null,
      category: input.category,
      totalAmount: input.totalAmount,
      installments: input.installments,
      firstDueDate: input.firstDueDate,
    },
    parcels.map((p) => ({
      amount: p.amount,
      description: `${base} (${p.number}/${input.installments})`,
      occurredAt: p.dueDate,
      installmentNumber: p.number,
    })),
  );
}

export async function getInstallmentPlanSummary(
  repo: FinanceRepository,
  accountId: string,
  planId: string,
  today: string,
): Promise<InstallmentPlanSummary> {
  const entries = await repo.listEntriesByPlan(accountId, planId);
  const elapsed = entries.filter((e) => e.occurredAt <= today);
  const sum = (list: FinancialEntry[]) =>
    Math.round(list.reduce((s, e) => s + e.amount * 100, 0)) / 100;
  return {
    planId,
    totalAmount: sum(entries),
    count: entries.length,
    elapsedCount: elapsed.length,
    elapsedAmount: sum(elapsed),
    remainingAmount: sum(entries.filter((e) => e.occurredAt > today)),
  };
}

export async function deleteInstallmentPlanEntries(
  repo: FinanceRepository,
  accountId: string,
  planId: string,
  scope: "future" | "all",
  today: string,
): Promise<void> {
  await repo.deleteEntriesByPlan(accountId, planId, scope === "all" ? null : today);
  const left = await repo.listEntriesByPlan(accountId, planId);
  if (left.length === 0) await repo.deleteInstallmentPlan(accountId, planId);
}
```

- [ ] **Step 9:** `npx vitest run src/modules/finance` → PASS; `npx tsc --noEmit` → sem erros. Se algum teste/fixture fora do módulo construir `FinancialEntry` literal (ex.: `dashboard`, `agenda`), acrescentar `planId: null, installmentNumber: null`.

- [ ] **Step 10: Commit**

```bash
git add src/modules/finance
git commit -m "feat(financeiro): serviço e repositórios de despesas parceladas"
```

---

### Task 4: Server actions

**Files:**
- Modify: `src/app/(app)/financeiro/actions.ts`

**Interfaces:**
- Consumes: serviço da Task 3.
- Produces: `createInstallmentPurchaseAction(input: unknown)`, `getInstallmentPlanSummaryAction(planId: string)`, `deleteInstallmentPlanEntriesAction(planId: string, scope: "future" | "all")`.

- [ ] **Step 1: Adicionar ao fim do arquivo**

```ts
const todayIso = () => new Date().toISOString().slice(0, 10);

export async function createInstallmentPurchaseAction(input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const entries = await finance.createInstallmentPurchase(repo, accountId, input);
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  return entries;
}

export async function getInstallmentPlanSummaryAction(planId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  return finance.getInstallmentPlanSummary(repo, accountId, planId, todayIso());
}

export async function deleteInstallmentPlanEntriesAction(
  planId: string,
  scope: "future" | "all",
) {
  const { repo, accountId } = await getRepoAndAccount();
  await finance.deleteInstallmentPlanEntries(repo, accountId, planId, scope, todayIso());
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
}
```

- [ ] **Step 2:** `npx tsc --noEmit` → OK.
- [ ] **Step 3: Commit** — `git add "src/app/(app)/financeiro/actions.ts" && git commit -m "feat(financeiro): actions de despesas parceladas"`

---

### Task 5: UI — "Parcelar" no novo lançamento

**Files:**
- Modify: `src/components/finance/new-entry-dialog.tsx`

**Interfaces:**
- Consumes: `createInstallmentPurchaseAction` (Task 4).

- [ ] **Step 1: Estado** — importar `createInstallmentPurchaseAction` junto de `createFinancialEntryAction`; adicionar estados:

```tsx
  const [installmentsOn, setInstallmentsOn] = useState(false);
  const [installments, setInstallments] = useState("3");
```

Em `resetForm` adicionar `setInstallmentsOn(false); setInstallments("3");`. No `onChange` do select de tipo adicionar `setInstallmentsOn(false);`.

- [ ] **Step 2: Submit** — em `handleSubmit`, dentro do `try`, antes do `createFinancialEntryAction` existente:

```tsx
      if (type === "expense" && installmentsOn) {
        await createInstallmentPurchaseAction({
          description: String(formData.get("description") ?? "") || undefined,
          category: String(formData.get("category") ?? ""),
          totalAmount: amountValue,
          installments: Number(installments),
          firstDueDate: String(formData.get("occurredAt") ?? today()),
        });
      } else {
        await createFinancialEntryAction({ /* chamada existente, sem alteração */ });
      }
```

(Mover a chamada existente para dentro do `else`; `setOpen(false); resetForm(); onCreated();` continuam após o if/else.)

- [ ] **Step 3: Campos** — logo após o bloco do campo "Categoria" adicionar (só para despesa):

```tsx
          {type === "expense" && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={installmentsOn}
                  onChange={(e) => setInstallmentsOn(e.target.checked)}
                />
                Parcelar (o valor informado é o total)
              </label>
              {installmentsOn && (
                <div className="space-y-1">
                  <Label htmlFor="installments">Número de parcelas (2 a 48)</Label>
                  <Input
                    id="installments"
                    type="number"
                    min="2"
                    max="48"
                    step="1"
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                  />
                  {Number(installments) >= 2 && Number(amount) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {installments}x de aproximadamente{" "}
                      {formatCurrency(Number(amount) / Number(installments))}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
```

Importar `formatCurrency` de `@/lib/format`. Trocar o rótulo do campo Data por `{installmentsOn ? "Vencimento da 1ª parcela" : "Data"}`.

- [ ] **Step 4: Verificar** — `npx tsc --noEmit` e `npm run lint` sem erros novos.
- [ ] **Step 5: Commit** — `git add src/components/finance/new-entry-dialog.tsx && git commit -m "feat(financeiro): opção Parcelar no novo lançamento"`

---

### Task 6: UI — detalhe da compra e exclusão em lote

**Files:**
- Modify: `src/components/finance/edit-entry-dialog.tsx`

**Interfaces:**
- Consumes: `getInstallmentPlanSummaryAction`, `deleteInstallmentPlanEntriesAction`, `InstallmentPlanSummary`.

- [ ] **Step 1:** importar `useEffect`, as duas actions, `formatCurrency` e o tipo `InstallmentPlanSummary`. **Antes** do `if (!entry) return null;` (regra dos hooks) adicionar:

```tsx
  const [summary, setSummary] = useState<InstallmentPlanSummary | null>(null);
  const planId = entry?.planId ?? null;

  useEffect(() => {
    if (!open || !planId) {
      setSummary(null);
      return;
    }
    getInstallmentPlanSummaryAction(planId).then(setSummary).catch(() => setSummary(null));
  }, [open, planId]);
```

- [ ] **Step 2: Handler** (junto de `handleDelete`):

```tsx
  async function handleDeletePlan(scope: "future" | "all") {
    setError(null);
    try {
      await deleteInstallmentPlanEntriesAction(entry!.planId!, scope);
      onOpenChange(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir parcelas");
    }
  }
```

- [ ] **Step 3: Bloco do resumo** — entre o `</form>` e o `<DialogFooter>`:

```tsx
        {summary && (
          <div className="space-y-2 rounded-md border border-border p-3 text-sm">
            <p className="font-medium">Compra parcelada ({summary.count} parcelas)</p>
            <p className="text-muted-foreground">
              Total {formatCurrency(summary.totalAmount)} · já vencido{" "}
              {formatCurrency(summary.elapsedAmount)} ({summary.elapsedCount}) · restante{" "}
              {formatCurrency(summary.remainingAmount)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => handleDeletePlan("future")}>
                Excluir parcelas futuras
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handleDeletePlan("all")}>
                Excluir todas as parcelas
              </Button>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Verificar** — `npx tsc --noEmit`, `npm run lint`, `npm test` (tudo verde).
- [ ] **Step 5: Commit** — `git add src/components/finance/edit-entry-dialog.tsx && git commit -m "feat(financeiro): detalhe e exclusão em lote da compra parcelada"`

---

### Task 7: Verificação ponta a ponta

- [ ] **Step 1:** Confirmar que `src/modules/dashboard/service.ts` só consome lançamentos por período (grep `occurredAt`/`listFinancialEntries`); se algum ponto somar sem `to`, limitar até hoje e adicionar teste.
- [ ] **Step 2:** Rodar o app (`npm run dev`), logar, criar despesa "R$ 300, 3x, 1ª parcela hoje": conferir 3 lançamentos `(1/3)`,`(2/3)`,`(3/3)` em meses consecutivos; dashboard do mês atual soma só R$ 100; abrir a parcela → resumo correto; "Excluir parcelas futuras" mantém a 1ª.
- [ ] **Step 3:** Testar no celular (largura ~400px) que o dialog não gera rolagem horizontal.
- [ ] **Step 4:** Atualizar `docs/prd/arkdoctor-prd.md` (seção "Estado Atual da Implementação") com uma linha sobre despesas parceladas; commit `docs: registra despesas parceladas no PRD`.
