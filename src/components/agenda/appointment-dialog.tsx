"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createAppointmentAction,
  updateAppointmentTimeAction,
  updateAppointmentNotesAction,
  listProceduresAction,
} from "@/app/(app)/agenda/actions";
import { searchContactsAction } from "@/app/(app)/pipeline/actions";
import { getFinancialEntryByAppointmentAction } from "@/app/(app)/financeiro/actions";
import { AppointmentStatusMenu } from "./appointment-status-menu";
import { RevenueSuggestionDialog } from "./revenue-suggestion-dialog";
import type { AppointmentWithDetails, AppointmentStatus } from "@/modules/scheduling/types";
import type { Contact } from "@/modules/crm/types";
import type { Procedure } from "@/modules/scheduling/types";

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AppointmentDialog({
  open,
  onOpenChange,
  slot,
  editingAppointment,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: { start: Date; end: Date } | null;
  editingAppointment: AppointmentWithDetails | null;
  onSaved: () => void;
}) {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [procedureId, setProcedureId] = useState<string>("");
  const [startsAt, setStartsAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revenueSuggestionOpen, setRevenueSuggestionOpen] = useState(false);

  async function handleStatusChange(status: AppointmentStatus) {
    if (status !== "concluido" || !editingAppointment) return;
    const existing = await getFinancialEntryByAppointmentAction(editingAppointment.id);
    if (!existing) setRevenueSuggestionOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    listProceduresAction().then(setProcedures);

    if (editingAppointment) {
      setSelectedContactId(editingAppointment.contactId);
      setContactQuery(editingAppointment.contact.name);
      setProcedureId(editingAppointment.procedureId);
      setStartsAt(toLocalInputValue(new Date(editingAppointment.startsAt)));
      setNotes(editingAppointment.notes ?? "");
    } else if (slot) {
      setSelectedContactId(null);
      setContactQuery("");
      setProcedureId("");
      setStartsAt(toLocalInputValue(slot.start));
    }
    setError(null);
  }, [open, editingAppointment, slot]);

  async function handleContactSearch(value: string) {
    setContactQuery(value);
    setSelectedContactId(null);
    if (!value.trim()) {
      setContactResults([]);
      return;
    }
    setContactResults(await searchContactsAction(value));
  }

  async function handleSubmit() {
    setError(null);
    try {
      const startsAtIso = new Date(startsAt).toISOString();

      if (editingAppointment) {
        const durationMs = new Date(editingAppointment.endsAt).getTime() -
          new Date(editingAppointment.startsAt).getTime();
        const endsAtIso = new Date(new Date(startsAtIso).getTime() + durationMs).toISOString();
        await updateAppointmentTimeAction(editingAppointment.id, startsAtIso, endsAtIso);
      } else {
        if (!selectedContactId) {
          setError("Selecione um contato");
          return;
        }
        await createAppointmentAction({
          contactId: selectedContactId,
          procedureId,
          startsAt: startsAtIso,
        });
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar agendamento");
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingAppointment ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!editingAppointment && (
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
          )}

          {!editingAppointment && (
            <div className="space-y-1">
              <Label htmlFor="procedure">Procedimento</Label>
              <Select
                value={procedureId}
                onValueChange={(value) => setProcedureId(value ?? "")}
                items={procedures.map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.defaultDurationMinutes}min)`,
                }))}
              >
                <SelectTrigger id="procedure">
                  <SelectValue placeholder="Selecione um procedimento" />
                </SelectTrigger>
                <SelectContent>
                  {procedures.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {`${p.name} (${p.defaultDurationMinutes}min)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="startsAt">Início</Label>
            <Input
              id="startsAt"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>

          {editingAppointment && (
            <>
              <div className="space-y-1">
                <Label htmlFor="status">Status</Label>
                <AppointmentStatusMenu
                  appointmentId={editingAppointment.id}
                  currentStatus={editingAppointment.status}
                  onChanged={onSaved}
                  onStatusChange={handleStatusChange}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    await updateAppointmentNotesAction(editingAppointment.id, notes);
                    onSaved();
                  }}
                >
                  Salvar notas
                </Button>
              </div>
            </>
          )}

          <Button
            type="button"
            className="w-full"
            onClick={handleSubmit}
            disabled={!editingAppointment && (!selectedContactId || !procedureId)}
          >
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    {editingAppointment && (
      <RevenueSuggestionDialog
        key={editingAppointment.id}
        open={revenueSuggestionOpen}
        onOpenChange={setRevenueSuggestionOpen}
        appointment={editingAppointment}
        onCreated={onSaved}
      />
    )}
    </>
  );
}
