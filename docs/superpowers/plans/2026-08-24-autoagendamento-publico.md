# Autoagendamento Público Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a patient book their own appointment through a public, login-free link (`/agendar/[accountId]`), and give the clinic owner a one-click way to copy that link from the internal `/agendamento` screen.

**Architecture:** Pure composition of existing, already-tested logic — `scheduling.createAppointment`, `scheduling.checkConflict`, `scheduling.listProcedures`, `crm.findContactByPhone`, `crm.createContact` — called from a new public server-actions file that uses the existing `createServiceRoleSupabaseClient()` instead of the session-based `getCurrentAccountId()`, mirroring the exact pattern already used by `src/app/api/whatsapp/webhook/[accountId]/route.ts`. A new route outside the `(app)` route group is public by construction (no middleware/layout gates it). No changes to `modules/scheduling` or `modules/crm`.

**Tech Stack:** Next.js Server Actions + App Router route groups, Supabase service-role client (already exists), same UI primitives as the rest of the app (`src/components/ui`).

**Spec:** `docs/superpowers/specs/2026-08-24-autoagendamento-publico-design.md`

## Global Constraints

- No changes to `modules/scheduling` or `modules/crm` — this plan is pure composition of existing service functions (per spec's "Backend — ações públicas" section).
- Public actions never call `getCurrentAccountId()` — they always take `accountId` as an explicit parameter and use `createServiceRoleSupabaseClient()`.
- No CAPTCHA/rate-limiting (explicitly out of scope per spec — documented, accepted risk).
- `PublicBookingWizard` is a new, separate component — do not modify the existing internal `BookingWizard` component's rendering logic (spec's explicit decision, to avoid regressions in the already-shipped internal flow).
- Invalid `accountId` in the public URL must render a generic "Link inválido ou expirado" message — never leak internal error details.

---

### Task 1: Public server actions

**Files:**
- Create: `src/app/agendar/actions.ts`

**Interfaces:**
- Consumes: `scheduling.listProcedures`, `scheduling.checkConflict`, `scheduling.createAppointment` (`src/modules/scheduling/service.ts`, unchanged); `crm.findContactByPhone`, `crm.createContact` (`src/modules/crm/service.ts`, unchanged); `createServiceRoleSupabaseClient` (`src/lib/supabase/service-role.ts`, unchanged); `createSupabaseSchedulingRepository`, `createSupabaseCrmRepository` (unchanged).
- Produces: `listPublicProceduresAction(accountId: string)`, `checkPublicConflictAction(accountId: string, startsAt: string, endsAt: string)`, `createPublicBookingAction(accountId: string, input: { name: string; phone: string; procedureId: string; startsAt: string })` — consumed by Task 2 (`PublicBookingWizard`) and Task 3 (page).

- [ ] **Step 1: Implement the actions file**

Create `src/app/agendar/actions.ts`:

```ts
"use server";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createSupabaseSchedulingRepository } from "@/modules/scheduling/repository.supabase";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import * as scheduling from "@/modules/scheduling/service";
import * as crm from "@/modules/crm/service";

function getPublicRepos() {
  const supabase = createServiceRoleSupabaseClient();
  const schedulingRepo = createSupabaseSchedulingRepository(supabase);
  const crmRepo = createSupabaseCrmRepository(supabase);
  return { schedulingRepo, crmRepo };
}

export async function listPublicProceduresAction(accountId: string) {
  const { schedulingRepo } = getPublicRepos();
  return scheduling.listProcedures(schedulingRepo, accountId);
}

export async function checkPublicConflictAction(
  accountId: string,
  startsAt: string,
  endsAt: string,
) {
  const { schedulingRepo } = getPublicRepos();
  return scheduling.checkConflict(schedulingRepo, accountId, { startsAt, endsAt });
}

export async function createPublicBookingAction(
  accountId: string,
  input: { name: string; phone: string; procedureId: string; startsAt: string },
) {
  const { schedulingRepo, crmRepo } = getPublicRepos();

  let contact = await crm.findContactByPhone(crmRepo, accountId, input.phone);
  if (!contact) {
    contact = await crm.createContact(crmRepo, accountId, {
      name: input.name,
      phone: input.phone,
    });
  }

  return scheduling.createAppointment(
    { scheduling: schedulingRepo, crm: crmRepo },
    accountId,
    { contactId: contact.id, procedureId: input.procedureId, startsAt: input.startsAt },
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. No dedicated test file — this is thin composition of already-tested service functions, matching the existing convention that `actions.ts` files aren't unit-tested (see e.g. `src/app/(app)/agenda/actions.ts`, `src/app/(app)/pipeline/actions.ts`).

- [ ] **Step 3: Commit**

```bash
git add "src/app/agendar/actions.ts"
git commit -m "feat(agendar): add public server actions for patient self-scheduling"
```

---

### Task 2: `PublicBookingWizard` component

**Files:**
- Create: `src/components/agendamento/public-booking-wizard.tsx`

**Interfaces:**
- Consumes: `listPublicProceduresAction` is NOT used here (procedures are passed in as a prop by the page, Task 3) — only `checkPublicConflictAction`, `createPublicBookingAction` (Task 1); `Procedure` type (`@/modules/scheduling/types`, unchanged); `formatCurrency` (`@/lib/format`, unchanged); `Button`, `Input`, `Label`, `Card`/`CardContent`/`CardHeader`/`CardTitle` (`src/components/ui`, unchanged); `cn` (`@/lib/utils`, unchanged).
- Produces: `PublicBookingWizard({ accountId, procedures }: { accountId: string; procedures: Procedure[] })` — consumed by Task 3.

- [ ] **Step 1: Implement the component**

Create `src/components/agendamento/public-booking-wizard.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkPublicConflictAction, createPublicBookingAction } from "@/app/agendar/actions";
import { cn } from "@/lib/utils";
import type { Procedure } from "@/modules/scheduling/types";
import { formatCurrency } from "@/lib/format";

type Step = "procedure" | "datetime" | "confirm";

const STEPS: Step[] = ["procedure", "datetime", "confirm"];

function stepIndex(step: Step): number {
  return STEPS.indexOf(step);
}

const SLOT_START_HOUR = 8;
const SLOT_END_HOUR = 18;
const SLOT_INTERVAL_MINUTES = 30;

function generateSlots(): string[] {
  const slots: string[] = [];
  for (let minutes = SLOT_START_HOUR * 60; minutes < SLOT_END_HOUR * 60; minutes += SLOT_INTERVAL_MINUTES) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    slots.push(`${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`);
  }
  return slots;
}

const SLOTS = generateSlots();

function todayInputValue(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

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

export function PublicBookingWizard({
  accountId,
  procedures,
}: {
  accountId: string;
  procedures: Procedure[];
}) {
  const [step, setStep] = useState<Step>("procedure");

  const [procedureId, setProcedureId] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const [date, setDate] = useState(todayInputValue());
  const [slot, setSlot] = useState<string | null>(null);

  const [checkingConflict, setCheckingConflict] = useState(false);
  const [conflictReason, setConflictReason] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [conflictCheckError, setConflictCheckError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const selectedProcedure = procedures.find((p) => p.id === procedureId) ?? null;

  function startsAtIso(): string | null {
    if (!date || !slot) return null;
    return new Date(`${date}T${slot}:00`).toISOString();
  }

  function endsAtIso(): string | null {
    const start = startsAtIso();
    if (!start || !selectedProcedure) return null;
    return new Date(new Date(start).getTime() + selectedProcedure.defaultDurationMinutes * 60_000).toISOString();
  }

  useEffect(() => {
    const start = startsAtIso();
    const end = endsAtIso();
    if (!start || !end) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears a stale conflict result once the slot becomes incomplete
      setConflictReason(null);
      return;
    }

    let cancelled = false;
    setCheckingConflict(true);
    setConflictCheckError(null);
    checkPublicConflictAction(accountId, start, end)
      .then((result) => {
        if (cancelled) return;
        setConflictReason(result.hasConflict ? result.reason : null);
      })
      .catch((err) => {
        if (cancelled) return;
        setConflictReason(null);
        setConflictCheckError(
          err instanceof Error ? err.message : "Erro ao verificar disponibilidade",
        );
      })
      .finally(() => {
        if (!cancelled) setCheckingConflict(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, slot, procedureId]);

  async function handleConfirm() {
    setSubmitError(null);
    const start = startsAtIso();
    if (!name.trim() || !phone.trim() || !procedureId || !start) {
      setSubmitError("Preencha todos os campos antes de confirmar");
      return;
    }

    setSubmitting(true);
    try {
      await createPublicBookingAction(accountId, {
        name: name.trim(),
        phone: phone.trim(),
        procedureId,
        startsAt: start,
      });
      setConfirmed(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erro ao criar agendamento");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6 text-center">
          <p className="text-lg font-semibold">Agendamento confirmado!</p>
          <p className="text-sm text-muted-foreground">
            Você receberá a confirmação por WhatsApp.
          </p>
        </CardContent>
      </Card>
    );
  }

  const showSummary = step !== "procedure";

  return (
    <div className={cn("grid gap-4", showSummary && "lg:grid-cols-[1fr_360px]")}>
      <div>
        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((s, i) => (
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

        {step === "procedure" && (
          <Card>
            <CardHeader>
              <CardTitle>Procedimento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {procedures.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProcedureId(p.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors",
                    procedureId === p.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{p.defaultDurationMinutes} min</p>
                  </div>
                  <p className="font-semibold">{formatCurrency(p.defaultPrice)}</p>
                </button>
              ))}
              {procedures.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum procedimento disponível no momento.</p>
              )}

              <Button
                type="button"
                className="mt-2"
                disabled={!procedureId}
                onClick={() => setStep("datetime")}
              >
                Próximo
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "datetime" && (
          <Card>
            <CardHeader>
              <CardTitle>Data e horário</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>

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

              <div className="space-y-1">
                <Label>Horário</Label>
                <div className="flex flex-wrap gap-2">
                  {SLOTS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={cn(
                        "rounded border px-2 py-1 text-sm",
                        slot === s
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-muted",
                      )}
                      onClick={() => setSlot(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep("procedure")}>
                  Voltar
                </Button>
                <Button
                  type="button"
                  disabled={!name.trim() || !phone.trim() || !slot}
                  onClick={() => setStep("confirm")}
                >
                  Próximo
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "confirm" && (
          <Card>
            <CardHeader>
              <CardTitle>Confirmação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {checkingConflict && <p className="text-sm text-muted-foreground">Verificando disponibilidade...</p>}
              {!checkingConflict && conflictReason && (
                <p className="text-sm text-red-600">{conflictReason}</p>
              )}
              {!checkingConflict && conflictCheckError && (
                <p className="text-sm text-red-600">{conflictCheckError}</p>
              )}
              <Button type="button" variant="outline" onClick={() => setStep("datetime")}>
                Voltar
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {showSummary && (
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {name && <p className="font-medium">{name}</p>}
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Procedimento</span>
              <span className="font-medium">{selectedProcedure?.name ?? "-"}</span>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Data</span>
              <span className="font-medium">{date}</span>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Horário</span>
              <span className="font-medium">{slot ?? "-"}</span>
            </div>
            <div className="flex justify-between pt-1 text-base">
              <span className="font-semibold">Total</span>
              <span className="font-bold">
                {selectedProcedure ? formatCurrency(selectedProcedure.defaultPrice) : "-"}
              </span>
            </div>

            {step === "confirm" && (
              <>
                {submitError && <p className="text-sm text-red-600">{submitError}</p>}
                <Button
                  type="button"
                  className="w-full"
                  disabled={submitting || checkingConflict || !!conflictReason || !!conflictCheckError}
                  onClick={handleConfirm}
                >
                  Confirmar agendamento
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/agendamento/public-booking-wizard.tsx
git commit -m "feat(agendar): add public booking wizard for patient self-scheduling"
```

---

### Task 3: Public page `/agendar/[accountId]`

**Files:**
- Create: `src/app/agendar/[accountId]/page.tsx`

**Interfaces:**
- Consumes: `createServiceRoleSupabaseClient` (unchanged), `getCurrentAccountName` (`src/lib/supabase/account.ts`, unchanged — works with any `SupabaseClient<Database>`, not session-bound), `listPublicProceduresAction` (Task 1), `PublicBookingWizard` (Task 2).
- Produces: the working `/agendar/[accountId]` public route — terminal deliverable for the patient-facing side of this plan.

- [ ] **Step 1: Implement the page**

Create `src/app/agendar/[accountId]/page.tsx`:

```tsx
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { getCurrentAccountName } from "@/lib/supabase/account";
import { listPublicProceduresAction } from "@/app/agendar/actions";
import { PublicBookingWizard } from "@/components/agendamento/public-booking-wizard";

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const supabase = createServiceRoleSupabaseClient();

  let accountName: string;
  try {
    accountName = await getCurrentAccountName(supabase, accountId);
  } catch {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-center text-muted-foreground">Link inválido ou expirado.</p>
      </div>
    );
  }

  const procedures = await listPublicProceduresAction(accountId);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 space-y-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{accountName}</h1>
        <p className="text-sm text-muted-foreground">Escolha o procedimento, o dia e o horário.</p>
      </div>
      <PublicBookingWizard accountId={accountId} procedures={procedures} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manually verify in the browser**

Run: `npm run dev` (skip if already running).
- Find a valid `accountId`: open `/pipeline` while logged in, or check the `accounts` table directly (e.g. via Supabase dashboard, or `npx supabase db execute "select id, name from accounts"` if using local CLI query tooling).
- In a new **private/incognito** browser window (to confirm no session is used), open `/agendar/<that-accountId>`. Confirm the clinic name and procedure list render without needing to log in.
- Complete the 3 steps with a new name/phone not already in the CRM. Confirm the success screen appears.
- Log back into the internal app, open `/pacientes`, confirm the new patient was created; open `/agenda`, confirm the appointment appears at the chosen date/time.
- Open `/agendar/00000000-0000-0000-0000-000000000000` (a random, non-existent UUID). Confirm it shows "Link inválido ou expirado." and nothing else.

- [ ] **Step 4: Commit**

```bash
git add "src/app/agendar/[accountId]/page.tsx"
git commit -m "feat(agendar): add public self-scheduling page"
```

---

### Task 4: "Copiar link" button on the internal `/agendamento` screen

**Files:**
- Create: `src/components/agendamento/copy-booking-link-button.tsx`
- Modify: `src/app/(app)/agendamento/page.tsx`

**Interfaces:**
- Consumes: `PageHeader`'s `action` prop (`src/components/layout/page-header.tsx`, unchanged); `getCurrentAccountId`, `createServerSupabaseClient` (unchanged).
- Produces: `CopyBookingLinkButton({ accountId }: { accountId: string })` — a self-contained client component, not consumed elsewhere.

- [ ] **Step 1: Implement the button component**

Create `src/components/agendamento/copy-booking-link-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyBookingLinkButton({ accountId }: { accountId: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/agendar/${accountId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="outline" onClick={handleCopy}>
      {copied ? "Link copiado!" : "Copiar link de agendamento"}
    </Button>
  );
}
```

- [ ] **Step 2: Wire it into the internal Agendamento page**

Replace the full contents of `src/app/(app)/agendamento/page.tsx`:

```tsx
import { PageHeader } from "@/components/layout/page-header";
import { BookingWizard } from "@/components/agendamento/booking-wizard";
import { CopyBookingLinkButton } from "@/components/agendamento/copy-booking-link-button";
import { listProceduresAction } from "@/app/(app)/agenda/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";

export default async function AgendamentoPage() {
  const procedures = await listProceduresAction();
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);

  return (
    <div>
      <PageHeader
        title="Marcar consulta"
        description="Escolha o procedimento, o dia e o horário."
        action={<CopyBookingLinkButton accountId={accountId} />}
      />
      <div className="px-6 pb-6">
        <BookingWizard procedures={procedures} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify in the browser**

Run: `npm run dev` (skip if already running), logged in, open `/agendamento`. Confirm a "Copiar link de agendamento" button appears next to the title, click it, confirm it briefly shows "Link copiado!" and that pasting the clipboard content elsewhere yields a URL of the form `http://localhost:3000/agendar/<accountId>` matching the logged-in account.

- [ ] **Step 5: Run the full test suite as a final regression check**

Run: `npm run test`
Expected: PASS — this plan touched no `modules/` logic, so no test should be affected.

- [ ] **Step 6: Commit**

```bash
git add src/components/agendamento/copy-booking-link-button.tsx "src/app/(app)/agendamento/page.tsx"
git commit -m "feat(agendamento): add copy-link button for the public self-scheduling page"
```

---

## Fora de Escopo (herdado da spec)

Ver seção "Fora de Escopo" em `docs/superpowers/specs/2026-08-24-autoagendamento-publico-design.md` — slug amigável, CAPTCHA/rate-limiting, envio automático do link, confirmação por e-mail/notificação automática, cancelamento/reagendamento público.
