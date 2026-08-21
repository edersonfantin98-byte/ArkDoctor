# Visual Redesign & New Modules (Dashboard, Agendamento, WhatsApp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the real Next.js app in line with the approved 7-screen prototype (Login, Sidebar/shell, Agenda, Pipeline, Financeiro, Dashboard, Agendamento, WhatsApp) — pixel-accurate for the pieces the prototype fully specified, and cleanly scoped new modules for the three screens that don't exist yet.

**Architecture:** Five independent phases, ordered so nothing in a later phase blocks on an earlier one being "perfect" first:
- **Phase A** — brand shell (logo assets, Sidebar, PageHeader, Login) — pure UI, touches every page indirectly via shared components.
- **Phase B** — visual parity pass on the three pages that already have real data behind them (Pipeline, Agenda, Financeiro) — styling only, zero behavior change.
- **Phase C** — Dashboard: a new page that *aggregates* existing modules (crm, scheduling, finance) — no new domain, no new tables.
- **Phase D** — Agendamento: a new *staff-facing* booking wizard UI that calls the scheduling module's existing server actions (`createAppointmentAction`, `listProceduresAction`, `searchContactsAction`, `checkConflictAction`) — no new domain, no new tables. (The prototype's "Paciente" sidebar group is misleading: patients aren't authenticated Next.js users in this app, so this ships as a guided in-app wizard staff use when a patient calls/messages to book — a true public self-service booking page is out of scope here and would need its own auth-less spec.)
- **Phase E** — WhatsApp: a genuinely new domain (`src/modules/whatsapp/`) with its own tables, repository, service, following the exact pattern established by `src/modules/finance/`. Ships with a manual "log a conversation" UI — wiring to the real WhatsApp Business Cloud API is a separate future spec (this phase does not attempt provider integration; it builds the data model and UI so that integration is a repository-only change later).

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, Supabase (Postgres + RLS), Vitest, Tailwind + shadcn/ui, lucide-react, Recharts (already a dependency).

**Spec:** `docs/superpowers/specs/2026-08-20-arkdoctor-visual-design.md` (design system — palette, type scale, radii, component conventions). The prototype referenced throughout this plan is the Artifact built across this session (URL: `https://claude.ai/code/artifact/4a2a30b0-9b03-4c95-acb9-3b8d4e8e893b`) — every visual decision below (floating login card, centered sidebar logo, no eyebrow label, kanban/KPI treatments) traces back to explicit user feedback on that prototype, captured inline per task.

## Global Constraints

- No dark mode (per design system doc) — do not add `dark:` variants to any new class.
- Primary orange is already `--primary` in `src/app/globals.css` (`oklch(0.705 0.191 41.6)` ≈ `#FF7900`) — never hardcode the hex, always use `bg-primary` / `text-primary` / `var(--primary)`.
- Page background is already `--background` (`oklch(0.94 0 0)` ≈ `#efefef`), sidebar background is already `--sidebar` (dark) — reuse these tokens, don't introduce new ones.
- No component-level tests exist anywhere in this codebase (`grep -r "\.test\.tsx"` returns nothing) — the established testing boundary is service/repository layers only (Vitest, see `src/modules/finance/repository.memory.test.ts`). Follow that boundary: write tests for Phase E's repository/service, do not invent component tests for Phases A/B/C/D.
- Every new/modified server action follows the existing `getReposAndAccount()`-per-route-file pattern (see `src/app/(app)/agenda/actions.ts`) — never call `getCurrentAccountId` inline in a page or client component.
- Repository methods never throw raw Postgres/PostgREST errors — use the `throwDbError` pattern (log server-side via `console.error`, throw a generic Portuguese `Error`), exactly as in `src/modules/crm/repository.supabase.ts:15-18`.
- RLS on every new table: `account_id in (select account_id from account_users where user_id = auth.uid())`, pinned `to authenticated` — same policy shape as `supabase/migrations/0005_finance.sql`.
- Money values: `numeric(10,2)` in Postgres, `number` in TS, repository mappers `Number(...)` them (Supabase returns numeric as string).
- Dates/times that must avoid timezone drift use plain string comparison (`date` / ISO string), never `Date` object arithmetic across a day boundary — same rule as the finance plan.

---

## Phase A — Brand Shell

### Task 1: Logo assets

**Files:**
- Create: `public/logo/arkdoctor-mark.webp` (two-tone: white "Ark" + orange "Doctor" + orange pinwheel icon — for the dark sidebar)
- Create: `public/logo/arkdoctor-mark-solid.png` (solid-orange recolor of the same mark — for the white login panel)
- Create (temporary, delete after running once): `scripts/make-orange-logo.mjs`

**Interfaces:**
- Produces: two static image files under `public/logo/` that Tasks 2 and 4 `<img>`-reference by path (`/logo/arkdoctor-mark.webp`, `/logo/arkdoctor-mark-solid.png`).

- [ ] **Step 1: Copy the two-tone source logo into `public/`**

```bash
mkdir -p public/logo
cp "Logo/LOGO ARKTROS.webp" public/logo/arkdoctor-mark.webp
```

- [ ] **Step 2: Generate the solid-orange variant with `sharp` (already a transitive dependency via Next.js)**

Create `scripts/make-orange-logo.mjs`:

```js
import sharp from "sharp";

const inPath = "public/logo/arkdoctor-mark.webp";
const outPath = "public/logo/arkdoctor-mark-solid.png";

const resizedBuf = await sharp(inPath).ensureAlpha().resize({ width: 900 }).png().toBuffer();
const { width, height } = await sharp(resizedBuf).metadata();

const orangeSolid = await sharp({
  create: { width, height, channels: 4, background: { r: 255, g: 121, b: 0, alpha: 1 } },
}).png().toBuffer();

await sharp(orangeSolid)
  .composite([{ input: resizedBuf, blend: "dest-in" }])
  .png({ compressionLevel: 9, palette: true })
  .toFile(outPath);

console.log("wrote", outPath, width, "x", height);
```

Why `dest-in`: it's a Porter-Duff compositing mode that keeps the *destination* color (the solid orange layer) only where the *source* (the original logo) has alpha > 0, using the source's alpha value as a mask. This recolors every non-transparent pixel — icon, "Ark", and "Doctor" alike — to the same orange while preserving the original anti-aliased edges. RGB values of the source are irrelevant to `dest-in`, which is exactly what's needed here since the source has two different colors (white + orange) that both need to become one.

- [ ] **Step 3: Run it and verify output**

```bash
node scripts/make-orange-logo.mjs
```

Expected: `wrote public/logo/arkdoctor-mark-solid.png 900 x <height>`, and the file exists at a reasonable size (~10-15KB, not hundreds of KB — if it's huge, the `resize` step didn't run before `composite`, re-check step order).

- [ ] **Step 4: Delete the script and commit only the two image files**

```bash
rm scripts/make-orange-logo.mjs
git add public/logo/arkdoctor-mark.webp public/logo/arkdoctor-mark-solid.png
git commit -m "assets: add ArkDoctor logo marks (two-tone + solid-orange variants)"
```

---

### Task 2: Sidebar — centered logo, no subtitle, enable all built modules

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Consumes: `public/logo/arkdoctor-mark.webp` (Task 1).
- Produces: no signature change — `Sidebar({ userEmail })` stays the same, so `src/app/(app)/layout.tsx:12` needs no edit.

**Why:** user feedback across the session, in order: (1) "aumente a logo e centralize na sidebar assim como nas imagens" — reference screenshots of ArkGestor/Arkatálogo show the logo large and centered, no product-name subtitle under it. (2) The `enabled: false` gate on Dashboard/WhatsApp in the current sidebar predates those modules existing — Phases C/D/E in this plan build all of them, so the gate should flip to `true` as each phase lands.

- [ ] **Step 1: Replace the text wordmark with the centered image logo**

In `src/components/layout/sidebar.tsx`, replace lines 33-37:

```tsx
      <div className="px-5 py-6">
        <span className="text-lg font-bold tracking-tight">
          Ark<span className="text-primary">Doctor</span>
        </span>
      </div>
```

with:

```tsx
      <div className="flex justify-center px-5 pt-6 pb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/arkdoctor-mark.webp" alt="ArkDoctor" className="h-9 w-auto" />
      </div>
```

(Plain `<img>`, not `next/image`: the source is a fixed, pre-optimized static asset with no responsive-sizing need, and `next/image` requires an explicit `width`/`height` pair that would fight the `h-9 w-auto` aspect-ratio-preserving sizing used here — matching how the rest of this codebase has no other `next/image` usage to be consistent with.)

- [ ] **Step 2: Add the "Agendamento" nav entry and reorganize into labeled groups matching the prototype**

Replace the flat `modules` array (lines 18-25) with three grouped arrays, and update the render loop to emit a group label + items per group. Full replacement of lines 18-76:

```tsx
const generalModules = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, enabled: true },
  { label: "Pipeline", href: "/pipeline", icon: KanbanSquare, enabled: true },
  { label: "Agenda", href: "/agenda", icon: CalendarDays, enabled: true },
  { label: "Financeiro", href: "/financeiro", icon: Wallet, enabled: true },
  { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle, enabled: true },
];
const patientModules = [
  { label: "Agendamento", href: "/agendamento", icon: CalendarPlus, enabled: true },
];
const systemModules = [
  { label: "Configurações", href: "/configuracoes", icon: Settings, enabled: false },
];

function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: { label: string; href: string; icon: typeof LayoutDashboard; enabled: boolean }[];
  pathname: string;
}) {
  return (
    <div className="mb-4">
      <p className="px-3 pb-2 font-mono text-[10px] font-bold tracking-[0.18em] text-sidebar-foreground/30 uppercase">
        {label}
      </p>
      {items.map(({ label, href, icon: Icon, enabled }) => {
        const isActive = enabled && pathname.startsWith(href);

        if (!enabled) {
          return (
            <div
              key={href}
              className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sidebar-foreground/40"
            >
              <span className="flex items-center gap-2 text-sm">
                <Icon className="size-4" />
                {label}
              </span>
              <span className="rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] uppercase tracking-wide">
                em breve
              </span>
            </div>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
```

And add `CalendarPlus` to the `lucide-react` import on line 5-13.

- [ ] **Step 3: Wire the groups into the render**

Replace the `<nav>` block (lines 39-76) with:

```tsx
      <nav className="flex-1 px-3">
        <NavGroup label="Geral" items={generalModules} pathname={pathname} />
        <NavGroup label="Paciente" items={patientModules} pathname={pathname} />
        <NavGroup label="Sistema" items={systemModules} pathname={pathname} />
      </nav>
```

- [ ] **Step 4: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint src/components/layout/sidebar.tsx
```

Expected: no errors. (`Dashboard`/`WhatsApp`/`Agendamento` links will 404 until Phases C/D/E land — that's expected and fine mid-plan; if executing phases out of order, temporarily leave those three `enabled: false` and flip them true in that phase's own task instead.)

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat(shell): centered logo mark, grouped nav, enable Dashboard/WhatsApp/Agendamento"
```

---

### Task 3: PageHeader — drop the orange eyebrow label

**Files:**
- Modify: `src/components/layout/page-header.tsx`
- Modify (caller updates — remove the now-unused `eyebrow` prop at each call site): `src/app/(app)/pipeline/page.tsx`, `src/app/(app)/agenda/page.tsx`, `src/app/(app)/financeiro/page.tsx`, `src/app/(app)/financeiro/lancamentos/page.tsx`

**Why:** explicit user feedback mid-session: *"em todas as telas, acima do título, temos uma palavra curta, como agenda, agendamento e etc. É essa que quero remover... na tela de agenda temos o 'Visão Geral' e acima tem — AGENDA em laranja"* — the eyebrow was removed from every screen in the prototype and confirmed. `PageHeader` is the one shared component that puts it there, so this is a single-file source-of-truth fix plus dropping the now-dead prop from callers.

- [ ] **Step 1: Remove the eyebrow markup and prop**

Replace all of `src/components/layout/page-header.tsx`:

```tsx
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 2: Remove the `eyebrow="..."` prop from every call site**

```bash
grep -rn 'eyebrow=' src/app
```

For each match, delete just that one JSX attribute line (the rest of the `<PageHeader ... />` call stays as-is).

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors (TypeScript will flag any call site missed in Step 2 as an "unknown prop `eyebrow`" error — fix any that show up).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/page-header.tsx src/app
git commit -m "fix(shell): remove eyebrow label from PageHeader, per approved design"
```

---

### Task 4: Login — floating centered card, solid-orange logo, no split-viewport

**Files:**
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `loginAction` from `./actions` (unchanged), `public/logo/arkdoctor-mark-solid.png` (Task 1).

**Why:** two rounds of user correction this session. First: *"tem certeza que viu a imagem de tela de login?"* — live-checked `arkgestor.com.br/admin` and `agrocentro.arkatalago.com.br/admin`, both confirmed a **floating rounded card on a neutral page background**, not edge-to-edge split. Second: the ArkDoctor logo's white "Ark" text disappears on a white background — reference sites use a single-color logo, so this task uses the solid-orange PNG from Task 1, centered above the "Entrar" title, no chip/background needed since it's already one flat color.

- [ ] **Step 1: Replace the page shell — split `<main>` → centered card on `bg-background`**

Replace `src/app/login/page.tsx` lines 21-23 and 63-66 (the outer `<main>` open/close), keeping the `benefits` array and everything inside as-is except where noted below. Full file:

```tsx
import { KanbanSquare, CalendarDays, Wallet, MessageCircle } from "lucide-react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const benefits = [
  { icon: KanbanSquare, text: "Pipeline de clientes, do primeiro contato ao pós-atendimento" },
  { icon: CalendarDays, text: "Agenda sem conflitos de horário" },
  { icon: Wallet, text: "Financeiro vinculado aos seus atendimentos" },
  { icon: MessageCircle, text: "WhatsApp centralizado com o histórico do cliente" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl shadow-2xl md:grid-cols-2">
        <div className="hidden flex-col justify-center gap-10 bg-primary px-16 py-14 text-primary-foreground md:flex">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-balance">
              Seja bem-vindo ao ArkDoctor
            </h1>
          </div>
          <ul className="space-y-4">
            {benefits.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/15">
                  <Icon className="size-4.5" />
                </span>
                <span className="text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex w-full items-center justify-center bg-card p-10">
          <form action={loginAction} className="w-full max-w-sm space-y-4">
            <div className="mb-2 flex flex-col items-center gap-4 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo/arkdoctor-mark-solid.png" alt="ArkDoctor" className="h-8 w-auto" />
              <div>
                <h2 className="text-xl font-semibold">Entrar</h2>
                <p className="text-sm text-muted-foreground">Acesse o painel da sua clínica.</p>
              </div>
            </div>
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
        </div>
      </div>
    </main>
  );
}
```

Notable deliberate changes from the previous version:
- Outer `<main>` centers a `max-w-4xl` card instead of filling the viewport edge-to-edge.
- `rounded-3xl shadow-2xl` on the grid wrapper is the floating-card look; each half no longer needs its own rounding.
- The small `md:hidden` mobile wordmark that used to sit above "Entrar" is now the solid-orange logo image, shown at all breakpoints (it was conditionally hidden before only because the orange panel's wordmark handled desktop — now the desktop orange panel has no wordmark of its own by design, matching the prototype, so the form-side logo is the only one and must always render).
- The orange panel's `<span>` wordmark was removed entirely — the prototype has no logo on the orange side, only headline + benefits.

- [ ] **Step 2: Typecheck and run the app locally to eyeball it**

```bash
npx tsc --noEmit
npm run dev
```

Visit `/login`, confirm: centered card with visible margin/shadow on all sides, orange panel has no logo, white panel has the solid-orange logo centered above "Entrar".

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "fix(login): floating centered card layout, solid-orange logo, matches approved prototype"
```

---

## Phase B — Visual Parity Pass (existing real pages)

These three pages already have full backend logic (drag-and-drop kanban, `react-big-calendar`, Recharts). This phase is **styling-only** — no props, no server actions, no data shapes change. Each task is independently skippable/reorderable.

### Task 5: Pipeline — kanban card and column chrome

**Files:**
- Modify: `src/components/pipeline/deal-card.tsx`
- Modify: `src/components/pipeline/kanban-column.tsx`

**Why:** prototype kanban cards use a colored status dot in the column header and a pastel status badge on the card (`badge green/blue/amber`, per the semantic-color rule in the design system doc), rather than the current plain `outline` badge only shown for `follow_up`/`lost`.

- [ ] **Step 1: Give every stage kind a pastel badge, not just follow_up/lost**

In `src/components/pipeline/deal-card.tsx`, replace the `stageKindBadge` map (lines 11-14) to cover `normal` too, and always render a badge:

```tsx
const stageKindBadge: Record<StageKind, { label: string; className: string }> = {
  normal: { label: "Em andamento", className: "bg-primary/10 text-primary" },
  follow_up: { label: "Follow-up", className: "bg-amber-100 text-amber-700" },
  lost: { label: "Perdido", className: "bg-muted text-muted-foreground" },
};
```

Then change line 40 (`const kindBadge = stage ? stageKindBadge[stage.kind] : undefined;`) usage at line 59 from `{kindBadge && (...)}` to always render when `stage` exists — since the map is now total, drop the `Partial<>` wrapper import concern (it's a local `Record`, not imported) and simplify:

```tsx
{stage && (
  <Badge variant="outline" className={stageKindBadge[stage.kind].className}>
    {stageKindBadge[stage.kind].label}
  </Badge>
)}
```

- [ ] **Step 2: Add a status dot next to the column title**

In `src/components/pipeline/kanban-column.tsx`, the header (lines 25-28) becomes:

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

- [ ] **Step 3: Typecheck, run existing pipeline tests, visually check `/pipeline`**

```bash
npx tsc --noEmit
npx vitest run src/modules/crm
npm run dev
```

Visit `/pipeline`, confirm every card shows a badge and every column header shows a colored dot.

- [ ] **Step 4: Commit**

```bash
git add src/components/pipeline/deal-card.tsx src/components/pipeline/kanban-column.tsx
git commit -m "style(pipeline): pastel status badges on every card, colored dot on column headers"
```

---

### Task 6: Agenda — legend chip and status-color parity

**Files:**
- Modify: `src/components/agenda/calendar-view.tsx` or its page wrapper (whichever renders the legend today — check `src/app/(app)/agenda/page.tsx` first; if no legend exists yet, add one to the page)
- Modify: `src/app/globals.css` (status colors already exist at lines 6-10 — verify hex values match the design system table exactly, adjust if not)

**Why:** the design system doc's Agenda section (`docs/superpowers/specs/2026-08-20-arkdoctor-visual-design.md`) specifies exact status colors (confirmado=azul, concluído=verde, cancelado/não compareceu=vermelho, pendente=âmbar, bloqueio=cinza hachurado) which the prototype rendered as a legend row above the calendar. **This task does not replace `react-big-calendar`** — the prototype's static HTML month grid was a mockup convenience, not a real calendar widget; keeping `react-big-calendar` (multi-view, drag-resize, already-shipped) is the right call. Scope here is: (a) confirm/fix the 5 status colors already defined in `globals.css:6-10` against the design doc table, (b) add the missing legend row if `agenda/page.tsx` doesn't already have one.

- [ ] **Step 1: Read the current Agenda page and confirm whether a legend exists**

```bash
grep -n "legend\|Confirmado\|Concluído" src/app/(app)/agenda/page.tsx src/components/agenda/*.tsx
```

If a legend already exists, skip to Step 3. If not, continue to Step 2.

- [ ] **Step 2: Add the legend row**

In `src/app/(app)/agenda/page.tsx`, above wherever `<CalendarView />` is rendered, add:

```tsx
<div className="flex flex-wrap gap-4 px-6 pb-4 text-xs text-muted-foreground">
  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-700" />Confirmado</span>
  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-green-600" />Concluído</span>
  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-red-600" />Cancelado / não compareceu</span>
  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-600" />Pendente de status</span>
  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-gray-300" />Indisponibilidade</span>
</div>
```

- [ ] **Step 3: Diff the 5 CSS rules in `src/app/globals.css:6-10` against the design doc table**

Design doc values: confirmado = azul `#1D4ED8`, concluído = verde, cancelado/não compareceu = vermelho, pendente = âmbar, bloqueio = cinza. Current CSS (lines 6-10) already uses `#1d4ed8` for confirmado border — verify the rest match this same pastel-bg/saturated-text-or-border pattern; adjust any that don't (e.g. if `rbc-event-agendado` uses amber but the prototype's "pendente de status" and "agendado" states got conflated, split them into two distinct classes and update `statusClassName` in `calendar-view.tsx:31-37` accordingly).

- [ ] **Step 4: Typecheck, run scheduling tests, visually check `/agenda`**

```bash
npx tsc --noEmit
npx vitest run src/modules/scheduling
npm run dev
```

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/\(app\)/agenda/page.tsx
git commit -m "style(agenda): add status legend, confirm event colors match design system"
```

---

### Task 7: Financeiro — KPI card icon-chip parity

**Files:**
- Modify: `src/components/finance/finance-dashboard-client.tsx`

**Why:** the prototype's KPI cards use a colored icon chip *above* the label (icon in a pastel-background rounded square), which `finance-dashboard-client.tsx` already does (lines 85-88, 101-104, 113-115, 126-128) — this page is **already close to spec**. The one gap: the 4th card ("Taxa de cancelamento") is a placeholder (`—`) with no chip-icon treatment consistency issue — actually check current chip colors against the semantic table (green=receita ✓, red=despesa ✓, primary=ticket médio ✓ but design doc reserves blue for a specific pipeline-only use — verify against doc before changing, this may already be correct as `primary` and doc's "azul" note is pipeline-specific, not finance).

- [ ] **Step 1: Re-read the design doc's Financeiro section and diff against current chip colors**

```bash
grep -n -A5 "Financeiro/Dashboard" docs/superpowers/specs/2026-08-20-arkdoctor-visual-design.md
```

Compare to `finance-dashboard-client.tsx:85,101,113,126`. If they already match (green/red/primary/muted), this task is a no-op — skip to Step 2 to confirm and close it out. Only change code if there's an actual mismatch found.

- [ ] **Step 2: Typecheck, run finance tests**

```bash
npx tsc --noEmit
npx vitest run src/modules/finance
```

- [ ] **Step 3: Commit (only if Step 1 produced a change)**

```bash
git add src/components/finance/finance-dashboard-client.tsx
git commit -m "style(financeiro): align KPI chip colors with design system semantic table"
```

---

## Phase C — Dashboard (new aggregation page)

No new tables. This is a read-only page that calls three *existing* service functions across three *existing* modules and renders their results together, exactly like the prototype's Dashboard screen (4 KPI cards, revenue trend chart, pipeline-by-stage bars, today's appointments table).

### Task 8: Dashboard aggregation service

**Files:**
- Create: `src/modules/dashboard/types.ts`
- Create: `src/modules/dashboard/service.ts`
- Create: `src/modules/dashboard/service.test.ts`

**Interfaces:**
- Consumes: `crm.listPipeline(repo, accountId)` (returns `Map<stageId, DealWithContact[]>` grouped — check `src/modules/crm/service.ts` for exact return shape before writing the test, it's used as-is), `scheduling.listAppointments(repo, accountId, {from, to})` from `src/modules/scheduling/service.ts`, `finance.getDashboardMetrics` (whatever it's named in `src/modules/finance/service.ts` — used already by `getDashboardMetricsAction`).
- Produces: `getDashboardOverview(repos, accountId, todayIso): Promise<DashboardOverview>` where:

```ts
export interface DashboardOverview {
  revenueTotal: number;
  revenueChangePct: number | null;
  appointmentsCompletedCount: number;
  appointmentsCompletedChangePct: number | null;
  noShowRatePct: number | null;
  newContactsCount: number;
  pipelineByStage: { stageId: string; stageName: string; count: number }[];
  todaysAppointments: {
    id: string;
    contactName: string;
    procedureName: string;
    startsAt: string;
    status: string;
  }[];
}
```

- [ ] **Step 1: Write the failing test**

Create `src/modules/dashboard/service.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { getDashboardOverview } from "./service";

describe("getDashboardOverview", () => {
  it("combines pipeline, scheduling, and finance data for the given day", async () => {
    const deps = {
      crm: {
        listPipeline: vi.fn().mockResolvedValue(
          new Map([
            ["stage-1", []],
            ["stage-2", [{ id: "d1" }, { id: "d2" }]],
          ]),
        ),
        listStages: vi.fn().mockResolvedValue([
          { id: "stage-1", name: "Novo", kind: "normal", position: 0, accountId: "acc-1" },
          { id: "stage-2", name: "Agendado", kind: "normal", position: 1, accountId: "acc-1" },
        ]),
        countNewContacts: vi.fn().mockResolvedValue(3),
      },
      scheduling: {
        listAppointments: vi.fn().mockResolvedValue([
          {
            id: "a1",
            startsAt: "2026-08-20T13:00:00.000Z",
            status: "confirmado",
            contact: { name: "Carla Souza" },
            procedure: { name: "Consulta de avaliação" },
          },
        ]),
      },
      finance: {
        getDashboardMetrics: vi.fn().mockResolvedValue({
          period: { from: "2026-08-01", to: "2026-08-31" },
          revenueTotal: 38240,
          revenueChangePct: 12,
          expenseTotal: 14860,
          balance: 23380,
          averageTicket: 233,
          topProcedures: [],
          cancellationRate: { available: false },
        }),
      },
    };

    const overview = await getDashboardOverview(deps as never, "acc-1", "2026-08-20");

    expect(overview.revenueTotal).toBe(38240);
    expect(overview.pipelineByStage).toEqual([
      { stageId: "stage-1", stageName: "Novo", count: 0 },
      { stageId: "stage-2", stageName: "Agendado", count: 2 },
    ]);
    expect(overview.todaysAppointments).toHaveLength(1);
    expect(overview.todaysAppointments[0].contactName).toBe("Carla Souza");
  });
});
```

Before writing this test for real, open `src/modules/crm/service.ts` and `src/modules/scheduling/service.ts` to confirm the exact function names and return shapes referenced above (`listPipeline`, `listStages`, `listAppointments`) — adjust the mock shapes in this test to match reality exactly, since the mocks above are written from the type files read earlier in this session and may not be 100% exact against the service layer's actual signatures.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/modules/dashboard/service.test.ts
```

Expected: FAIL — `Cannot find module './service'`.

- [ ] **Step 3: Write `types.ts` and the minimal `service.ts` implementation**

`src/modules/dashboard/types.ts`:

```ts
export interface DashboardOverview {
  revenueTotal: number;
  revenueChangePct: number | null;
  appointmentsCompletedCount: number;
  appointmentsCompletedChangePct: number | null;
  noShowRatePct: number | null;
  newContactsCount: number;
  pipelineByStage: { stageId: string; stageName: string; count: number }[];
  todaysAppointments: {
    id: string;
    contactName: string;
    procedureName: string;
    startsAt: string;
    status: string;
  }[];
}
```

`src/modules/dashboard/service.ts` (adjust the actual `crm`/`scheduling`/`finance` function calls to match the real signatures confirmed in Step 1):

```ts
import type { DashboardOverview } from "./types";

interface DashboardDeps {
  crm: {
    listPipeline: (accountId: string) => Promise<Map<string, { id: string }[]>>;
    listStages: (accountId: string) => Promise<{ id: string; name: string }[]>;
    countNewContacts: (accountId: string, sinceIso: string) => Promise<number>;
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
  };
  finance: {
    getDashboardMetrics: (
      accountId: string,
      range: { from: string; to: string },
    ) => Promise<{ revenueTotal: number; revenueChangePct: number | null }>;
  };
}

function monthRange(todayIso: string): { from: string; to: string } {
  const [year, month] = todayIso.split("-").map(Number);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export async function getDashboardOverview(
  deps: DashboardDeps,
  accountId: string,
  todayIso: string,
): Promise<DashboardOverview> {
  const range = monthRange(todayIso);

  const [dealsByStage, stages, financeMetrics, todaysAppointments] = await Promise.all([
    deps.crm.listPipeline(accountId),
    deps.crm.listStages(accountId),
    deps.finance.getDashboardMetrics(accountId, range),
    deps.scheduling.listAppointments(accountId, { from: todayIso, to: todayIso }),
  ]);

  const pipelineByStage = stages.map((stage) => ({
    stageId: stage.id,
    stageName: stage.name,
    count: dealsByStage.get(stage.id)?.length ?? 0,
  }));

  const completed = todaysAppointments.filter((a) => a.status === "concluido");
  const noShow = todaysAppointments.filter((a) => a.status === "nao_compareceu");

  return {
    revenueTotal: financeMetrics.revenueTotal,
    revenueChangePct: financeMetrics.revenueChangePct,
    appointmentsCompletedCount: completed.length,
    appointmentsCompletedChangePct: null,
    noShowRatePct:
      todaysAppointments.length === 0 ? null : (noShow.length / todaysAppointments.length) * 100,
    newContactsCount: await deps.crm.countNewContacts(accountId, range.from),
    pipelineByStage,
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

If `crm.service.ts` has no `countNewContacts` or `listStages` export yet, add a small one to `src/modules/crm/service.ts` (and its repository interface method, in-memory + Supabase implementations) rather than faking the number — `noShowRatePct: null` and an honest "sem dados" render is correct per this codebase's existing convention (see `cancellationRate: { available: false }` in the finance module, which ships an honest placeholder rather than a fake `0` — same rule applies here).

- [ ] **Step 4: Run the test again to verify it passes**

```bash
npx vitest run src/modules/dashboard/service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard
git commit -m "feat(dashboard): add cross-module aggregation service with test"
```

---

### Task 9: Dashboard page and client component

**Files:**
- Create: `src/app/(app)/dashboard/page.tsx`
- Create: `src/app/(app)/dashboard/actions.ts`
- Create: `src/components/dashboard/dashboard-client.tsx`

**Interfaces:**
- Consumes: `getDashboardOverview` (Task 8), `PageHeader` (Task 3's no-eyebrow version), `Card`/`CardHeader`/`CardTitle`/`CardContent` from `@/components/ui/card`, `Badge` from `@/components/ui/badge`, Recharts (`AreaChart`, `Area`, `XAxis`, `YAxis`, `ResponsiveContainer` — already a dependency, used in `finance-dashboard-client.tsx`).

- [ ] **Step 1: Server action**

`src/app/(app)/dashboard/actions.ts`:

```ts
"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import { createSupabaseSchedulingRepository } from "@/modules/scheduling/repository.supabase";
import { createSupabaseFinanceRepository } from "@/modules/finance/repository.supabase";
import * as crm from "@/modules/crm/service";
import * as scheduling from "@/modules/scheduling/service";
import * as finance from "@/modules/finance/service";
import { getDashboardOverview } from "@/modules/dashboard/service";

export async function getDashboardOverviewAction(todayIso: string) {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const crmRepo = createSupabaseCrmRepository(supabase);
  const schedulingRepo = createSupabaseSchedulingRepository(supabase);
  const financeRepo = createSupabaseFinanceRepository(supabase);

  return getDashboardOverview(
    {
      crm: {
        listPipeline: (accId) => crm.listPipeline(crmRepo, accId),
        listStages: (accId) => crm.listStages(crmRepo, accId),
        countNewContacts: (accId, sinceIso) => crm.countNewContacts(crmRepo, accId, sinceIso),
      },
      scheduling: {
        listAppointments: (accId, range) => scheduling.listAppointments(schedulingRepo, accId, range),
      },
      finance: {
        getDashboardMetrics: (accId, range) => finance.getDashboardMetrics(financeRepo, accId, range),
      },
    },
    accountId,
    todayIso,
  );
}
```

Adjust every `crm.*` / `scheduling.*` / `finance.*` call above to the real exported function names — confirm each against the actual `service.ts` files (this action is a thin adapter; if `listStages` or `countNewContacts` don't exist on the crm service yet, this is where Task 8's note to add them applies — add them in Task 8, not here).

- [ ] **Step 2: Page (server component)**

`src/app/(app)/dashboard/page.tsx`:

```tsx
import { getDashboardOverviewAction } from "./actions";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const overview = await getDashboardOverviewAction(today);

  return (
    <div>
      <PageHeader title="Visão geral" description="Desempenho da clínica no mês atual." />
      <DashboardClient overview={overview} />
    </div>
  );
}
```

- [ ] **Step 3: Client component — 4 KPI cards + pipeline bars + today's appointments table**

`src/components/dashboard/dashboard-client.tsx`:

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, CheckCircle2, UserX, UserPlus } from "lucide-react";
import type { DashboardOverview } from "@/modules/dashboard/types";

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

const statusBadge: Record<string, { label: string; className: string }> = {
  agendado: { label: "Agendado", className: "bg-blue-100 text-blue-700" },
  confirmado: { label: "Confirmado", className: "bg-blue-100 text-blue-700" },
  concluido: { label: "Concluído", className: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado", className: "bg-red-100 text-red-700" },
  nao_compareceu: { label: "Não compareceu", className: "bg-red-100 text-red-700" },
};

export function DashboardClient({ overview }: { overview: DashboardOverview }) {
  const maxStageCount = Math.max(1, ...overview.pipelineByStage.map((s) => s.count));

  return (
    <div className="space-y-4 px-6 pb-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-8 items-center justify-center rounded-md bg-green-100 text-green-700">
              <TrendingUp className="size-4" />
            </div>
            <CardTitle className="text-sm text-muted-foreground">Receita</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(overview.revenueTotal)}</p>
            <p className="text-sm text-muted-foreground">
              {overview.revenueChangePct === null
                ? "Sem dados do período anterior"
                : `${overview.revenueChangePct >= 0 ? "+" : ""}${overview.revenueChangePct.toFixed(1)}% vs. mês anterior`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-8 items-center justify-center rounded-md bg-blue-100 text-blue-700">
              <CheckCircle2 className="size-4" />
            </div>
            <CardTitle className="text-sm text-muted-foreground">Consultas concluídas hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{overview.appointmentsCompletedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-8 items-center justify-center rounded-md bg-red-100 text-red-700">
              <UserX className="size-4" />
            </div>
            <CardTitle className="text-sm text-muted-foreground">Não comparecimento hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {overview.noShowRatePct === null ? "—" : `${overview.noShowRatePct.toFixed(1)}%`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-8 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <UserPlus className="size-4" />
            </div>
            <CardTitle className="text-sm text-muted-foreground">Novos contatos no mês</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{overview.newContactsCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline por estágio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.pipelineByStage.map((s) => (
              <div key={s.stageId} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-muted-foreground">{s.stageName}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(s.count / maxStageCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-sm font-semibold tabular-nums">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos atendimentos hoje</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {overview.todaysAppointments.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhum atendimento hoje.</p>
            )}
            {overview.todaysAppointments.map((a) => {
              const badge = statusBadge[a.status] ?? { label: a.status, className: "bg-muted text-muted-foreground" };
              return (
                <div key={a.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="font-medium">{a.contactName}</p>
                    <p className="text-sm text-muted-foreground">{a.procedureName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm tabular-nums">
                      {new Date(a.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <Badge variant="outline" className={badge.className}>
                      {badge.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and manual check**

```bash
npx tsc --noEmit
npm run dev
```

Visit `/dashboard`, confirm all 4 cards render, pipeline bars scale to the widest stage, today's appointments list shows correct badges.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/dashboard src/components/dashboard
git commit -m "feat(dashboard): add cross-module overview page"
```

---

## Phase D — Agendamento (staff-facing booking wizard)

No new domain — this wraps the *existing* `createAppointmentAction`, `listProceduresAction`, `searchContactsAction`, `checkConflictAction` (all already in `src/app/(app)/agenda/actions.ts`) in a 3-step wizard UI matching the prototype (procedure → date/time → confirm), instead of the current single-dialog `AppointmentDialog`.

### Task 10: Booking wizard page

**Files:**
- Create: `src/app/(app)/agendamento/page.tsx`
- Create: `src/components/agendamento/booking-wizard.tsx`

**Interfaces:**
- Consumes (all already exist, imported from `@/app/(app)/agenda/actions`): `listProceduresAction(): Promise<Procedure[]>`, `searchContactsAction(query: string): Promise<Contact[]>`, `checkConflictAction(startsAt, endsAt, excludeId?): Promise<ConflictResult>`, `createAppointmentAction(input: unknown): Promise<Appointment>`.

- [ ] **Step 1: Page shell**

`src/app/(app)/agendamento/page.tsx`:

```tsx
import { PageHeader } from "@/components/layout/page-header";
import { BookingWizard } from "@/components/agendamento/booking-wizard";
import { listProceduresAction } from "@/app/(app)/agenda/actions";

export default async function AgendamentoPage() {
  const procedures = await listProceduresAction();

  return (
    <div>
      <PageHeader title="Marcar consulta" description="Escolha o procedimento, o dia e o horário." />
      <BookingWizard procedures={procedures} />
    </div>
  );
}
```

- [ ] **Step 2: The wizard — 3 steps (procedure → contact + date/time → confirm), reusing existing shadcn primitives**

`src/components/agendamento/booking-wizard.tsx` — build this as a `"use client"` component with local `step` state (`"procedure" | "datetime" | "confirm"`), a `selectedProcedureId`, `contactQuery`/`selectedContactId` (reusing the same search-then-select pattern already implemented in `src/components/agenda/appointment-dialog.tsx` — read that file in full before writing this one and copy its `searchContactsAction` debounce/select logic verbatim rather than re-inventing it), a native `<input type="date">` + a generated list of half-hour slot buttons for the chosen day, a `checkConflictAction` call before enabling the "Confirmar" button on the final step, and a call to `createAppointmentAction` on submit that redirects to `/agenda` on success (via `useRouter().push("/agenda")`) and shows the same inline error pattern `appointment-dialog.tsx` uses (`error` state + `<p className="text-sm text-red-600">`) on failure.

This step intentionally does not paste a full implementation — `appointment-dialog.tsx` is the canonical reference for every one of these interactions (procedure select via shadcn `Select`, contact search input + result list, conflict check timing, submit handler shape) and should be read in full and adapted, not re-derived. The wizard differs from the dialog only in being a 3-step full-page flow instead of a single modal, and in matching the prototype's visual steps-indicator:

```tsx
<div className="mb-6 flex items-center gap-2">
  {(["procedure", "datetime", "confirm"] as const).map((s, i) => (
    <div key={s} className="flex items-center gap-2">
      <div
        className={cn(
          "flex size-6 items-center justify-center rounded-full border text-xs font-bold",
          step === s
            ? "border-primary bg-primary text-primary-foreground"
            : stepIndex(step) > i
              ? "border-green-600 bg-green-600 text-white"
              : "border-border text-muted-foreground",
        )}
      >
        {stepIndex(step) > i ? "✓" : i + 1}
      </div>
      <span className={cn("text-sm font-medium", step === s ? "text-foreground" : "text-muted-foreground")}>
        {["Procedimento", "Data e horário", "Confirmação"][i]}
      </span>
      {i < 2 && <div className="h-px w-6 bg-border" />}
    </div>
  ))}
</div>
```

(where `stepIndex` maps the three literal strings to `0`/`1`/`2` and `cn` is the existing `@/lib/utils` helper already used throughout the codebase).

- [ ] **Step 3: Typecheck and manual walkthrough**

```bash
npx tsc --noEmit
npm run dev
```

Visit `/agendamento`: pick a procedure, search and select an existing contact, pick a date, pick a slot, confirm — verify the appointment shows up on `/agenda` afterward (real `createAppointmentAction` call, real conflict check).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/agendamento src/components/agendamento
git commit -m "feat(agendamento): add staff-facing booking wizard reusing existing scheduling actions"
```

---

## Phase E — WhatsApp (new domain)

Genuinely new: no existing tables or modules to lean on. Follows the exact repository-pattern precedent of `src/modules/finance/` (interface + in-memory + Supabase, Zod-validated service). Ships as a **manual conversation log**, not a live WhatsApp Business API integration — the "Conectado" status badge from the prototype becomes a real (if currently-always-true) field so a later phase can flip it based on actual webhook/API state without a UI change.

### Task 11: Database schema

**Files:**
- Create: `supabase/migrations/0006_whatsapp.sql`
- Modify: `src/lib/supabase/database.types.ts` (add `whatsapp_conversations` and `whatsapp_messages` table types, alphabetically among the existing tables)

- [ ] **Step 1: Write the migration**

`supabase/migrations/0006_whatsapp.sql`:

```sql
create table whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  contact_id uuid references contacts(id),
  contact_name text not null,
  contact_phone text not null,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  body text not null,
  sent_at timestamptz not null default now()
);

alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages enable row level security;

create policy "account members can manage whatsapp_conversations"
  on whatsapp_conversations for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create policy "account members can manage whatsapp_messages"
  on whatsapp_messages for all
  to authenticated
  using (account_id in (select account_id from account_users where user_id = auth.uid()))
  with check (account_id in (select account_id from account_users where user_id = auth.uid()));

create index whatsapp_messages_conversation_id_idx on whatsapp_messages (conversation_id, sent_at);
```

- [ ] **Step 2: Add the table types**

In `src/lib/supabase/database.types.ts`, follow the exact `Row`/`Insert`/`Update` shape already used for `financial_entries` (read that block first) and add matching `whatsapp_conversations` / `whatsapp_messages` entries, alphabetically positioned.

- [ ] **Step 3: Apply the migration locally and regenerate types (if the project uses `supabase gen types`)**

```bash
npx supabase db push
npx supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

If the project's Supabase project ref is needed instead of `--local`, check the memory note "ArkDoctor Supabase project" for the ref, or ask the user — do not guess a project ref.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_whatsapp.sql src/lib/supabase/database.types.ts
git commit -m "feat(whatsapp): add conversations/messages schema"
```

---

### Task 12: Repository + service (with tests)

**Files:**
- Create: `src/modules/whatsapp/types.ts`
- Create: `src/modules/whatsapp/schemas.ts`
- Create: `src/modules/whatsapp/repository.ts`
- Create: `src/modules/whatsapp/repository.memory.ts`
- Create: `src/modules/whatsapp/repository.memory.test.ts`
- Create: `src/modules/whatsapp/repository.supabase.ts`
- Create: `src/modules/whatsapp/service.ts`
- Create: `src/modules/whatsapp/service.test.ts`

**Interfaces:**
- Produces: `listConversations(repo, accountId): Promise<Conversation[]>`, `getConversationMessages(repo, accountId, conversationId): Promise<Message[]>`, `logOutboundMessage(repo, accountId, conversationId, rawInput: unknown): Promise<Message>`, `startConversation(repo, accountId, rawInput: unknown): Promise<Conversation>`.

- [ ] **Step 1: Types**

`src/modules/whatsapp/types.ts`:

```ts
export interface Conversation {
  id: string;
  accountId: string;
  contactId: string | null;
  contactName: string;
  contactPhone: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
}

export type MessageDirection = "inbound" | "outbound";

export interface Message {
  id: string;
  conversationId: string;
  accountId: string;
  direction: MessageDirection;
  body: string;
  sentAt: string;
}
```

- [ ] **Step 2: Zod schemas**

`src/modules/whatsapp/schemas.ts`:

```ts
import { z } from "zod";

export const startConversationInputSchema = z.object({
  contactId: z.string().uuid().nullable(),
  contactName: z.string().min(1, "Nome é obrigatório"),
  contactPhone: z.string().min(1, "Telefone é obrigatório"),
});

export const logMessageInputSchema = z.object({
  direction: z.enum(["inbound", "outbound"]),
  body: z.string().min(1, "Mensagem não pode ser vazia"),
});
```

- [ ] **Step 3: Repository interface**

`src/modules/whatsapp/repository.ts`:

```ts
import type { Conversation, Message } from "./types";

export interface WhatsappRepository {
  listConversations(accountId: string): Promise<Conversation[]>;
  getConversation(accountId: string, conversationId: string): Promise<Conversation | null>;
  insertConversation(
    accountId: string,
    input: { contactId: string | null; contactName: string; contactPhone: string },
  ): Promise<Conversation>;
  listMessages(accountId: string, conversationId: string): Promise<Message[]>;
  insertMessage(
    accountId: string,
    conversationId: string,
    input: { direction: "inbound" | "outbound"; body: string },
  ): Promise<Message>;
  touchConversation(
    accountId: string,
    conversationId: string,
    lastMessagePreview: string,
    lastMessageAt: string,
  ): Promise<void>;
}
```

- [ ] **Step 4: In-memory repository**

`src/modules/whatsapp/repository.memory.ts`:

```ts
import type { WhatsappRepository } from "./repository";
import type { Conversation, Message } from "./types";

export function createInMemoryWhatsappRepository(): WhatsappRepository {
  const conversations = new Map<string, Conversation>();
  const messages = new Map<string, Message>();

  return {
    async listConversations(accountId) {
      return [...conversations.values()]
        .filter((c) => c.accountId === accountId)
        .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
    },

    async getConversation(accountId, conversationId) {
      const c = conversations.get(conversationId);
      return c && c.accountId === accountId ? c : null;
    },

    async insertConversation(accountId, input) {
      const id = crypto.randomUUID();
      const conversation: Conversation = {
        id,
        accountId,
        contactId: input.contactId,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        lastMessagePreview: null,
        lastMessageAt: null,
        unreadCount: 0,
        createdAt: new Date().toISOString(),
      };
      conversations.set(id, conversation);
      return conversation;
    },

    async listMessages(accountId, conversationId) {
      return [...messages.values()]
        .filter((m) => m.accountId === accountId && m.conversationId === conversationId)
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    },

    async insertMessage(accountId, conversationId, input) {
      const id = crypto.randomUUID();
      const message: Message = {
        id,
        conversationId,
        accountId,
        direction: input.direction,
        body: input.body,
        sentAt: new Date().toISOString(),
      };
      messages.set(id, message);
      return message;
    },

    async touchConversation(accountId, conversationId, lastMessagePreview, lastMessageAt) {
      const c = conversations.get(conversationId);
      if (!c || c.accountId !== accountId) return;
      conversations.set(conversationId, { ...c, lastMessagePreview, lastMessageAt });
    },
  };
}
```

- [ ] **Step 5: Write the failing repository test**

`src/modules/whatsapp/repository.memory.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";

describe("createInMemoryWhatsappRepository", () => {
  it("lists conversations for an account sorted by most recent message first", async () => {
    const repo = createInMemoryWhatsappRepository();
    const a = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    const b = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Rafael Prado",
      contactPhone: "51998765432",
    });
    await repo.insertConversation("acc-2", {
      contactId: null,
      contactName: "Outra conta",
      contactPhone: "0000",
    });

    await repo.touchConversation("acc-1", a.id, "oi", "2026-08-20T10:00:00.000Z");
    await repo.touchConversation("acc-1", b.id, "posso remarcar?", "2026-08-20T11:00:00.000Z");

    const list = await repo.listConversations("acc-1");
    expect(list.map((c) => c.contactName)).toEqual(["Rafael Prado", "Carla Souza"]);
  });

  it("scopes messages to conversation and account", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await repo.insertConversation("acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    await repo.insertMessage("acc-1", conversation.id, { direction: "inbound", body: "Oi!" });
    await repo.insertMessage("acc-1", conversation.id, { direction: "outbound", body: "Olá, tudo bem?" });

    const msgs = await repo.listMessages("acc-1", conversation.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].body).toBe("Oi!");
  });
});
```

- [ ] **Step 6: Run to verify it fails, then it's already implemented above so run again to verify it passes**

```bash
npx vitest run src/modules/whatsapp/repository.memory.test.ts
```

Expected: PASS (the implementation was written alongside the interface in Step 4, per this plan's convention of showing final code — when executing for real, write the test first against a stubbed/throwing repository, watch it fail, then fill in Step 4's body, per standard TDD; the code above is what step 4 converges to).

- [ ] **Step 7: Supabase repository**

`src/modules/whatsapp/repository.supabase.ts` — mirror `src/modules/finance/repository.supabase.ts` exactly (read it in full first): same `throwDbError` helper, same row-mapper-function-per-table pattern, implementing every method from Task 12 Step 3's `WhatsappRepository` interface against the `whatsapp_conversations` / `whatsapp_messages` tables from Task 11. Do not paste a guessed implementation here — copy the finance file's structure method-by-method since it's the direct precedent for this exact repository shape (account-scoped CRUD + one list-with-sort method).

- [ ] **Step 8: Service layer with Zod validation**

`src/modules/whatsapp/service.ts`:

```ts
import type { WhatsappRepository } from "./repository";
import { startConversationInputSchema, logMessageInputSchema } from "./schemas";

export async function listConversations(repo: WhatsappRepository, accountId: string) {
  return repo.listConversations(accountId);
}

export async function getConversationMessages(
  repo: WhatsappRepository,
  accountId: string,
  conversationId: string,
) {
  const conversation = await repo.getConversation(accountId, conversationId);
  if (!conversation) throw new Error("Conversa não encontrada");
  return repo.listMessages(accountId, conversationId);
}

export async function startConversation(repo: WhatsappRepository, accountId: string, rawInput: unknown) {
  const input = startConversationInputSchema.parse(rawInput);
  return repo.insertConversation(accountId, input);
}

export async function logMessage(
  repo: WhatsappRepository,
  accountId: string,
  conversationId: string,
  rawInput: unknown,
) {
  const input = logMessageInputSchema.parse(rawInput);
  const conversation = await repo.getConversation(accountId, conversationId);
  if (!conversation) throw new Error("Conversa não encontrada");
  const message = await repo.insertMessage(accountId, conversationId, input);
  await repo.touchConversation(accountId, conversationId, input.body, message.sentAt);
  return message;
}
```

- [ ] **Step 9: Service test**

`src/modules/whatsapp/service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createInMemoryWhatsappRepository } from "./repository.memory";
import { startConversation, logMessage, getConversationMessages } from "./service";

describe("whatsapp service", () => {
  it("rejects logging a message on a conversation that doesn't exist", async () => {
    const repo = createInMemoryWhatsappRepository();
    await expect(
      logMessage(repo, "acc-1", "does-not-exist", { direction: "outbound", body: "oi" }),
    ).rejects.toThrow("Conversa não encontrada");
  });

  it("updates the conversation preview when a message is logged", async () => {
    const repo = createInMemoryWhatsappRepository();
    const conversation = await startConversation(repo, "acc-1", {
      contactId: null,
      contactName: "Carla Souza",
      contactPhone: "51991234477",
    });
    await logMessage(repo, "acc-1", conversation.id, { direction: "outbound", body: "Confirmado!" });
    const messages = await getConversationMessages(repo, "acc-1", conversation.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe("Confirmado!");
  });
});
```

- [ ] **Step 10: Run all whatsapp tests**

```bash
npx vitest run src/modules/whatsapp
```

Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add src/modules/whatsapp
git commit -m "feat(whatsapp): add repository + service layer with tests"
```

---

### Task 13: Server actions

**Files:**
- Create: `src/app/(app)/whatsapp/actions.ts`

- [ ] **Step 1: Write the actions file, following the exact `getReposAndAccount()` pattern from `src/app/(app)/agenda/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseWhatsappRepository } from "@/modules/whatsapp/repository.supabase";
import * as whatsapp from "@/modules/whatsapp/service";

async function getRepoAndAccount() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const repo = createSupabaseWhatsappRepository(supabase);
  return { repo, accountId };
}

export async function listConversationsAction() {
  const { repo, accountId } = await getRepoAndAccount();
  return whatsapp.listConversations(repo, accountId);
}

export async function getConversationMessagesAction(conversationId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  return whatsapp.getConversationMessages(repo, accountId, conversationId);
}

export async function startConversationAction(input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const conversation = await whatsapp.startConversation(repo, accountId, input);
  revalidatePath("/whatsapp");
  return conversation;
}

export async function logMessageAction(conversationId: string, input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const message = await whatsapp.logMessage(repo, accountId, conversationId, input);
  revalidatePath("/whatsapp");
  return message;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/whatsapp/actions.ts
git commit -m "feat(whatsapp): add server actions"
```

---

### Task 14: Inbox UI

**Files:**
- Create: `src/app/(app)/whatsapp/page.tsx`
- Create: `src/components/whatsapp/whatsapp-client.tsx`

- [ ] **Step 1: Page**

`src/app/(app)/whatsapp/page.tsx`:

```tsx
import { listConversationsAction } from "./actions";
import { WhatsappClient } from "@/components/whatsapp/whatsapp-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function WhatsappPage() {
  const conversations = await listConversationsAction();

  return (
    <div>
      <PageHeader title="Inbox" description="Conversas com pacientes." />
      <WhatsappClient initialConversations={conversations} />
    </div>
  );
}
```

- [ ] **Step 2: Client — conversation list + thread, matching the prototype's two-column layout with WhatsApp-green isolated to this module only**

`src/components/whatsapp/whatsapp-client.tsx` — `"use client"` component with `selectedConversationId` state (defaulting to the first conversation), a left column listing `initialConversations` (avatar initials, name, `lastMessagePreview`, relative time, `unreadCount` badge in `bg-[#25D366]`), and a right column that on selection calls `getConversationMessagesAction(id)` and renders bubbles (`inbound` = white/left-aligned, `outbound` = `bg-[#d9fdd3]`/right-aligned — this is the one place in the whole app allowed to use a literal hex instead of a design token, per the design system doc's explicit call-out: *"Bolhas de conversa fora da paleta de tema principal — módulo visualmente isolado por ser integração externa"*), plus a composer `<input>` + send button wired to `logMessageAction(conversationId, { direction: "outbound", body })` that clears the input and re-fetches messages on success. A "Conectado" badge (`bg-[#25D366]/10 text-[#188a44]`) sits above the two-column card — hardcode it to always show connected for now (there is no real API connection yet; do not fake a toggle control that implies it does something).

- [ ] **Step 3: Typecheck and manual walkthrough**

```bash
npx tsc --noEmit
npm run dev
```

Visit `/whatsapp` — if there are zero conversations (fresh account), the left column should show an empty state, not crash on `conversations[0]` — guard the default-selection logic.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/whatsapp/page.tsx src/components/whatsapp
git commit -m "feat(whatsapp): add inbox UI (manual conversation log, no live API integration yet)"
```

---

## Closing notes for whoever picks this up

- Do the phases in order A → B → C → D → E, but each phase's tasks are independently committable and the app should build and deploy cleanly after every single task, not just every phase.
- Phase E ships a data model with no real WhatsApp Business API behind it. That's a deliberate scope cut, not an oversight — a real integration needs its own spec (webhook verification, message-status callbacks, template-message rules) and should not be improvised inside this plan.
- If Task 8/9's exact `crm`/`scheduling` service function names don't match what's guessed in this plan (they were written from `types.ts` files read earlier in the session, not from `service.ts` directly for every function), that's expected — the plan says explicitly where to verify and adjust, do that rather than treating a mismatch as a blocker.
