"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkPublicConflictAction, createPublicBookingAction, listPublicOccupiedIntervalsAction } from "@/app/agendar/actions";
import { isSlotBusy, dayRangeIso, type OccupiedInterval } from "./slot-availability";
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

function availableSlotsForDate(selectedDate: string): string[] {
  if (selectedDate !== todayInputValue()) return SLOTS;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return SLOTS.filter((s) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m > currentMinutes;
  });
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

  const [occupiedIntervals, setOccupiedIntervals] = useState<OccupiedInterval[]>([]);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = dayRangeIso(date);
    listPublicOccupiedIntervalsAction(accountId, from, to)
      .then((result) => {
        if (!cancelled) setOccupiedIntervals(result);
      })
      .catch(() => {
        if (!cancelled) setOccupiedIntervals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, date]);

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
      const result = await createPublicBookingAction(accountId, {
        name: name.trim(),
        phone: phone.trim(),
        procedureId,
        startsAt: start,
      });
      if (result.ok) {
        setConfirmed(true);
      } else {
        setSubmitError(result.error);
      }
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
                  onClick={() => {
                    setProcedureId(p.id);
                    setSlot(null);
                  }}
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
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
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
