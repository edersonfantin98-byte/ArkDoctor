# Relatório em PDF via Impressão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the buggy CSV export on the Dashboard with a print-optimized view of the same page, triggered by `window.print()`, so the user can "Save as PDF" from the browser's own print dialog.

**Architecture:** No new route, no new data fetching. Adds `print:` (Tailwind v4) CSS rules to hide the sidebar and interactive controls when printing, adds a print-only header (clinic name, period, generation timestamp) inside the existing `DashboardClient`, and rewrites `ExportReportButton` to call `window.print()` instead of building a CSV blob.

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

- [ ] **Step 3: Reduce card-splitting across printed pages**

In `src/components/dashboard/dashboard-client.tsx`, add `print:break-inside-avoid` to each of the four metric `<Card>` elements in the `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4` block, and to the `Card` elements in the `grid grid-cols-1 gap-4 lg:grid-cols-3` block (revenue chart card, pipeline-by-stage card), and to the "Próximos atendimentos" `Card`.

- [ ] **Step 4: Manually verify**

Run `npm run dev` (skip if already running), open `/dashboard`, open the browser's print preview (Ctrl/Cmd+P). Confirm: sidebar is gone, period-filter buttons/date inputs are gone, cards aren't obviously sliced across a page break.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/sidebar.tsx src/components/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): add print CSS to hide sidebar and interactive controls"
```

---

### Task 2: Print-only header (clinic name, period, generated-at)

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

(Note: `ExportReportButton` drops the `overview` prop here — it no longer needs it, per Task 3.)

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

### Task 3: `ExportReportButton` triggers `window.print()`

**Files:**
- Modify: `src/components/dashboard/export-report-button.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ExportReportButton()` — no longer takes an `overview` prop (matches Task 2's updated call site).

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
