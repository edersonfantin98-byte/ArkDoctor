# Relatório em PDF via Impressão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the buggy CSV export on the Dashboard with a print-optimized view of the same page, triggered by `window.print()`, so the user can "Save as PDF" from the browser's own print dialog.

**Architecture:** No new route, no new data fetching beyond exposing 3 fields the Dashboard module already computes. Adds `print:` (Tailwind v4) CSS rules to hide the sidebar, interactive controls, and the "Próximos atendimentos" card when printing; extends `DashboardOverview` with `expenseTotal`/`balance`/`revenueExpenseHistory` (already returned internally by `finance.getDashboardMetrics`, just not surfaced); adds a print-only header (clinic name, period, generation timestamp) and a print-only financial summary (Despesa, Saldo, Receita vs. despesas chart) inside the existing `DashboardClient`; rewrites `ExportReportButton` to call `window.print()` instead of building a CSV blob.

**Tech Stack:** Next.js (App Router, Server Components), Tailwind v4 `print:` variant, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-08-24-relatorio-impressao-design.md`

## Global Constraints

- No new PDF library, no server-side rendering of PDFs (Cloudflare Workers runtime can't run headless Chrome).
- No new route/page — the existing `/dashboard` page and its period selector are reused as-is.
- Surgical changes only: don't touch unrelated `globals.css` rules (the `.rbc-*` calendar styles, theme tokens) or unrelated Dashboard cards.

---

### Task 1: Print CSS — hide sidebar and non-printable controls

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/dashboard/dashboard-client.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new (pure className changes) — the page renders without the sidebar and without the period-filter/export-button controls when printed.

- [ ] **Step 1: Hide the sidebar when printing**

In `src/components/layout/sidebar.tsx`, add `print:hidden` to the `<aside>` element's `className` (currently `"flex w-[232px] shrink-0 flex-col bg-sidebar text-sidebar-foreground"`).

- [ ] **Step 2: Hide the period filter controls when printing**

In `src/components/dashboard/dashboard-client.tsx`, add `print:hidden` to the root `<div>` returned by `PeriodFilter` (currently `className="flex flex-wrap items-center gap-2"`).

- [ ] **Step 3: Hide "Próximos atendimentos" when printing**

In `src/components/dashboard/dashboard-client.tsx`, add `print:hidden` to the "Próximos atendimentos" `Card` (the last `Card` in the file, wrapping the `todaysAppointments` table). Per the updated spec, the report replaces this operational detail with the financial summary added in Task 4 — the card itself, and the `todaysAppointments` data it reads, are untouched for the normal (non-print) Dashboard view.

- [ ] **Step 4: Reduce card-splitting across printed pages**

In `src/components/dashboard/dashboard-client.tsx`, add `print:break-inside-avoid` to each of the four metric `<Card>` elements in the `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4` block, and to the `Card` elements in the `grid grid-cols-1 gap-4 lg:grid-cols-3` block (revenue chart card, pipeline-by-stage card).

- [ ] **Step 5: Manually verify**

Run `npm run dev` (skip if already running), open `/dashboard`, open the browser's print preview (Ctrl/Cmd+P). Confirm: sidebar is gone, period-filter buttons/date inputs are gone, "Próximos atendimentos" is gone, cards aren't obviously sliced across a page break.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/sidebar.tsx src/components/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): add print CSS to hide sidebar and interactive controls"
```

---

### Task 2: Expose `expenseTotal`/`balance`/`revenueExpenseHistory` on `DashboardOverview`

**Files:**
- Modify: `src/modules/dashboard/types.ts`
- Modify: `src/modules/dashboard/service.ts`
- Test: `src/modules/dashboard/service.test.ts`

**Interfaces:**
- Consumes: nothing new — `deps.finance.getDashboardMetrics(...)` is already called inside `getDashboardOverview` (`src/modules/dashboard/service.ts:165`); the real implementation (`finance.getDashboardMetrics` in `src/modules/finance/service.ts`) already returns `expenseTotal`, `balance`, `revenueExpenseHistory`, but the narrower `DashboardDeps["finance"]["getDashboardMetrics"]` return type in `dashboard/service.ts` only declares `revenueTotal`/`revenueChangePct`, so those fields are silently dropped today.
- Produces: `DashboardOverview` gains `expenseTotal: number`, `balance: number`, `revenueExpenseHistory: { month: string; revenue: number; expense: number }[]` — consumed by Task 4's print-only financial summary.

- [ ] **Step 1: Write the failing test**

In `src/modules/dashboard/service.test.ts`, update the first test's `finance.getDashboardMetrics` mock (currently `vi.fn().mockResolvedValue({ revenueTotal: 38240, revenueChangePct: 12 })`) to:

```ts
        getDashboardMetrics: vi.fn().mockResolvedValue({
          revenueTotal: 38240,
          revenueChangePct: 12,
          expenseTotal: 9100,
          balance: 29140,
          revenueExpenseHistory: [{ month: "Ago", revenue: 38240, expense: 9100 }],
        }),
```

Add assertions right after the existing `expect(overview.revenueHistory).toHaveLength(6);` line:

```ts
    expect(overview.expenseTotal).toBe(9100);
    expect(overview.balance).toBe(29140);
    expect(overview.revenueExpenseHistory).toEqual([{ month: "Ago", revenue: 38240, expense: 9100 }]);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/modules/dashboard/service.test.ts`
Expected: FAIL — `overview.expenseTotal`/`balance`/`revenueExpenseHistory` are `undefined`, since `getDashboardOverview`'s return object doesn't include them yet.

- [ ] **Step 3: Extend `DashboardOverview`**

In `src/modules/dashboard/types.ts`, add the 3 fields to the `DashboardOverview` interface (after `revenueChangePct`):

```ts
  expenseTotal: number;
  balance: number;
  revenueExpenseHistory: { month: string; revenue: number; expense: number }[];
```

- [ ] **Step 4: Extend the `DashboardDeps["finance"]["getDashboardMetrics"]` return type**

In `src/modules/dashboard/service.ts`, in the `DashboardDeps` interface, update the `finance.getDashboardMetrics` return type:

```ts
    getDashboardMetrics: (
      accountId: string,
      rawPeriod: unknown,
      procedures: { id: string; name: string }[],
    ) => Promise<{
      revenueTotal: number;
      revenueChangePct: number | null;
      expenseTotal: number;
      balance: number;
      revenueExpenseHistory: { month: string; revenue: number; expense: number }[];
    }>;
```

- [ ] **Step 5: Pass the fields through in `getDashboardOverview`**

In `src/modules/dashboard/service.ts`, in the returned object at the end of `getDashboardOverview`, add the 3 fields (after `revenueChangePct: financeMetrics.revenueChangePct,`):

```ts
    expenseTotal: financeMetrics.expenseTotal,
    balance: financeMetrics.balance,
    revenueExpenseHistory: financeMetrics.revenueExpenseHistory,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- src/modules/dashboard/service.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full test suite and typecheck**

Run: `npm run test && npx tsc --noEmit`
Expected: PASS — the other two tests in this file mock `getDashboardMetrics` with only `revenueTotal`/`revenueChangePct`; confirm they still pass (JS doesn't enforce the extra fields at runtime) and that `tsc` doesn't flag the mocks as `as never`-cast test doubles are exempt from the stricter return type.

- [ ] **Step 8: Commit**

```bash
git add src/modules/dashboard/types.ts src/modules/dashboard/service.ts src/modules/dashboard/service.test.ts
git commit -m "feat(dashboard): expose expense/balance/revenue-expense-history on DashboardOverview"
```

---

### Task 3: Print-only header (clinic name, period, generated-at)

**Files:**
- Modify: `src/components/dashboard/dashboard-client.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getCurrentAccountName`, `getCurrentAccountId`, `createServerSupabaseClient` (all pre-existing, same pattern as `src/app/(app)/layout.tsx`).
- Produces: `DashboardClient` accepts a new `accountName: string` prop and renders a `hidden print:block` header showing clinic name, a human-readable period label, and the generation timestamp.

- [ ] **Step 1: Fetch `accountName` in the Dashboard page**

In `src/app/(app)/dashboard/page.tsx`, add the same account-name lookup `AppLayout` already does:

```tsx
import { getDashboardOverviewAction } from "./actions";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { ExportReportButton } from "@/components/dashboard/export-report-button";
import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId, getCurrentAccountName } from "@/lib/supabase/account";

export default async function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const overview = await getDashboardOverviewAction(today);

  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const accountName = await getCurrentAccountName(supabase, accountId);

  return (
    <div>
      <PageHeader
        title="Visão geral"
        description="Desempenho da clínica no mês atual."
        action={<ExportReportButton />}
      />
      <DashboardClient overview={overview} todayIso={today} accountName={accountName} />
    </div>
  );
}
```

(Note: `ExportReportButton` drops the `overview` prop here — it no longer needs it, per Task 5.)

- [ ] **Step 2: Add a period-label helper and the print header to `DashboardClient`**

In `src/components/dashboard/dashboard-client.tsx`, add a helper function near `comparisonLabel`:

```ts
function periodLabel(preset: Preset, customFrom: string, customTo: string): string {
  if (preset === "week") return "Semana atual";
  if (preset === "month") return "Mês atual";
  if (customFrom && customTo) {
    const format = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
    return `${format(customFrom)} a ${format(customTo)}`;
  }
  return "Período personalizado";
}
```

Update the component signature to accept `accountName`:

```tsx
export function DashboardClient({
  overview: initialOverview,
  todayIso,
  accountName,
}: {
  overview: DashboardOverview;
  todayIso: string;
  accountName: string;
}) {
```

Add the print-only header as the first child inside the root `<div className="space-y-4 px-6 pb-6">`, right before `<PeriodFilter ... />`:

```tsx
<div className="hidden print:block print:mb-4">
  <h1 className="text-xl font-bold">{accountName}</h1>
  <p className="text-sm text-muted-foreground">
    Relatório — {periodLabel(preset, customFrom, customTo)}
  </p>
  <p className="text-xs text-muted-foreground">
    Gerado em {new Date().toLocaleString("pt-BR")}
  </p>
</div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Run `npm run dev` (skip if already running), open `/dashboard`, switch between Semana/Mês/Personalizado, open print preview each time, confirm the print-only header shows the correct clinic name and period label, and is invisible in the normal (non-print) view.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx" src/components/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): add print-only header with clinic name and period"
```

---

### Task 4: Print-only financial summary (Despesa, Saldo, Receita vs. despesas)

**Files:**
- Modify: `src/components/dashboard/dashboard-client.tsx`

**Interfaces:**
- Consumes: `overview.expenseTotal`, `overview.balance`, `overview.revenueExpenseHistory` (Task 2).
- Produces: nothing new — pure UI addition inside `DashboardClient`, visible only when printing.

- [ ] **Step 1: Add the `recharts` imports needed for the bar chart**

In `src/components/dashboard/dashboard-client.tsx`, extend the existing `recharts` import line (currently `import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";`) to also import `Bar`, `BarChart`, `Legend`:

```ts
import { Area, AreaChart, Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
```

- [ ] **Step 2: Add the print-only financial summary section**

Add this block right after the "Próximos atendimentos" `Card` (the last one in the file, now `print:hidden` per Task 1), still inside the root `<div className="space-y-4 px-6 pb-6">`:

```tsx
<div className="hidden print:grid print:grid-cols-2 print:gap-4">
  <Card className="print:break-inside-avoid">
    <CardHeader>
      <CardTitle className="text-sm text-muted-foreground">Despesa</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-3xl font-bold">{formatCurrency(overview.expenseTotal)}</p>
    </CardContent>
  </Card>
  <Card className="print:break-inside-avoid">
    <CardHeader>
      <CardTitle className="text-sm text-muted-foreground">Saldo</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-3xl font-bold">{formatCurrency(overview.balance)}</p>
    </CardContent>
  </Card>
</div>

<Card className="hidden print:block print:break-inside-avoid">
  <CardHeader>
    <CardTitle>Receita vs. despesas</CardTitle>
    <p className="text-sm text-muted-foreground">Comparativo do período</p>
  </CardHeader>
  <CardContent>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={overview.revenueExpenseHistory}>
          <XAxis dataKey="month" axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Legend formatter={(value) => (value === "revenue" ? "Receita" : "Despesa")} iconType="circle" />
          <Bar dataKey="revenue" fill="#16a34a" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill="#f87171" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </CardContent>
</Card>
```

(Matches the same KPI-card and chart style already used in `finance-dashboard-client.tsx`, so the printed report looks consistent with the Financeiro screen.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify**

Run `npm run dev` (skip if already running), open `/dashboard`, open print preview. Confirm: Despesa/Saldo cards and the "Receita vs. despesas" chart appear only in the print preview (not in the normal screen view), with correct values for the selected period.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): add print-only financial summary to the report"
```

---

### Task 5: `ExportReportButton` triggers `window.print()`

**Files:**
- Modify: `src/components/dashboard/export-report-button.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ExportReportButton()` — no longer takes an `overview` prop (matches Task 3's updated call site).

- [ ] **Step 1: Rewrite the component**

Replace the full contents of `src/components/dashboard/export-report-button.tsx`:

```tsx
"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportReportButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="size-4" />
      Imprimir relatório
    </Button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — confirms no other call site still passes the now-removed `overview` prop (Task 2 already updated the one call site in `page.tsx`).

- [ ] **Step 3: Manually verify**

Run `npm run dev` (skip if already running), open `/dashboard`, click "Imprimir relatório", confirm the browser's print dialog opens showing the print-optimized layout (no sidebar, no filter controls, print header visible).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/export-report-button.tsx
git commit -m "feat(dashboard): replace CSV export with browser print/save-as-PDF"
```

---

## Fora de Escopo (herdado da spec)

Ver seção "Fora de Escopo" em `docs/superpowers/specs/2026-08-24-relatorio-impressao-design.md` — geração de PDF no servidor, paginação customizada, outros formatos de exportação, customização de conteúdo, envio por e-mail/WhatsApp.
