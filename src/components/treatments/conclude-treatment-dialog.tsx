"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { concludeTreatmentAction } from "@/app/(app)/pacientes/[id]/actions";
import type { Treatment, WoundOutcome } from "@/modules/treatments/types";

const OUTCOMES: { value: WoundOutcome; label: string }[] = [
  { value: "cicatrizacao", label: "Cicatrização completa" },
  { value: "alta", label: "Alta pela profissional" },
  { value: "abandono", label: "Abandono do tratamento" },
  { value: "encaminhamento", label: "Encaminhamento" },
];

export function ConcludeTreatmentDialog({
  open,
  onOpenChange,
  treatmentId,
  onConcluded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatmentId: string;
  onConcluded: (treatment: Treatment) => void;
}) {
  const [outcome, setOutcome] = useState<WoundOutcome>("cicatrizacao");
  const [dischargedOn, setDischargedOn] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      const done = await concludeTreatmentAction(treatmentId, { outcome, dischargedOn });
      onConcluded(done);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao concluir tratamento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Concluir tratamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Desfecho</legend>
            {OUTCOMES.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="outcome"
                  value={o.value}
                  checked={outcome === o.value}
                  onChange={() => setOutcome(o.value)}
                />
                {o.label}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="dischargedOn">Data de alta</Label>
            <Input
              id="dischargedOn"
              type="date"
              value={dischargedOn}
              onChange={(e) => setDischargedOn(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="button" className="flex-1" onClick={handleConfirm} disabled={saving}>
              {saving ? "Concluindo…" : "Concluir"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
