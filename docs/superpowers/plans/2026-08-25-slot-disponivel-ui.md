# Exibir Horários Ocupados na UI de Agendamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Antecipar na UI de agendamento a informação de que um horário já está ocupado, em vez de só rejeitar no fim do fluxo.

**Architecture:** Uma nova função de serviço (`listOccupiedIntervals`) reaproveita os métodos de repositório já existentes para calcular os intervalos ocupados (agendamentos + bloqueios pontuais + regras recorrentes) de um dia específico. Duas server actions finas expõem isso para o cliente (autenticada e pública). Um helper puro e testável (`isSlotBusy`) decide, no cliente, se um slot fixo de horário colide com esses intervalos, dada a duração do procedimento. Os dois wizards de agendamento passam a desabilitar visualmente os slots ocupados; o dialog da agenda interna (que usa um input livre, não uma grade) ganha uma checagem de conflito inline que desabilita o botão "Salvar" antes de submeter — reaproveitando a `checkConflictAction` que já existe.

**Tech Stack:** Next.js (App Router, server actions), React, TypeScript, Vitest (testes unitários, sem mocks — repositório em memória), Tailwind (classes utilitárias para o estado desabilitado).

**Spec:** `docs/superpowers/specs/2026-08-25-slot-disponivel-ui-design.md`

## Global Constraints

- Nenhuma informação de contato/paciente deve trafegar nas novas actions/funções de intervalos ocupados — só `{ startsAt, endsAt }`.
- A checagem de conflito síncrona já existente (`checkConflictAction`/`checkPublicConflictAction`) na etapa de confirmação dos wizards permanece intacta, como segunda camada de proteção.
- Seguir o padrão de nomes já usado no código (`checkingConflict`, `conflictReason`, `conflictCheckError`) para os novos estados adicionados no dialog.
- Nenhum método novo no repositório (`SchedulingRepository`) é necessário — tudo reaproveita `listAppointmentsOverlapping`, `listAvailabilityBlocksOverlapping` e `listAvailabilityRules`.

---

### Task 1: `listOccupiedIntervals` no serviço de agendamento

**Files:**
- Modify: `src/modules/scheduling/service.ts`
- Test: `src/modules/scheduling/service.test.ts`

**Interfaces:**
- Consumes: `SchedulingRepository.listAppointmentsOverlapping`, `.listAvailabilityBlocksOverlapping`, `.listAvailabilityRules` (já existentes, ver `src/modules/scheduling/repository.ts:58-86`).
- Produces: `export interface OccupiedInterval { startsAt: string; endsAt: string }` e `export async function listOccupiedIntervals(repo: SchedulingRepository, accountId: string, range: { from: string; to: string }): Promise<OccupiedInterval[]>` — usados pela Task 2.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/modules/scheduling/service.test.ts`:

```ts
import { listOccupiedIntervals } from "./service";

describe("listOccupiedIntervals", () => {
  it("includes a non-cancelled appointment overlapping the range", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await repo.insertProcedure("acc-1", {
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

    const intervals = await listOccupiedIntervals(repo, "acc-1", {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
    });

    expect(intervals).toContainEqual({
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
    });
  });

  it("excludes a cancelled appointment", async () => {
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
    await repo.updateAppointmentStatus("acc-1", appointment.id, "cancelado");

    const intervals = await listOccupiedIntervals(repo, "acc-1", {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
    });

    expect(intervals).toHaveLength(0);
  });

  it("includes a one-off availability block", async () => {
    const repo = createInMemorySchedulingRepository();
    await repo.insertAvailabilityBlock("acc-1", {
      startsAt: "2026-09-01T12:00:00.000Z",
      endsAt: "2026-09-01T13:00:00.000Z",
      reason: "Almoço",
    });

    const intervals = await listOccupiedIntervals(repo, "acc-1", {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
    });

    expect(intervals).toContainEqual({
      startsAt: "2026-09-01T12:00:00.000Z",
      endsAt: "2026-09-01T13:00:00.000Z",
    });
  });

  it("includes a recurring rule on the matching weekday", async () => {
    const repo = createInMemorySchedulingRepository();
    // 2026-09-01 is a Tuesday (day 2).
    await repo.insertAvailabilityRule("acc-1", {
      dayOfWeek: 2,
      startTime: "12:00",
      endTime: "13:00",
      reason: "Almoço",
    });

    const intervals = await listOccupiedIntervals(repo, "acc-1", {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
    });

    expect(intervals).toContainEqual({
      startsAt: "2026-09-01T12:00:00.000Z",
      endsAt: "2026-09-01T13:00:00.000Z",
    });
  });

  it("excludes a recurring rule on a different weekday", async () => {
    const repo = createInMemorySchedulingRepository();
    // Rule is for Wednesday (day 3); the requested range is Tuesday.
    await repo.insertAvailabilityRule("acc-1", {
      dayOfWeek: 3,
      startTime: "12:00",
      endTime: "13:00",
      reason: "Almoço",
    });

    const intervals = await listOccupiedIntervals(repo, "acc-1", {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
    });

    expect(intervals).toHaveLength(0);
  });

  it("returns an empty list for a day with nothing scheduled or blocked", async () => {
    const repo = createInMemorySchedulingRepository();
    const intervals = await listOccupiedIntervals(repo, "acc-1", {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
    });
    expect(intervals).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test -- service.test.ts`
Expected: FAIL — `listOccupiedIntervals is not a function` (ou erro de import).

- [ ] **Step 3: Implementar `listOccupiedIntervals`**

Adicionar em `src/modules/scheduling/service.ts`, logo após a função `checkConflict` (linha 63 do arquivo atual):

```ts
export interface OccupiedInterval {
  startsAt: string;
  endsAt: string;
}

export async function listOccupiedIntervals(
  repo: SchedulingRepository,
  accountId: string,
  range: { from: string; to: string },
): Promise<OccupiedInterval[]> {
  const intervals: OccupiedInterval[] = [];

  const appointments = await repo.listAppointmentsOverlapping(accountId, range.from, range.to);
  for (const appointment of appointments) {
    if (appointment.status === "cancelado") continue;
    intervals.push({ startsAt: appointment.startsAt, endsAt: appointment.endsAt });
  }

  const blocks = await repo.listAvailabilityBlocksOverlapping(accountId, range.from, range.to);
  for (const block of blocks) {
    intervals.push({ startsAt: block.startsAt, endsAt: block.endsAt });
  }

  const rules = await repo.listAvailabilityRules(accountId);
  const rangeStart = new Date(range.from);
  const dayOfWeek = rangeStart.getDay();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dayDate = `${rangeStart.getFullYear()}-${pad(rangeStart.getMonth() + 1)}-${pad(rangeStart.getDate())}`;
  for (const rule of rules) {
    if (rule.dayOfWeek !== dayOfWeek) continue;
    intervals.push({
      startsAt: new Date(`${dayDate}T${rule.startTime}:00`).toISOString(),
      endsAt: new Date(`${dayDate}T${rule.endTime}:00`).toISOString(),
    });
  }

  return intervals;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test -- service.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os já existentes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/scheduling/service.ts src/modules/scheduling/service.test.ts
git commit -m "feat(scheduling): add listOccupiedIntervals for a day's busy times"
```

---

### Task 2: Server actions para expor os intervalos ocupados

**Files:**
- Modify: `src/app/(app)/agenda/actions.ts`
- Modify: `src/app/agendar/actions.ts`

**Interfaces:**
- Consumes: `scheduling.listOccupiedIntervals` e `scheduling.OccupiedInterval` (Task 1); `getReposAndAccount()` já existente em `agenda/actions.ts`; `getPublicRepos()` já existente em `agendar/actions.ts`.
- Produces: `listOccupiedIntervalsAction(from: string, to: string): Promise<OccupiedInterval[]>` e `listPublicOccupiedIntervalsAction(accountId: string, from: string, to: string): Promise<OccupiedInterval[]>` — usadas pelas Tasks 4 e 5.

Não há testes de unidade para as demais actions deste arquivo (padrão já estabelecido no projeto — são wrappers finos sobre funções de serviço já testadas). A verificação deste task é manual, via `npm run dev` na Task 4/5, quando as actions passam a ser chamadas de fato.

- [ ] **Step 1: Adicionar a action autenticada**

Em `src/app/(app)/agenda/actions.ts`, logo após `checkConflictAction` (linha 78):

```ts
export async function listOccupiedIntervalsAction(from: string, to: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.listOccupiedIntervals(schedulingRepo, accountId, { from, to });
}
```

- [ ] **Step 2: Adicionar a action pública**

Em `src/app/agendar/actions.ts`, logo após `checkPublicConflictAction` (linha 30):

```ts
export async function listPublicOccupiedIntervalsAction(
  accountId: string,
  from: string,
  to: string,
) {
  const { schedulingRepo } = getPublicRepos();
  return scheduling.listOccupiedIntervals(schedulingRepo, accountId, { from, to });
}
```

- [ ] **Step 3: Rodar a suíte inteira para garantir que nada quebrou**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/agenda/actions.ts" src/app/agendar/actions.ts
git commit -m "feat(scheduling): expose listOccupiedIntervals as server actions"
```

---

### Task 3: Helper puro `isSlotBusy` / `dayRangeIso`

**Files:**
- Create: `src/components/agendamento/slot-availability.ts`
- Test: `src/components/agendamento/slot-availability.test.ts`

**Interfaces:**
- Consumes: nada (função pura, sem dependências externas).
- Produces: `export interface OccupiedInterval { startsAt: string; endsAt: string }`, `export function isSlotBusy(date: string, slot: string, durationMinutes: number, occupiedIntervals: OccupiedInterval[]): boolean`, `export function dayRangeIso(date: string): { from: string; to: string }` — usadas pelas Tasks 4 e 5. `date` está no formato `YYYY-MM-DD`, `slot` no formato `HH:mm` (mesmo formato já usado em `SLOTS`/`DayStrip` nos dois wizards).

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/components/agendamento/slot-availability.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isSlotBusy, dayRangeIso } from "./slot-availability";

describe("isSlotBusy", () => {
  const occupied = [{ startsAt: "2026-09-01T13:00:00.000Z", endsAt: "2026-09-01T13:30:00.000Z" }];

  it("is not busy for a slot fully before the occupied interval", () => {
    expect(isSlotBusy("2026-09-01", "12:30", 30, occupied)).toBe(false);
  });

  it("is not busy for a slot fully after the occupied interval", () => {
    expect(isSlotBusy("2026-09-01", "13:30", 30, occupied)).toBe(false);
  });

  it("is busy when the slot exactly matches the occupied interval", () => {
    expect(isSlotBusy("2026-09-01", "13:00", 30, occupied)).toBe(true);
  });

  it("is busy when the slot overlaps only the start of the occupied interval", () => {
    expect(isSlotBusy("2026-09-01", "12:45", 30, occupied)).toBe(true);
  });

  it("is busy when the slot overlaps only the end of the occupied interval", () => {
    expect(isSlotBusy("2026-09-01", "13:15", 30, occupied)).toBe(true);
  });

  it("is busy when a longer procedure duration extends into the occupied interval", () => {
    expect(isSlotBusy("2026-09-01", "12:30", 60, occupied)).toBe(true);
  });

  it("returns false for an empty list of occupied intervals", () => {
    expect(isSlotBusy("2026-09-01", "13:00", 30, [])).toBe(false);
  });
});

describe("dayRangeIso", () => {
  it("returns a range spanning exactly the given local day", () => {
    const { from, to } = dayRangeIso("2026-09-01");
    const fromDate = new Date(from);
    const toDate = new Date(to);
    expect(fromDate.getFullYear()).toBe(2026);
    expect(fromDate.getMonth()).toBe(8);
    expect(fromDate.getDate()).toBe(1);
    expect(fromDate.getHours()).toBe(0);
    expect(toDate.getTime() - fromDate.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm test -- slot-availability.test.ts`
Expected: FAIL — module `./slot-availability` not found.

- [ ] **Step 3: Implementar o helper**

Criar `src/components/agendamento/slot-availability.ts`:

```ts
export interface OccupiedInterval {
  startsAt: string;
  endsAt: string;
}

export function isSlotBusy(
  date: string,
  slot: string,
  durationMinutes: number,
  occupiedIntervals: OccupiedInterval[],
): boolean {
  const slotStart = new Date(`${date}T${slot}:00`).getTime();
  const slotEnd = slotStart + durationMinutes * 60_000;

  return occupiedIntervals.some((interval) => {
    const intervalStart = new Date(interval.startsAt).getTime();
    const intervalEnd = new Date(interval.endsAt).getTime();
    return slotStart < intervalEnd && slotEnd > intervalStart;
  });
}

export function dayRangeIso(date: string): { from: string; to: string } {
  const from = new Date(`${date}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test -- slot-availability.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/agendamento/slot-availability.ts src/components/agendamento/slot-availability.test.ts
git commit -m "feat(agendamento): add isSlotBusy/dayRangeIso pure helpers"
```

---

### Task 4: Desabilitar slots ocupados no wizard interno

**Files:**
- Modify: `src/components/agendamento/booking-wizard.tsx`

**Interfaces:**
- Consumes: `listOccupiedIntervalsAction` (Task 2, de `@/app/(app)/agenda/actions`), `isSlotBusy`, `dayRangeIso`, `OccupiedInterval` (Task 3, de `./slot-availability`).
- Produces: nenhuma interface nova para outras tasks — mudança de UI isolada.

- [ ] **Step 1: Importar as novas dependências**

Em `src/components/agendamento/booking-wizard.tsx`, no topo do arquivo, adicionar aos imports existentes (perto da linha 12):

```ts
import { listOccupiedIntervalsAction } from "@/app/(app)/agenda/actions";
import { isSlotBusy, dayRangeIso, type OccupiedInterval } from "./slot-availability";
```

- [ ] **Step 2: Adicionar estado e busca dos intervalos ocupados**

Logo após a declaração de `const [slot, setSlot] = useState<string | null>(null);` (linha 107), adicionar:

```ts
const [occupiedIntervals, setOccupiedIntervals] = useState<OccupiedInterval[]>([]);

useEffect(() => {
  let cancelled = false;
  const { from, to } = dayRangeIso(date);
  listOccupiedIntervalsAction(from, to).then((result) => {
    if (!cancelled) setOccupiedIntervals(result);
  });
  return () => {
    cancelled = true;
  };
}, [date]);
```

- [ ] **Step 3: Desabilitar visualmente os slots ocupados**

Substituir o bloco de renderização dos slots (linhas 314-330):

```tsx
<div className="flex flex-wrap gap-2">
  {SLOTS.map((s) => {
    const busy = isSlotBusy(
      date,
      s,
      selectedProcedure?.defaultDurationMinutes ?? SLOT_INTERVAL_MINUTES,
      occupiedIntervals,
    );
    return (
      <button
        key={s}
        type="button"
        disabled={busy}
        className={cn(
          "rounded border px-2 py-1 text-sm",
          busy
            ? "cursor-not-allowed border-border text-muted-foreground opacity-50 line-through"
            : slot === s
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted",
        )}
        onClick={() => setSlot(s)}
      >
        {s}
      </button>
    );
  })}
</div>
```

- [ ] **Step 4: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS (mudança de UI, sem testes novos de componente — o comportamento de decisão já está coberto pelos testes de `isSlotBusy` na Task 3).

- [ ] **Step 5: Verificação manual**

Run: `npm run dev`

Abrir `/agendamento`, escolher um procedimento, ir para a etapa de data/horário. Criar (via outra aba ou diretamente no Supabase/agenda) um agendamento hoje às 10:00 e confirmar que o slot "10:00" aparece desabilitado/riscado na grade, enquanto os demais continuam clicáveis.

- [ ] **Step 6: Commit**

```bash
git add src/components/agendamento/booking-wizard.tsx
git commit -m "feat(agendamento): grey out already-booked slots in the internal wizard"
```

---

### Task 5: Desabilitar slots ocupados no wizard público

**Files:**
- Modify: `src/components/agendamento/public-booking-wizard.tsx`

**Interfaces:**
- Consumes: `listPublicOccupiedIntervalsAction` (Task 2, de `@/app/agendar/actions`), `isSlotBusy`, `dayRangeIso`, `OccupiedInterval` (Task 3, de `./slot-availability`).
- Produces: nenhuma interface nova para outras tasks.

- [ ] **Step 1: Importar as novas dependências**

Em `src/components/agendamento/public-booking-wizard.tsx`, adicionar ao import já existente da linha 8:

```ts
import { checkPublicConflictAction, createPublicBookingAction, listPublicOccupiedIntervalsAction } from "@/app/agendar/actions";
import { isSlotBusy, dayRangeIso, type OccupiedInterval } from "./slot-availability";
```

- [ ] **Step 2: Adicionar estado e busca dos intervalos ocupados**

Logo após `const [slot, setSlot] = useState<string | null>(null);` (linha 113), adicionar:

```ts
const [occupiedIntervals, setOccupiedIntervals] = useState<OccupiedInterval[]>([]);

useEffect(() => {
  let cancelled = false;
  const { from, to } = dayRangeIso(date);
  listPublicOccupiedIntervalsAction(accountId, from, to).then((result) => {
    if (!cancelled) setOccupiedIntervals(result);
  });
  return () => {
    cancelled = true;
  };
}, [accountId, date]);
```

- [ ] **Step 3: Combinar com o filtro de horários passados e desabilitar slots ocupados**

Substituir o bloco de renderização dos slots (linhas 313-329):

```tsx
<div className="flex flex-wrap gap-2">
  {availableSlotsForDate(date).map((s) => {
    const busy = isSlotBusy(
      date,
      s,
      selectedProcedure?.defaultDurationMinutes ?? SLOT_INTERVAL_MINUTES,
      occupiedIntervals,
    );
    return (
      <button
        key={s}
        type="button"
        disabled={busy}
        className={cn(
          "rounded border px-2 py-1 text-sm",
          busy
            ? "cursor-not-allowed border-border text-muted-foreground opacity-50 line-through"
            : slot === s
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted",
        )}
        onClick={() => setSlot(s)}
      >
        {s}
      </button>
    );
  })}
</div>
```

- [ ] **Step 4: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verificação manual**

Run: `npm run dev`

Abrir `/agendar/<accountId>` (um `accountId` válido do seu ambiente local), escolher um procedimento, e confirmar que um horário já ocupado naquele dia aparece desabilitado/riscado, e que os horários passados do dia de hoje continuam corretamente filtrados (não aparecem nem como opção).

- [ ] **Step 6: Commit**

```bash
git add src/components/agendamento/public-booking-wizard.tsx
git commit -m "feat(agendamento): grey out already-booked slots in the public wizard"
```

---

### Task 6: Checagem de conflito inline no dialog da agenda interna

**Files:**
- Modify: `src/components/agenda/appointment-dialog.tsx`

**Interfaces:**
- Consumes: `checkConflictAction` (já importada de `@/app/(app)/agenda/actions`, ver linha 22 do arquivo atual).
- Produces: nenhuma interface nova para outras tasks.

- [ ] **Step 1: Adicionar estado de conflito**

Logo após `const [error, setError] = useState<string | null>(null);` (linha 60), adicionar:

```ts
const [checkingConflict, setCheckingConflict] = useState(false);
const [conflictReason, setConflictReason] = useState<string | null>(null);
const [conflictCheckError, setConflictCheckError] = useState<string | null>(null);
```

- [ ] **Step 2: Disparar a checagem quando o horário ou o procedimento mudarem**

Adicionar, logo após o `useEffect` existente que sincroniza o formulário (após a linha 87, `}, [open, editingAppointment, slot]);`):

```ts
useEffect(() => {
  if (!open || !startsAt) {
    setConflictReason(null);
    return;
  }

  let durationMinutes: number | null = null;
  if (editingAppointment) {
    durationMinutes =
      (new Date(editingAppointment.endsAt).getTime() -
        new Date(editingAppointment.startsAt).getTime()) /
      60_000;
  } else {
    const procedure = procedures.find((p) => p.id === procedureId);
    durationMinutes = procedure?.defaultDurationMinutes ?? null;
  }
  if (durationMinutes === null) {
    setConflictReason(null);
    return;
  }

  const startsAtIso = new Date(startsAt).toISOString();
  const endsAtIso = new Date(new Date(startsAtIso).getTime() + durationMinutes * 60_000).toISOString();

  let cancelled = false;
  setCheckingConflict(true);
  setConflictCheckError(null);
  checkConflictAction(startsAtIso, endsAtIso, editingAppointment?.id)
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
}, [open, startsAt, procedureId, editingAppointment]);
```

- [ ] **Step 3: Mostrar o aviso e desabilitar o botão "Salvar"**

Logo após `{error && <p className="text-sm text-red-600">{error}</p>}` (linha 136), adicionar:

```tsx
{!checkingConflict && conflictReason && (
  <p className="text-sm text-red-600">{conflictReason}</p>
)}
{!checkingConflict && conflictCheckError && (
  <p className="text-sm text-red-600">{conflictCheckError}</p>
)}
```

Atualizar a condição `disabled` do botão "Salvar" (linha 238), de:

```tsx
disabled={!editingAppointment && (!selectedContactId || !procedureId)}
```

para:

```tsx
disabled={
  (!editingAppointment && (!selectedContactId || !procedureId)) ||
  checkingConflict ||
  !!conflictReason
}
```

- [ ] **Step 4: Rodar a suíte de testes**

Run: `npm test`
Expected: PASS (mudança de UI; a lógica de conflito em si já está coberta pelos testes de `checkConflict` em `service.test.ts`).

- [ ] **Step 5: Verificação manual**

Run: `npm run dev`

Na agenda interna (`/agenda`), abrir o dialog em um horário livre e confirmar que o botão "Salvar" fica habilitado. Depois, criar um agendamento e tentar abrir/editar outro para o mesmo horário: confirmar que aparece a mensagem de conflito e o botão "Salvar" fica desabilitado antes mesmo de clicar. Confirmar também que editar um agendamento existente sem mudar o horário não acusa conflito consigo mesmo.

- [ ] **Step 6: Commit**

```bash
git add src/components/agenda/appointment-dialog.tsx
git commit -m "feat(agenda): check time conflict inline before enabling Salvar"
```
