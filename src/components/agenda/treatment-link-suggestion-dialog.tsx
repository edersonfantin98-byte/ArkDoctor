"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { linkAppointmentToTreatmentAction } from "@/app/(app)/agenda/actions";
import type { Treatment } from "@/modules/treatments/types";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function TreatmentLinkSuggestionDialog({
  open,
  onOpenChange,
  appointmentId,
  treatment,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  treatment: Treatment;
  onLinked: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await linkAppointmentToTreatmentAction(appointmentId, treatment.id);
      onOpenChange(false);
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao vincular");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular esta sessão ao tratamento em andamento?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-sm text-muted-foreground">
            Tratamento iniciado em {formatDate(treatment.startedOn)} — {treatment.woundTypes}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Agora não
            </Button>
            <Button type="button" className="flex-1" onClick={handleConfirm} disabled={saving}>
              Vincular
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
