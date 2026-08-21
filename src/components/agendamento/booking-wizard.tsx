"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  checkConflictAction,
  createAppointmentAction,
} from "@/app/(app)/agenda/actions";
import { searchContactsAction } from "@/app/(app)/pipeline/actions";
import { cn } from "@/lib/utils";
import type { Contact } from "@/modules/crm/types";
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

export function BookingWizard({ procedures }: { procedures: Procedure[] }) {
  const router = useRouter();

  const [step, setStep] = useState<Step>("procedure");

  const [procedureId, setProcedureId] = useState("");

  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedContactName, setSelectedContactName] = useState("");

  const [date, setDate] = useState(todayInputValue());
  const [slot, setSlot] = useState<string | null>(null);

  const [checkingConflict, setCheckingConflict] = useState(false);
  const [conflictReason, setConflictReason] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [conflictCheckError, setConflictCheckError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      setConflictReason(null);
      return;
    }

    let cancelled = false;
    setCheckingConflict(true);
    setConflictCheckError(null);
    checkConflictAction(start, end)
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

  async function handleContactSearch(value: string) {
    setContactQuery(value);
    setSelectedContactId(null);
    if (!value.trim()) {
      setContactResults([]);
      return;
    }
    setContactResults(await searchContactsAction(value));
  }

  async function handleConfirm() {
    setSubmitError(null);
    const start = startsAtIso();
    if (!selectedContactId || !procedureId || !start) {
      setSubmitError("Preencha todos os campos antes de confirmar");
      return;
    }

    setSubmitting(true);
    try {
      await createAppointmentAction({
        contactId: selectedContactId,
        procedureId,
        startsAt: start,
      });
      router.push("/agenda");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erro ao criar agendamento");
    } finally {
      setSubmitting(false);
    }
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
                <p className="text-sm text-muted-foreground">Nenhum procedimento cadastrado.</p>
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
                <Label htmlFor="contact">Contato</Label>
                <Input
                  id="contact"
                  value={contactQuery}
                  onChange={(e) => handleContactSearch(e.target.value)}
                  placeholder="Buscar por nome ou telefone"
                />
                {contactResults.length > 0 && !selectedContactId && (
                  <ul className="rounded border">
                    {contactResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full px-2 py-1 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setSelectedContactId(c.id);
                            setContactQuery(c.name);
                            setSelectedContactName(c.name);
                            setContactResults([]);
                          }}
                        >
                          {c.name} — {c.phone}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

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
                  disabled={!selectedContactId || !slot}
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
            {selectedContactName && (
              <p className="font-medium">{selectedContactName}</p>
            )}
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
