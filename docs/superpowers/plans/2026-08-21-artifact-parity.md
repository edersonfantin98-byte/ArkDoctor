# Artifact Visual/Behavioral Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the ArkDoctor app (Dashboard, Financeiro, Pipeline, Agenda, Agendamento, sidebar) into parity with the approved design artifact — fixing real bugs (currency formatting, mislabeled legend), completing half-built features (per-card deltas, account name), and restructuring the Financeiro page to show the correct chart types for its data.

**Architecture:** No new libraries. Reuses existing stack: Next.js Server Actions + a thin service/repository layer per module (`src/modules/<domain>/{service,repository,repository.memory,repository.supabase,types}.ts`), Recharts for charts, shadcn/ui + Tailwind for presentation. Each backend change follows the existing pattern: extend the repository interface → implement in both `repository.memory.ts` (tested) and `repository.supabase.ts` (production) → extend the service function → extend the Server Action if needed → consume in the client component.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 (`@theme inline` tokens in `src/app/globals.css`), Recharts, Supabase (Postgres + `@supabase/ssr`), Vitest, lucide-react icons.

**Spec:** No separate spec doc — this plan is driven directly by the conversation's screenshot-by-screenshot comparison against the approved artifact images (`artifact-*.png` in the repo root) plus two explicit user directives: (1) Agenda must keep both week and month selectable (already true — verify, don't remove), (2) brand orange must be exactly `#FF7900`.

## Global Constraints

- Brand primary color is `#FF7900` exactly — verified via browser round-trip conversion, stored as `oklch(0.7216 0.1904 50.15)` (this exact oklch string renders back to `#ff7900` in Chromium's canvas 2D context — do not re-derive with a different tool/rounding).
- All currency displayed to users must use pt-BR formatting: thousands separator `.`, no decimal places (the artifact never shows cents — `R$ 38.240`, `R$ 250`, `R$ 233`). Raw CSV export data (`export-report-button.tsx`) is explicitly out of scope for this — it's machine-readable output, not display.
- Agenda must keep both "Semana" and "Mês" view toggles working — this plan does not change the default view or remove either option, only restyles the month-view cells and fixes one mislabeled legend entry.
- No dark mode work (project explicitly has none, per `docs/superpowers/specs/2026-08-20-arkdoctor-visual-design.md`).
- Run `npm run test`, `npx tsc --noEmit`, and `npm run lint` after every task — do not move to the next task with a red test suite or a new type error. (13 pre-existing lint errors are unrelated `react-hooks/set-state-in-effect` warnings in files this plan doesn't touch — confirmed via `git stash` diff earlier in this session. Don't try to fix those; just don't add new ones.)
- Login at `http://localhost:3000/login` with `silvana@arkdoctor.com` / `silvana123@` to visually verify against `artifact-*.png` screenshots in the repo root after each UI-facing task, using `agent-browser`.

---

### Task 1: Brand color — `#FF7900` exactly

**Status:** Already applied in the working tree during the conversation that produced this plan. This task exists so the executor verifies it rather than skips it blind.

**Files:**
- Modify: `src/app/globals.css:65,71-72,76-77,85,90`

**Interfaces:** None — pure CSS custom property change, no code consumes these values directly (everything goes through the Tailwind `--color-primary` alias defined in the `@theme inline` block).

- [ ] **Step 1: Confirm current state**

```bash
grep -n "41.6\|50.15" src/app/globals.css
```

Expected: every line shows `oklch(0.7216 0.1904 50.15)` (not `41.6`) for `--primary`, `--accent`, `--accent-foreground`, `--ring`, `--chart-1`, `--sidebar-primary`, `--sidebar-ring`. If any still say `41.6`, apply this edit:

```css
  --primary: oklch(0.7216 0.1904 50.15);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.213 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.551 0.027 264.364);
  --accent: oklch(0.94 0.04 50.15);
  --accent-foreground: oklch(0.4 0.1 50.15);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.928 0.006 264.531);
  --input: oklch(0.928 0.006 264.531);
  --ring: oklch(0.7216 0.1904 50.15);
  --chart-1: oklch(0.7216 0.1904 50.15);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --radius: 0.625rem;
  --sidebar: oklch(0.213 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.7216 0.1904 50.15);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.3 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.7216 0.1904 50.15);
```

- [ ] **Step 2: Verify the rendered pixel color**

```bash
agent-browser open http://localhost:3000/login
agent-browser wait --load networkidle
```

```bash
cat <<'EOF' | agent-browser eval --stdin
const canvasX = document.createElement('canvas');
canvasX.width = 1; canvasX.height = 1;
const ctxX = canvasX.getContext('2d');
const btn = document.querySelector('button[type="submit"]');
ctxX.fillStyle = getComputedStyle(btn).backgroundColor;
ctxX.fillRect(0,0,1,1);
const px = ctxX.getImageData(0,0,1,1).data;
`#${px[0].toString(16).padStart(2,'0')}${px[1].toString(16).padStart(2,'0')}${px[2].toString(16).padStart(2,'0')}`;
EOF
```

Expected: `"#ff7900"`.

- [ ] **Step 3: Commit (only if Step 1 required an edit)**

```bash
git add src/app/globals.css
git commit -m "fix(design): use exact brand orange #FF7900"
```

---

### Task 2: Shared pt-BR currency formatter

**Files:**
- Create: `src/lib/format.ts`
- Test: `src/lib/format.test.ts`
- Modify: `src/components/dashboard/dashboard-client.tsx:9-11` (remove local `formatCurrency`, import shared one)
- Modify: `src/components/finance/finance-dashboard-client.tsx:26-28` (remove local `formatCurrency`, import shared one)
- Modify: `src/components/finance/entries-client.tsx:59` (replace `toFixed(2)` usage)
- Modify: `src/components/agendamento/booking-wizard.tsx:49-51` (remove local `formatCurrency`, import shared one)

**Interfaces:**
- Produces: `formatCurrency(value: number): string` — e.g. `formatCurrency(38240)` → `"R$ 38.240"`, `formatCurrency(0)` → `"R$ 0"`, `formatCurrency(233.5)` → `"R$ 234"` (Math rounds, no decimals — matches artifact which never shows cents).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/format.test.ts
import { describe, it, expect } from "vitest";
import { formatCurrency } from "./format";

describe("formatCurrency", () => {
  it("formats whole reais with pt-BR thousands separator and no decimals", () => {
    expect(formatCurrency(38240)).toBe("R$ 38.240");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("R$ 0");
  });

  it("rounds fractional cents to the nearest whole real", () => {
    expect(formatCurrency(233.5)).toBe("R$ 234");
    expect(formatCurrency(233.4)).toBe("R$ 233");
  });

  it("formats small values without a thousands separator", () => {
    expect(formatCurrency(250)).toBe("R$ 250");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — `Cannot find module './format'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/format.ts
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS (4 tests)

Note: `Intl.NumberFormat` with `style: "currency"` inserts a non-breaking space (` `) between `R$` and the number in some Node/ICU builds, not a regular space. If the test fails only on that character, adjust the assertion to use the non-breaking space (`"R$ 38.240"`) rather than changing the implementation — that space is what real pt-BR currency formatting produces and is what you want on screen.

- [ ] **Step 5: Adopt in `dashboard-client.tsx`**

Remove lines 9-11 (the local `formatCurrency` function) and add the import:

```typescript
import { formatCurrency } from "@/lib/format";
```

- [ ] **Step 6: Adopt in `finance-dashboard-client.tsx`**

Remove lines 26-28 (the local `formatCurrency` function) and add the import:

```typescript
import { formatCurrency } from "@/lib/format";
```

- [ ] **Step 7: Adopt in `entries-client.tsx`**

Replace:
```tsx
{entry.type === "revenue" ? "+" : "-"} R$ {entry.amount.toFixed(2)}
```
with:
```tsx
{entry.type === "revenue" ? "+" : "-"} {formatCurrency(entry.amount)}
```
and add the import at the top of the file:
```typescript
import { formatCurrency } from "@/lib/format";
```

- [ ] **Step 8: Adopt in `booking-wizard.tsx`**

Remove the local `formatCurrency` function (currently around line 49-51) and add the import:

```typescript
import { formatCurrency } from "@/lib/format";
```

- [ ] **Step 9: Run full test suite and typecheck**

```bash
npm run test
npx tsc --noEmit
```

Expected: all pass, no unused-import errors.

- [ ] **Step 10: Visual verification**

```bash
agent-browser open http://localhost:3000/dashboard
agent-browser wait --load networkidle
agent-browser wait 500
agent-browser screenshot task2-dashboard.png
```

Read the screenshot. Every currency figure should read like `R$ 0` / `R$ 1.234` — no `.00` suffix anywhere.

- [ ] **Step 11: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/components/dashboard/dashboard-client.tsx src/components/finance/finance-dashboard-client.tsx src/components/finance/entries-client.tsx src/components/agendamento/booking-wizard.tsx
git commit -m "fix(format): use pt-BR currency formatting everywhere (was toFixed(2), American-style)"
```

---

### Task 3: Sidebar nav icons — Pipeline → funnel, Financeiro → dollar sign

**Files:**
- Modify: `src/components/layout/sidebar.tsx:1-25`

**Interfaces:** None — presentational only.

- [ ] **Step 1: Update the icon imports and module list**

In `src/components/layout/sidebar.tsx`, change the import block:

```typescript
import {
  LayoutDashboard,
  Filter,
  CalendarDays,
  CalendarPlus,
  DollarSign,
  MessageCircle,
  Settings,
  LogOut,
} from "lucide-react";
```

(replacing `KanbanSquare` with `Filter` and `Wallet` with `DollarSign`)

And update `generalModules`:

```typescript
const generalModules = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, enabled: true },
  { label: "Pipeline", href: "/pipeline", icon: Filter, enabled: true },
  { label: "Agenda", href: "/agenda", icon: CalendarDays, enabled: true },
  { label: "Financeiro", href: "/financeiro", icon: DollarSign, enabled: true },
  { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle, enabled: true },
];
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors (confirms no other file still imports `KanbanSquare`/`Wallet` from this file — it doesn't export them, so this is just a sanity check).

- [ ] **Step 3: Visual verification**

```bash
agent-browser open http://localhost:3000/pipeline
agent-browser wait --load networkidle
agent-browser wait 500
agent-browser screenshot task3-sidebar.png
```

Read the screenshot. Pipeline nav item should show a funnel/filter icon, Financeiro should show a `$` icon.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "fix(sidebar): match nav icons to artifact (funnel for Pipeline, dollar sign for Financeiro)"
```

---

### Task 4: Agenda legend — fix mislabeled status dot

**Files:**
- Modify: `src/app/(app)/agenda/page.tsx:25`

**Interfaces:** None — presentational only. The amber dot's real meaning (per `agenda-client.tsx`'s `pendingStatusCount` copy: "agendamento(s) sem status definido após o horário previsto") is "pending status", not "scheduled" — this fixes the label to match what the badge actually means, and matches the artifact's "Pendente de status" wording.

- [ ] **Step 1: Fix the label**

In `src/app/(app)/agenda/page.tsx`, change:

```tsx
<span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-600" />Agendado</span>
```
to:
```tsx
<span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-600" />Pendente de status</span>
```

- [ ] **Step 2: Visual verification**

```bash
agent-browser open http://localhost:3000/agenda
agent-browser wait --load networkidle
agent-browser wait 500
agent-browser screenshot task4-agenda-legend.png
```

Read the screenshot. The amber legend dot should read "Pendente de status".

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/agenda/page.tsx"
git commit -m "fix(agenda): correct legend label for amber status dot (Pendente de status, not Agendado)"
```

---

### Task 5: `countNewContacts` — add optional upper bound

This is a prerequisite for Task 7 (Dashboard needs "new contacts this month" vs "new contacts last month", which requires bounding both ends of the range).

**Files:**
- Modify: `src/modules/crm/repository.ts:28`
- Modify: `src/modules/crm/repository.memory.ts:134-138`
- Modify: `src/modules/crm/repository.supabase.ts:195-203`
- Modify: `src/modules/crm/service.ts:156-162`
- Test: `src/modules/crm/repository.memory.test.ts:41-52` (extend existing test)
- Test: `src/modules/crm/service.test.ts:250-258` (extend existing test)

**Interfaces:**
- Produces: `countNewContacts(repo, accountId, sinceIso, untilIso?)` — when `untilIso` is provided, counts contacts with `sinceIso <= createdAt < untilIso`; when omitted, behavior is unchanged (counts `createdAt >= sinceIso`, open-ended). Existing callers (`dashboard/service.ts`'s current-month count) keep working with no changes.

- [ ] **Step 1: Write the failing test (repository layer)**

Add to `src/modules/crm/repository.memory.test.ts`, right after the existing `countNewContacts` test (currently ending at line 52):

```typescript
  it("counts contacts within a bounded [sinceIso, untilIso) window when untilIso is given", async () => {
    const repo = createInMemoryCrmRepository();
    await repo.insertContact("acc-1", { name: "Ana", phone: "11999990000" });
    await repo.insertContact("acc-1", { name: "Beatriz", phone: "11988887777" });

    const all = await repo.countNewContacts("acc-1", "2000-01-01T00:00:00.000Z");
    expect(all).toBe(2);

    const noneInPast = await repo.countNewContacts(
      "acc-1",
      "2000-01-01T00:00:00.000Z",
      "2000-01-02T00:00:00.000Z",
    );
    expect(noneInPast).toBe(0);

    const bothInWideWindow = await repo.countNewContacts(
      "acc-1",
      "2000-01-01T00:00:00.000Z",
      "2999-01-01T00:00:00.000Z",
    );
    expect(bothInWideWindow).toBe(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/crm/repository.memory.test.ts`
Expected: FAIL — `countNewContacts` called with 3 args doesn't type-check yet / doesn't filter by the third arg (TS may not even fail at runtime since the extra arg is currently just ignored by JS — the important failure is the `noneInPast` assertion getting `2` instead of `0`).

- [ ] **Step 3: Implement in the repository interface and memory repo**

In `src/modules/crm/repository.ts`, change line 28:

```typescript
  countNewContacts(accountId: string, sinceIso: string, untilIso?: string): Promise<number>;
```

In `src/modules/crm/repository.memory.ts`, replace lines 134-138:

```typescript
    async countNewContacts(accountId, sinceIso, untilIso) {
      return [...contacts.values()].filter(
        (c) =>
          c.accountId === accountId &&
          c.createdAt >= sinceIso &&
          (untilIso === undefined || c.createdAt < untilIso),
      ).length;
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/crm/repository.memory.test.ts`
Expected: PASS

- [ ] **Step 5: Implement in the Supabase repository**

In `src/modules/crm/repository.supabase.ts`, replace lines 195-203:

```typescript
    async countNewContacts(accountId, sinceIso, untilIso) {
      let query = supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .gte("created_at", sinceIso);
      if (untilIso !== undefined) {
        query = query.lt("created_at", untilIso);
      }
      const { count, error } = await query;
      if (error) throwDbError(error);
      return count ?? 0;
    },
```

- [ ] **Step 6: Write the failing test (service layer)**

Add to `src/modules/crm/service.test.ts`, inside the existing `describe("countNewContacts", ...)` block (currently lines 250-258), as a second `it`:

```typescript
  it("respects an optional upper bound", async () => {
    const repo = createInMemoryCrmRepository();
    await createContact(repo, "acc-1", { name: "Ana", phone: "11999990000" });

    expect(
      await countNewContacts(
        repo,
        "acc-1",
        "2000-01-01T00:00:00.000Z",
        "2000-01-02T00:00:00.000Z",
      ),
    ).toBe(0);
  });
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run src/modules/crm/service.test.ts`
Expected: FAIL — `countNewContacts` (service function) doesn't forward a 4th arg yet.

- [ ] **Step 8: Implement in the service layer**

In `src/modules/crm/service.ts`, replace lines 156-162:

```typescript
export async function countNewContacts(
  repo: CrmRepository,
  accountId: string,
  sinceIso: string,
  untilIso?: string,
): Promise<number> {
  return repo.countNewContacts(accountId, sinceIso, untilIso);
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run src/modules/crm/service.test.ts`
Expected: PASS

- [ ] **Step 10: Run full suite and typecheck**

```bash
npm run test
npx tsc --noEmit
```

- [ ] **Step 11: Commit**

```bash
git add src/modules/crm/repository.ts src/modules/crm/repository.memory.ts src/modules/crm/repository.supabase.ts src/modules/crm/service.ts src/modules/crm/repository.memory.test.ts src/modules/crm/service.test.ts
git commit -m "feat(crm): support bounded date range in countNewContacts"
```

---

### Task 6: Sidebar footer — account name + email (two lines)

**Files:**
- Modify: `src/lib/supabase/account.ts` (add `getCurrentAccountName`)
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Produces (`account.ts`): `getCurrentAccountName(supabase: SupabaseClient<Database>, accountId: string): Promise<string>`
- `Sidebar` component props change from `{ userEmail: string }` to `{ userEmail: string; accountName: string }`.

- [ ] **Step 1: Add `getCurrentAccountName` to `src/lib/supabase/account.ts`**

Append to the file:

```typescript
export async function getCurrentAccountName(
  supabase: SupabaseClient<Database>,
  accountId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("accounts")
    .select("name")
    .eq("id", accountId)
    .single();
  if (error) throw error;

  return data.name;
}
```

- [ ] **Step 2: Fetch it in the layout**

In `src/app/(app)/layout.tsx`, current content:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar userEmail={user?.email ?? ""} />
      <main className="min-w-0 flex-1 bg-background">{children}</main>
    </div>
  );
}
```

Replace with:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId, getCurrentAccountName } from "@/lib/supabase/account";
import { Sidebar } from "@/components/layout/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountId = await getCurrentAccountId(supabase);
  const accountName = await getCurrentAccountName(supabase, accountId);

  return (
    <div className="flex min-h-screen">
      <Sidebar userEmail={user?.email ?? ""} accountName={accountName} />
      <main className="min-w-0 flex-1 bg-background">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Update the Sidebar footer to two lines, initials from the account name**

In `src/components/layout/sidebar.tsx`, current footer block:

```tsx
export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const initials = userEmail.slice(0, 2).toUpperCase();
  ...
      <form
        action={logoutAction}
        className="flex items-center gap-2 border-t border-sidebar-border px-3 py-4"
      >
        <Avatar size="sm">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="flex-1 truncate text-xs text-sidebar-foreground/70">{userEmail}</span>
        <button
          type="submit"
          aria-label="Sair"
          className="rounded-lg p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </form>
```

Replace the function signature and footer block:

```tsx
export function Sidebar({ userEmail, accountName }: { userEmail: string; accountName: string }) {
  const pathname = usePathname();
  const initials = accountName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  ...
      <form
        action={logoutAction}
        className="flex items-center gap-2 border-t border-sidebar-border px-3 py-4"
      >
        <Avatar size="sm">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-sidebar-foreground">{accountName}</span>
          <span className="block truncate text-xs text-sidebar-foreground/60">{userEmail}</span>
        </span>
        <button
          type="submit"
          aria-label="Sair"
          className="rounded-lg p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </form>
```

(Keep everything else in the file — the imports, `NavGroup`, module lists from Task 3 — unchanged; only the function signature and footer JSX change.)

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Visual verification**

```bash
agent-browser open http://localhost:3000/pipeline
agent-browser wait --load networkidle
agent-browser wait 500
agent-browser screenshot task6-sidebar-footer.png
```

Read the screenshot. Bottom-left should show two lines: account name (bold) above the email (muted), with initials from the account name in the avatar.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/account.ts "src/app/(app)/layout.tsx" src/components/layout/sidebar.tsx
git commit -m "feat(sidebar): show account name above email in footer, matching artifact"
```

---

### Task 7: Dashboard — monthly stat metrics with real deltas

The artifact's four Dashboard cards are **monthly** aggregates ("Consultas concluídas: 164, ↑8% vs. julho" — not "hoje"), each with a delta in a different unit:
- Receita: percentage delta (already implemented in a prior session).
- Consultas concluídas: percentage delta (currently `null`, hardcoded).
- Não comparecimento: **percentage-point** delta (`-1,4pp`, not `-X%` — this is `currentRate - previousRate`, not a relative change).
- Novos contatos: **absolute count** delta (`+5`, not a percentage).

The "Próximos atendimentos" table at the bottom keeps showing **today's** appointments — that's a separate, correct concept from the monthly stat cards above it.

**Files:**
- Modify: `src/modules/dashboard/types.ts`
- Modify: `src/modules/dashboard/service.ts`
- Modify: `src/app/(app)/dashboard/actions.ts`
- Test: `src/modules/dashboard/service.test.ts`
- Modify: `src/components/dashboard/dashboard-client.tsx`

**Interfaces:**
- Produces (`types.ts`): `DashboardOverview` gains `appointmentsCompletedChangePct: number | null` (already existed, now actually computed), `noShowRateChangePp: number | null`, `newContactsChangeCount: number | null`.
- `getDashboardOverview(deps, accountId, todayIso)` signature unchanged; `deps.scheduling.listAppointments` and `deps.crm.countNewContacts` are called with additional ranges internally.

- [ ] **Step 1: Write the failing test**

In `src/modules/dashboard/service.test.ts`, the existing first test (`"combines pipeline, scheduling, and finance data for the given day"`) currently mocks `listAppointments` to return the same 3 appointments regardless of range, and `countNewContacts` to always return `3`. Replace the whole file with this version, which makes the mocks range-aware so the new deltas are exercised:

```typescript
import { describe, it, expect, vi } from "vitest";
import { getDashboardOverview } from "./service";

describe("getDashboardOverview", () => {
  it("combines pipeline, scheduling, and finance data for the given day", async () => {
    const todaysAppointments = [
      {
        id: "a1",
        startsAt: "2026-08-20T13:00:00.000Z",
        status: "confirmado",
        contact: { name: "Carla Souza" },
        procedure: { name: "Consulta de avaliação" },
      },
      {
        id: "a2",
        startsAt: "2026-08-20T15:00:00.000Z",
        status: "concluido",
        contact: { name: "João Lima" },
        procedure: { name: "Limpeza" },
      },
      {
        id: "a3",
        startsAt: "2026-08-20T16:00:00.000Z",
        status: "nao_compareceu",
        contact: { name: "Marta Reis" },
        procedure: { name: "Avaliação" },
      },
    ];

    // Current month: 10 appointments, 6 concluido, 2 nao_compareceu (of 10 => 20%)
    const monthAppointments = Array.from({ length: 10 }, (_, i) => ({
      id: `month-${i}`,
      startsAt: `2026-08-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
      status: i < 6 ? "concluido" : i < 8 ? "nao_compareceu" : "confirmado",
      contact: { name: "X" },
      procedure: { name: "Y" },
    }));

    // Previous month: 8 appointments, 4 concluido, 1 nao_compareceu (of 8 => 12.5%)
    const prevMonthAppointments = Array.from({ length: 8 }, (_, i) => ({
      id: `prev-${i}`,
      startsAt: `2026-07-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
      status: i < 4 ? "concluido" : i < 5 ? "nao_compareceu" : "confirmado",
      contact: { name: "X" },
      procedure: { name: "Y" },
    }));

    const listAppointments = vi.fn().mockImplementation((_accId: string, range: { from: string; to: string }) => {
      if (range.from.startsWith("2026-08-20")) return Promise.resolve(todaysAppointments);
      if (range.from.startsWith("2026-08")) return Promise.resolve(monthAppointments);
      if (range.from.startsWith("2026-07")) return Promise.resolve(prevMonthAppointments);
      return Promise.resolve([]);
    });

    const countNewContacts = vi
      .fn()
      .mockImplementation((_accId: string, sinceIso: string, untilIso?: string) => {
        if (sinceIso.startsWith("2026-08") && untilIso === undefined) return Promise.resolve(47);
        if (sinceIso.startsWith("2026-07") && untilIso?.startsWith("2026-08")) return Promise.resolve(42);
        return Promise.resolve(0);
      });

    const deps = {
      crm: {
        listPipeline: vi.fn().mockResolvedValue([
          { stage: { id: "stage-1", name: "Novo", kind: "normal" }, deals: [] },
          {
            stage: { id: "stage-2", name: "Agendado", kind: "normal" },
            deals: [{ id: "d1" }, { id: "d2" }],
          },
        ]),
        countNewContacts,
      },
      scheduling: {
        listAppointments,
        listProcedures: vi.fn().mockResolvedValue([{ id: "proc-1", name: "Consulta" }]),
      },
      finance: {
        getDashboardMetrics: vi.fn().mockResolvedValue({
          revenueTotal: 38240,
          revenueChangePct: 12,
        }),
        listEntries: vi.fn().mockResolvedValue([]),
      },
    };

    const overview = await getDashboardOverview(deps as never, "acc-1", "2026-08-20");

    expect(overview.revenueTotal).toBe(38240);
    expect(overview.revenueChangePct).toBe(12);
    expect(overview.pipelineByStage).toEqual([
      { stageId: "stage-1", stageName: "Novo", stageKind: "normal", count: 0 },
      { stageId: "stage-2", stageName: "Agendado", stageKind: "normal", count: 2 },
    ]);
    expect(overview.revenueHistory).toHaveLength(6);

    // Monthly completed count: 6 this month, 4 last month => +50%
    expect(overview.appointmentsCompletedCount).toBe(6);
    expect(overview.appointmentsCompletedChangePct).toBeCloseTo(50, 5);

    // Monthly no-show rate: 20% this month, 12.5% last month => +7.5pp
    expect(overview.noShowRatePct).toBeCloseTo(20, 5);
    expect(overview.noShowRateChangePp).toBeCloseTo(7.5, 5);

    // New contacts: 47 this month, 42 last month => +5 (absolute)
    expect(overview.newContactsCount).toBe(47);
    expect(overview.newContactsChangeCount).toBe(5);

    // Today's table still reflects today's appointments only
    expect(overview.todaysAppointments).toHaveLength(3);
    expect(overview.todaysAppointments[0].contactName).toBe("Carla Souza");
  });

  it("returns null deltas when there is no data for the prior period", async () => {
    const deps = {
      crm: {
        listPipeline: vi.fn().mockResolvedValue([]),
        countNewContacts: vi.fn().mockResolvedValue(0),
      },
      scheduling: {
        listAppointments: vi.fn().mockResolvedValue([]),
        listProcedures: vi.fn().mockResolvedValue([]),
      },
      finance: {
        getDashboardMetrics: vi.fn().mockResolvedValue({ revenueTotal: 0, revenueChangePct: null }),
        listEntries: vi.fn().mockResolvedValue([]),
      },
    };

    const overview = await getDashboardOverview(deps as never, "acc-1", "2026-08-20");

    expect(overview.appointmentsCompletedCount).toBe(0);
    expect(overview.appointmentsCompletedChangePct).toBeNull();
    expect(overview.noShowRatePct).toBeNull();
    expect(overview.noShowRateChangePp).toBeNull();
    expect(overview.newContactsChangeCount).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/dashboard/service.test.ts`
Expected: FAIL — `appointmentsCompletedCount` is `3` (today's), not `6` (this month's); `noShowRateChangePp`/`newContactsChangeCount` are `undefined`.

- [ ] **Step 3: Extend `DashboardOverview` type**

In `src/modules/dashboard/types.ts`, replace the whole file:

```typescript
export interface DashboardOverview {
  revenueTotal: number;
  revenueChangePct: number | null;
  appointmentsCompletedCount: number;
  appointmentsCompletedChangePct: number | null;
  noShowRatePct: number | null;
  noShowRateChangePp: number | null;
  newContactsCount: number;
  newContactsChangeCount: number | null;
  pipelineByStage: { stageId: string; stageName: string; stageKind: string; count: number }[];
  revenueHistory: { month: string; total: number }[];
  todaysAppointments: {
    id: string;
    contactName: string;
    procedureName: string;
    startsAt: string;
    status: string;
  }[];
}
```

- [ ] **Step 4: Rewrite `getDashboardOverview`**

Replace `src/modules/dashboard/service.ts` in full:

```typescript
import type { DashboardOverview } from "./types";

interface DashboardDeps {
  crm: {
    listPipeline: (
      accountId: string,
    ) => Promise<
      { stage: { id: string; name: string; kind: string }; deals: { id: string }[] }[]
    >;
    countNewContacts: (accountId: string, sinceIso: string, untilIso?: string) => Promise<number>;
  };
  scheduling: {
    listAppointments: (
      accountId: string,
      range: { from: string; to: string },
    ) => Promise<
      {
        id: string;
        startsAt: string;
        status: string;
        contact: { name: string };
        procedure: { name: string };
      }[]
    >;
    listProcedures: (accountId: string) => Promise<{ id: string; name: string }[]>;
  };
  finance: {
    getDashboardMetrics: (
      accountId: string,
      rawPeriod: unknown,
      procedures: { id: string; name: string }[],
    ) => Promise<{ revenueTotal: number; revenueChangePct: number | null }>;
    listEntries: (
      accountId: string,
      range: { from: string; to: string },
    ) => Promise<{ type: string; amount: number; occurredAt: string }[]>;
  };
}

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

async function revenueHistory(
  deps: DashboardDeps,
  accountId: string,
  todayIso: string,
): Promise<{ month: string; total: number }[]> {
  const [year, month] = todayIso.split("-").map(Number);
  const firstMonth = new Date(Date.UTC(year, month - 6, 1));
  const from = firstMonth.toISOString().slice(0, 10);
  const to = monthRange(todayIso).to;

  const entries = await deps.finance.listEntries(accountId, { from, to });

  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 6 + 1 + i, 1));
    return {
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      month: MONTH_LABELS[d.getUTCMonth()],
      total: 0,
    };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const entry of entries) {
    if (entry.type !== "revenue") continue;
    const key = entry.occurredAt.slice(0, 7);
    const bucket = byKey.get(key);
    if (bucket) bucket.total += entry.amount;
  }

  return buckets.map(({ month, total }) => ({ month, total }));
}

function monthRange(todayIso: string): { from: string; to: string } {
  const [year, month] = todayIso.split("-").map(Number);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function previousMonthRange(todayIso: string): { from: string; to: string } {
  const [year, month] = todayIso.split("-").map(Number);
  const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
  return monthRange(
    `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, "0")}-01`,
  );
}

function completedAndNoShow(appointments: { status: string }[]): {
  completed: number;
  noShowRate: number | null;
} {
  const completed = appointments.filter((a) => a.status === "concluido").length;
  const noShow = appointments.filter((a) => a.status === "nao_compareceu").length;
  return {
    completed,
    noShowRate: appointments.length === 0 ? null : (noShow / appointments.length) * 100,
  };
}

export async function getDashboardOverview(
  deps: DashboardDeps,
  accountId: string,
  todayIso: string,
): Promise<DashboardOverview> {
  const range = monthRange(todayIso);
  const prevRange = previousMonthRange(todayIso);

  const [pipeline, procedures, todaysAppointments, monthAppointments, prevMonthAppointments, history] =
    await Promise.all([
      deps.crm.listPipeline(accountId),
      deps.scheduling.listProcedures(accountId),
      deps.scheduling.listAppointments(accountId, {
        from: `${todayIso}T00:00:00.000Z`,
        to: `${todayIso}T23:59:59.999Z`,
      }),
      deps.scheduling.listAppointments(accountId, {
        from: `${range.from}T00:00:00.000Z`,
        to: `${range.to}T23:59:59.999Z`,
      }),
      deps.scheduling.listAppointments(accountId, {
        from: `${prevRange.from}T00:00:00.000Z`,
        to: `${prevRange.to}T23:59:59.999Z`,
      }),
      revenueHistory(deps, accountId, todayIso),
    ]);

  const financeMetrics = await deps.finance.getDashboardMetrics(accountId, range, procedures);
  const newContactsCount = await deps.crm.countNewContacts(accountId, range.from);
  const prevNewContactsCount = await deps.crm.countNewContacts(accountId, prevRange.from, range.from);

  const pipelineByStage = pipeline.map(({ stage, deals }) => ({
    stageId: stage.id,
    stageName: stage.name,
    stageKind: stage.kind,
    count: deals.length,
  }));

  const current = completedAndNoShow(monthAppointments);
  const previous = completedAndNoShow(prevMonthAppointments);

  const appointmentsCompletedChangePct =
    previous.completed === 0
      ? null
      : ((current.completed - previous.completed) / previous.completed) * 100;

  const noShowRateChangePp =
    current.noShowRate === null || previous.noShowRate === null
      ? null
      : current.noShowRate - previous.noShowRate;

  return {
    revenueTotal: financeMetrics.revenueTotal,
    revenueChangePct: financeMetrics.revenueChangePct,
    appointmentsCompletedCount: current.completed,
    appointmentsCompletedChangePct,
    noShowRatePct: current.noShowRate,
    noShowRateChangePp,
    newContactsCount,
    newContactsChangeCount: newContactsCount - prevNewContactsCount,
    pipelineByStage,
    revenueHistory: history,
    todaysAppointments: todaysAppointments.map((a) => ({
      id: a.id,
      contactName: a.contact.name,
      procedureName: a.procedure.name,
      startsAt: a.startsAt,
      status: a.status,
    })),
  };
}
```

Note on `newContactsChangeCount`: the second test case has `countNewContacts` mocked to always return `0`, so `newContactsCount - prevNewContactsCount` is `0 - 0 = 0`, not `null`. Re-check that test's expectation — it asserts `newContactsChangeCount` is **not** asserted in that second test (only `appointmentsCompletedChangePct`, `noShowRateChangePp` are asserted null there), so this is fine — `newContactsChangeCount` is a plain arithmetic difference, always a number, never null, by design (there's always "some" prior count, even if it's 0). Do not add a null case for it.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/dashboard/service.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Wire `countNewContacts`'s new param through the Server Action**

`src/app/(app)/dashboard/actions.ts` already does `countNewContacts: (accId, sinceIso) => crm.countNewContacts(crmRepo, accId, sinceIso)`. Since the service function now accepts an optional 4th param, update the action's lambda to forward it:

```typescript
      crm: {
        listPipeline: (accId) => crm.listPipeline(crmRepo, accId),
        countNewContacts: (accId, sinceIso, untilIso) =>
          crm.countNewContacts(crmRepo, accId, sinceIso, untilIso),
      },
```

- [ ] **Step 7: Update `dashboard-client.tsx` to show real deltas on all 4 cards**

Replace the four `<Card>` blocks (currently lines 51-105 of `src/components/dashboard/dashboard-client.tsx`) with:

```tsx
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Receita</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-green-100 text-green-700">
                <TrendingUp className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(overview.revenueTotal)}</p>
            <ChangeIndicator pct={overview.revenueChangePct} previousLabel="vs. mês anterior" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Consultas concluídas</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                <CheckCircle2 className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{overview.appointmentsCompletedCount}</p>
            <ChangeIndicator pct={overview.appointmentsCompletedChangePct} previousLabel="vs. mês anterior" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Não comparecimento</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-red-100 text-red-700">
                <UserX className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {overview.noShowRatePct === null ? "—" : `${overview.noShowRatePct.toFixed(1)}%`}
            </p>
            <ChangePointIndicator pp={overview.noShowRateChangePp} previousLabel="vs. mês anterior" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Novos contatos</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                <UserPlus className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{overview.newContactsCount}</p>
            <ChangeCountIndicator count={overview.newContactsChangeCount} previousLabel="vs. mês anterior" />
          </CardContent>
        </Card>
```

(Card titles drop "hoje"/"no mês" suffixes to match the artifact — the period is now always "this month" for all four, so the suffix is redundant.)

Add two new small components next to the existing `ChangeIndicator` (currently lines 30-43), right after it:

```tsx
function ChangePointIndicator({ pp, previousLabel }: { pp: number | null; previousLabel: string }) {
  if (pp === null) {
    return <p className="text-sm text-muted-foreground">Sem dados do período anterior</p>;
  }
  const isUp = pp >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <p className={`flex items-center gap-1 text-sm font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>
      <Icon className="size-3.5" />
      {isUp ? "+" : ""}
      {pp.toFixed(1)}pp {previousLabel}
    </p>
  );
}

function ChangeCountIndicator({ count, previousLabel }: { count: number | null; previousLabel: string }) {
  if (count === null) {
    return <p className="text-sm text-muted-foreground">Sem dados do período anterior</p>;
  }
  const isUp = count >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <p className={`flex items-center gap-1 text-sm font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>
      <Icon className="size-3.5" />
      {isUp ? "+" : ""}
      {count} {previousLabel}
    </p>
  );
}
```

Note: for "Não comparecimento", a **decrease** is the good outcome (fewer no-shows), but this plan keeps the same up-arrow-green / down-arrow-red convention as the other three cards for consistency with the artifact, which colors all four deltas by arithmetic sign (↓1,4pp is shown in red in the artifact even though fewer no-shows is good news) — don't invert the color logic for this one card.

- [ ] **Step 8: Run full suite, typecheck, lint**

```bash
npm run test
npx tsc --noEmit
npm run lint
```

- [ ] **Step 9: Visual verification**

```bash
agent-browser open http://localhost:3000/dashboard
agent-browser wait --load networkidle
agent-browser wait 500
agent-browser screenshot task7-dashboard-deltas.png
```

Read the screenshot. All 4 stat cards should show a colored delta line (or "Sem dados do período anterior" if genuinely no prior data — expect this on a fresh/empty test account).

- [ ] **Step 10: Commit**

```bash
git add src/modules/dashboard/types.ts src/modules/dashboard/service.ts src/modules/dashboard/service.test.ts "src/app/(app)/dashboard/actions.ts" src/components/dashboard/dashboard-client.tsx
git commit -m "feat(dashboard): compute real month-over-month deltas for all 4 stat cards"
```

---

### Task 8: Finance service — expense-by-category and monthly revenue/expense history

**Files:**
- Modify: `src/modules/finance/types.ts`
- Modify: `src/modules/finance/service.ts`
- Test: `src/modules/finance/service.test.ts`

**Interfaces:**
- Produces (`types.ts`): `DashboardMetrics` gains `expenseByCategory: { category: string; total: number }[]` (sorted descending by `total`) and `revenueExpenseHistory: { month: string; revenue: number; expense: number }[]` (6 entries, oldest first, ending in the month of `period.to`).

- [ ] **Step 1: Write the failing tests**

Add to `src/modules/finance/service.test.ts`, inside the existing `describe("getDashboardMetrics", ...)` block, after the `seedAugust` helper (currently ending around line 165) — add two new `it` blocks anywhere inside that `describe`, e.g. right before the closing `});` at line 292:

```typescript
  it("groups expenses by category, sorted by total descending", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "expense", amount: 100, category: "Material", occurredAt: "2026-08-05" },
      null,
    );
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "expense", amount: 300, category: "Aluguel", occurredAt: "2026-08-10" },
      null,
    );
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "expense", amount: 50, category: "Material", occurredAt: "2026-08-15" },
      null,
    );
    // revenue entries must not appear in the expense breakdown
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 999, category: "Atendimento", occurredAt: "2026-08-16" },
      null,
    );

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [],
    );

    expect(metrics.expenseByCategory).toEqual([
      { category: "Aluguel", total: 300 },
      { category: "Material", total: 150 },
    ]);
  });

  it("labels uncategorized expenses as Sem categoria", async () => {
    const repo = createInMemoryFinanceRepository();
    await repo.insertFinancialEntry("acc-1", {
      type: "expense",
      amount: 40,
      defaultAmount: null,
      category: null,
      procedureId: null,
      description: null,
      occurredAt: "2026-08-05",
    });

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [],
    );

    expect(metrics.expenseByCategory).toEqual([{ category: "Sem categoria", total: 40 }]);
  });

  it("builds a 6-month revenue/expense history ending in the period's month", async () => {
    const repo = createInMemoryFinanceRepository();
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 100, category: "Avulso", occurredAt: "2026-06-10" },
      null,
    );
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "expense", amount: 30, category: "Material", occurredAt: "2026-06-12" },
      null,
    );
    await createFinancialEntry(
      repo,
      "acc-1",
      { type: "revenue", amount: 200, category: "Avulso", occurredAt: "2026-08-10" },
      null,
    );

    const metrics = await getDashboardMetrics(
      repo,
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [],
    );

    expect(metrics.revenueExpenseHistory).toHaveLength(6);
    expect(metrics.revenueExpenseHistory[metrics.revenueExpenseHistory.length - 1]).toEqual({
      month: "Ago",
      revenue: 200,
      expense: 0,
    });
    const june = metrics.revenueExpenseHistory.find((m) => m.month === "Jun");
    expect(june).toEqual({ month: "Jun", revenue: 100, expense: 30 });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/finance/service.test.ts`
Expected: FAIL — `metrics.expenseByCategory` and `metrics.revenueExpenseHistory` are `undefined`.

- [ ] **Step 3: Extend `DashboardMetrics` type**

In `src/modules/finance/types.ts`, add to the `DashboardMetrics` interface (after `topProcedures`):

```typescript
export interface DashboardMetrics {
  period: { from: string; to: string };
  revenueTotal: number;
  expenseTotal: number;
  balance: number;
  revenueChangePct: number | null;
  averageTicket: number | null;
  topProcedures: ProcedureSalesSummary[];
  expenseByCategory: { category: string; total: number }[];
  revenueExpenseHistory: { month: string; revenue: number; expense: number }[];
  cancellationRate: CancellationRateMetric;
}
```

- [ ] **Step 4: Implement the aggregations in `service.ts`**

In `src/modules/finance/service.ts`, add these helper functions and the month-labels constant near the top of the file (after the imports):

```typescript
const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function groupExpensesByCategory(entries: FinancialEntry[]): { category: string; total: number }[] {
  const byCategory = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== "expense") continue;
    const category = entry.category ?? "Sem categoria";
    byCategory.set(category, (byCategory.get(category) ?? 0) + entry.amount);
  }
  return [...byCategory.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

async function buildRevenueExpenseHistory(
  repo: FinanceRepository,
  accountId: string,
  anchorIso: string,
): Promise<{ month: string; revenue: number; expense: number }[]> {
  const [year, month] = anchorIso.split("-").map(Number);
  const firstMonth = new Date(Date.UTC(year, month - 6, 1));
  const from = firstMonth.toISOString().slice(0, 10);
  const lastDayOfAnchorMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfAnchorMonth).padStart(2, "0")}`;

  const entries = await repo.listFinancialEntries(accountId, { from, to });

  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 6 + 1 + i, 1));
    return {
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      month: MONTH_LABELS[d.getUTCMonth()],
      revenue: 0,
      expense: 0,
    };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const entry of entries) {
    const key = entry.occurredAt.slice(0, 7);
    const bucket = byKey.get(key);
    if (!bucket) continue;
    if (entry.type === "revenue") bucket.revenue += entry.amount;
    else bucket.expense += entry.amount;
  }

  return buckets.map(({ month, revenue, expense }) => ({ month, revenue, expense }));
}
```

Then, inside `getDashboardMetrics`, add the two new fields to the returned object. The function currently ends with:

```typescript
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
```

Change to:

```typescript
  const expenseByCategory = groupExpensesByCategory(entries);
  const revenueExpenseHistory = await buildRevenueExpenseHistory(repo, accountId, period.to);

  return {
    period,
    revenueTotal,
    expenseTotal,
    balance: revenueTotal - expenseTotal,
    revenueChangePct:
      prevRevenueTotal === 0 ? null : ((revenueTotal - prevRevenueTotal) / prevRevenueTotal) * 100,
    averageTicket: revenueEntries.length === 0 ? null : revenueTotal / revenueEntries.length,
    topProcedures: summarizeByProcedure(revenueEntries, procedureNames),
    expenseByCategory,
    revenueExpenseHistory,
    cancellationRate: { available: false },
  };
```

(`entries` here is the same variable already in scope from `const entries = await repo.listFinancialEntries(accountId, period);` earlier in the function — reuse it, don't refetch.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/modules/finance/service.test.ts`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 6: Run full suite and typecheck**

```bash
npm run test
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/finance/types.ts src/modules/finance/service.ts src/modules/finance/service.test.ts
git commit -m "feat(finance): add expense-by-category and 6-month revenue/expense history"
```

---

### Task 9: Financeiro UI — Saldo card, monthly trend chart, "Por categoria" card

Replaces the "Taxa de cancelamento" card (not in the artifact) with "Saldo", replaces the 2-bar single-period chart with a 6-month grouped trend chart, and adds the "Por categoria" horizontal-bar breakdown — using `expenseByCategory` and `revenueExpenseHistory` from Task 8.

**Files:**
- Modify: `src/components/finance/finance-dashboard-client.tsx`

**Interfaces:**
- Consumes: `DashboardMetrics.expenseByCategory`, `DashboardMetrics.revenueExpenseHistory` (from Task 8), `formatCurrency` (from Task 2).

- [ ] **Step 1: Replace the 4th stat card and the chart section**

The current file (post-Task-2) has, in order: preset buttons, 4 stat cards (Receita, Despesa, Ticket médio, Taxa de cancelamento), one `Receita x Despesa` bar chart card, one `Procedimentos mais vendidos` card. Replace the **4th card** (`Taxa de cancelamento`, currently lines 142-155) with:

```tsx
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Saldo</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                <Wallet className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(metrics.balance)}</p>
          </CardContent>
        </Card>
```

Add `Wallet` to the lucide-react import at the top of the file (currently `import { CalendarX, Receipt, TrendingDown, TrendingUp } from "lucide-react";`):

```typescript
import { Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";
```

(`CalendarX` is now unused since the "Taxa de cancelamento" card is gone — remove it from the import, don't leave a dead import.)

- [ ] **Step 2: Replace the "Receita x Despesa" chart with the monthly trend chart**

Replace the whole chart `<Card>` block (currently the `Receita x Despesa` card with `chartData`/`BarChart` inside it) with:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Receita vs. despesas</CardTitle>
          <p className="text-sm text-muted-foreground">Comparativo mensal</p>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.revenueExpenseHistory}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend
                  formatter={(value) => (value === "revenue" ? "Entradas" : "Saídas")}
                  iconType="circle"
                />
                <Bar dataKey="revenue" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#f87171" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
```

Update the recharts import at the top of the file. Remove `Cell` (no longer used — the old chart used per-bar `<Cell>` coloring, the new one uses one fill per `<Bar>`), add `Legend`:

```typescript
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
```

Remove the now-unused local `chartData` constant (the `const chartData = [...]` block that built the 2-item array for the old chart) — delete it entirely.

- [ ] **Step 3: Add the "Por categoria" card**

Right after the "Receita vs. despesas" card (and before the existing "Procedimentos mais vendidos" card), add:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Por categoria</CardTitle>
          <p className="text-sm text-muted-foreground">Despesas do período</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {metrics.expenseByCategory.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma despesa neste período.</p>
          )}
          {metrics.expenseByCategory.length > 0 &&
            (() => {
              const max = Math.max(...metrics.expenseByCategory.map((c) => c.total));
              return metrics.expenseByCategory.map((c) => (
                <div key={c.category} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-sm text-muted-foreground">{c.category}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-red-400"
                      style={{ width: `${(c.total / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {formatCurrency(c.total)}
                  </span>
                </div>
              ));
            })()}
        </CardContent>
      </Card>
```

(Value is always visible as text next to the bar, sorted descending by construction from `groupExpensesByCategory` in Task 8 — matches the accessibility guidance for "Compare Categories" chart types: labels always visible, not hover-only.)

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors, no unused imports (`CalendarX`, `Cell`, and the old `chartData` should all be gone).

- [ ] **Step 5: Run full suite and lint**

```bash
npm run test
npm run lint
```

- [ ] **Step 6: Visual verification**

```bash
agent-browser open http://localhost:3000/financeiro
agent-browser wait --load networkidle
agent-browser wait 700
agent-browser screenshot task9-financeiro.png
```

Read the screenshot against `artifact-financeiro.png`. Expect: 4th card says "Saldo" not "Taxa de cancelamento"; chart is titled "Receita vs. despesas" with a green/pink legend; a new "Por categoria" card with horizontal bars appears below it.

- [ ] **Step 7: Commit**

```bash
git add src/components/finance/finance-dashboard-client.tsx
git commit -m "feat(financeiro): replace cancellation-rate card with Saldo, monthly trend chart, and category breakdown"
```

---

### Task 10: Pipeline — column header eyebrow style

**Files:**
- Modify: `src/components/pipeline/kanban-column.tsx`

**Interfaces:** None — presentational only.

- [ ] **Step 1: Restyle the column header**

Current header block (lines 25-35 of `src/components/pipeline/kanban-column.tsx`):

```tsx
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className="size-2 rounded-full"
          style={{
            backgroundColor:
              stage.kind === "follow_up" ? "#c2790a" : stage.kind === "lost" ? "#9ca3af" : "var(--primary)",
          }}
        />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{stage.name}</h2>
        <span className="text-xs text-muted-foreground">{deals.length}</span>
      </div>
```

Replace with:

```tsx
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className="size-2 rounded-full"
          style={{
            backgroundColor:
              stage.kind === "follow_up" ? "#c2790a" : stage.kind === "lost" ? "#9ca3af" : "var(--primary)",
          }}
        />
        <h2 className="flex-1 truncate font-mono text-[10px] font-bold tracking-[0.18em] text-foreground uppercase">
          {stage.name}
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {deals.length}
        </span>
      </div>
```

(Matches the mono/uppercase/tracking-wide "eyebrow" pattern already used for sidebar group labels — see `NavGroup` in `src/components/layout/sidebar.tsx`, which uses `font-mono text-[10px] font-bold tracking-[0.18em] ... uppercase`.)

- [ ] **Step 2: Visual verification**

```bash
agent-browser open http://localhost:3000/pipeline
agent-browser wait --load networkidle
agent-browser wait 500
agent-browser screenshot task10-pipeline-columns.png
```

Read the screenshot. Column headers should be small uppercase mono text with a rounded count badge, not plain title-case text with a bare number.

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline/kanban-column.tsx
git commit -m "fix(pipeline): style column headers as mono uppercase eyebrow + count badge, matching design system"
```

---

### Task 11: Agenda — month-view CSS polish

Keeps both "Semana" and "Mês" toggles exactly as they are (per explicit user instruction — do not touch `agenda-client.tsx`'s view-switching logic). Only restyles the month-view grid's default `react-big-calendar` look to sit closer to the artifact's card-like month grid: lighter borders, white cell background, today-highlight in the brand color instead of the library default blue.

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:** None — pure CSS, scoped to `react-big-calendar`'s month-view class names (`.rbc-month-view`, `.rbc-off-range-bg`, `.rbc-today`, `.rbc-date-cell`).

**Scope note:** This is a CSS-only pass on top of the existing calendar library, not a rebuild of the month grid to pixel-match the artifact's custom mock (which would mean dropping `react-big-calendar` — out of proportion for this plan; flag to the user separately if full pixel parity turns out to matter more than this pass delivers).

- [ ] **Step 1: Add month-view overrides**

Append to `src/app/globals.css`, after the existing `.rbc-event.*` rules (currently lines 6-10):

```css
.rbc-month-view {
  border-color: var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.rbc-month-row + .rbc-month-row {
  border-color: var(--border);
}
.rbc-day-bg + .rbc-day-bg {
  border-color: var(--border);
}
.rbc-header {
  border-color: var(--border);
  padding: 8px 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
}
.rbc-off-range-bg {
  background: var(--muted);
}
.rbc-today {
  background-color: color-mix(in oklch, var(--primary) 8%, transparent);
}
.rbc-date-cell {
  padding: 6px 8px;
  font-size: 0.8125rem;
}
```

- [ ] **Step 2: Switch to month view and screenshot**

```bash
agent-browser open http://localhost:3000/agenda
agent-browser wait --load networkidle
agent-browser find text "Mês" click
agent-browser wait 400
agent-browser screenshot task11-agenda-month.png
```

Read the screenshot against `artifact-local.png`. Also click "Semana" to confirm that view still works unchanged:

```bash
agent-browser find text "Semana" click
agent-browser wait 400
agent-browser screenshot task11-agenda-week.png
```

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style(agenda): lighten react-big-calendar month-view grid to match design system"
```

---

### Task 12: Agendamento — horizontal day-picker strip

Replaces the bare `<input type="date">` in step 2 of the booking wizard with a horizontal strip of the next 14 days, each showing a 3-letter uppercase weekday + day number, matching the artifact's "SEG 17 / 18 / 19 / 20 / 21 / 22" carousel.

**Files:**
- Modify: `src/components/agendamento/booking-wizard.tsx`

**Interfaces:** None — internal presentational change; `date` state stays a `YYYY-MM-DD` string, same as today, so nothing downstream (`checkConflictAction`, `createAppointmentAction`, the `Resumo` panel) needs to change.

- [ ] **Step 1: Add a day-strip generator and sub-component**

In `src/components/agendamento/booking-wizard.tsx`, add near the top of the file (after the existing `todayInputValue` function):

```typescript
const WEEKDAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function generateDayStrip(days: number): { value: string; weekday: string; day: number }[] {
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      weekday: WEEKDAY_LABELS[d.getDay()],
      day: d.getDate(),
    };
  });
}

function DayStrip({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (value: string) => void;
}) {
  const days = generateDayStrip(14);
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {days.map((d) => (
        <button
          key={d.value}
          type="button"
          onClick={() => onSelect(d.value)}
          className={cn(
            "flex w-14 shrink-0 flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center transition-colors",
            selected === d.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted",
          )}
        >
          <span className="text-[10px] font-bold tracking-wide uppercase opacity-70">{d.weekday}</span>
          <span className="text-sm font-semibold">{d.day}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Swap the date `<Input>` for `<DayStrip>` in the "datetime" step**

Current block inside the `step === "datetime"` branch:

```tsx
              <div className="space-y-1">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSlot(null);
                  }}
                />
              </div>
```

Replace with:

```tsx
              <div className="space-y-1">
                <Label>Escolha o dia</Label>
                <DayStrip
                  selected={date}
                  onSelect={(value) => {
                    setDate(value);
                    setSlot(null);
                  }}
                />
              </div>
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. (If `Input` becomes unused elsewhere in the file — it's still used for the contact search field — no import cleanup needed.)

- [ ] **Step 4: Run full suite and lint**

```bash
npm run test
npm run lint
```

- [ ] **Step 5: Visual + functional verification**

```bash
agent-browser open http://localhost:3000/agendamento
agent-browser wait --load networkidle
agent-browser wait 500
agent-browser snapshot -i -c
```

If a procedure exists for the test account, click it, click "Próximo", and screenshot the datetime step:

```bash
agent-browser screenshot task12-agendamento-daystrip.png
```

Read the screenshot against `artifact-agendamento.png`. Expect a horizontal row of day buttons (3-letter weekday + number) instead of a native date input, with today's/selected day highlighted in the brand orange.

If the test account has zero procedures seeded, this step can only be verified by reading the code (Steps 1-2) plus the passing typecheck/lint/test run — note that in the task's completion summary rather than skipping verification silently.

- [ ] **Step 6: Commit**

```bash
git add src/components/agendamento/booking-wizard.tsx
git commit -m "feat(agendamento): replace native date input with a horizontal day-picker strip"
```

---

## Self-Review Notes

- **Spec coverage:** All 12 items from the consolidated findings list (currency formatting, agenda legend, sidebar icons ×2, sidebar name, dashboard deltas ×4 cards, Financeiro cards/chart/category-breakdown, pipeline header style, agenda month-view polish, agendamento day-strip) map 1:1 to Tasks 1-12. The two explicit user directives from this turn (week/month both stay selectable; brand color is exactly `#FF7900`) are covered by Task 11's scope note and Task 1 respectively.
- **Placeholder scan:** No TBD/TODO markers; every step has literal code, not a description of code.
- **Type consistency:** `DashboardOverview` (Task 7) and `DashboardMetrics` (Task 8) field names are used identically in their respective service, test, and component files. `countNewContacts`'s new `untilIso?` parameter (Task 5) has matching signatures across `repository.ts`, `repository.memory.ts`, `repository.supabase.ts`, and `service.ts`, and Task 7's dashboard service calls it with the exact same optional-third-arg shape.
- **Ordering:** Task 5 (countNewContacts bound) must land before Task 7 (dashboard deltas) — enforced by numbering. Task 2 (formatCurrency) should land before Tasks 7, 9, 12 since those reference `formatCurrency` from `@/lib/format` — enforced by numbering. Tasks 3, 4, 6, 10, 11 have no dependencies on each other and could run in any order, but are numbered for a sensible narrative (quick wins first).
