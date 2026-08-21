"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFinancialEntryAction } from "@/app/(app)/financeiro/actions";
import type { AppointmentWithDetails } from "@/modules/scheduling/types";

export function RevenueSuggestionDialog({
  open,
  onOpenChange,
  appointment,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentWithDetails;
  onCreated: () => void;
}) {
  const [amount, setAmount] = useState(appointment.procedure.defaultPrice);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    try {
      await createFinancialEntryAction({
        type: "revenue",
        amount,
        procedureId: appointment.procedureId,
        appointmentId: appointment.id,
        occurredAt: appointment.startsAt.slice(0, 10),
      });
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao lançar receita");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lançar receita deste atendimento?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-sm text-muted-foreground">
            {appointment.procedure.name} — {appointment.contact.name}
          </p>
          <div className="space-y-1">
            <Label htmlFor="revenue-amount">Valor</Label>
            <Input
              id="revenue-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Agora não
            </Button>
            <Button type="button" className="flex-1" onClick={handleConfirm}>
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
