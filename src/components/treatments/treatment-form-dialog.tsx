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
import { createTreatmentAction } from "@/app/(app)/pacientes/[id]/actions";
import type { Treatment } from "@/modules/treatments/types";

const KNOWN_WOUND_TYPES = [
  "lesão por diabetes",
  "úlcera venosa",
  "úlcera arterial",
  "lesão por trauma",
  "lesão por pressão",
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TreatmentFormDialog({
  open,
  onOpenChange,
  contactId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  onCreated: (treatment: Treatment) => void;
}) {
  const [woundTypes, setWoundTypes] = useState("");
  const [woundDetails, setWoundDetails] = useState("");
  const [treatmentType, setTreatmentType] = useState("");
  const [startedOn, setStartedOn] = useState(today());
  const [professionalAssessment, setProfessionalAssessment] = useState("");
  const [patientPerception, setPatientPerception] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the dialog opens
    setWoundTypes("");
    setWoundDetails("");
    setTreatmentType("");
    setStartedOn(today());
    setProfessionalAssessment("");
    setPatientPerception("");
    setError(null);
  }, [open]);

  function addKnownType(type: string) {
    setWoundTypes((prev) => {
      const parts = prev.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.includes(type)) return prev;
      return [...parts, type].join(", ");
    });
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const created = await createTreatmentAction({
        contactId,
        woundTypes,
        woundDetails: woundDetails.trim() || undefined,
        treatmentType: treatmentType.trim() || undefined,
        startedOn,
        professionalAssessment: professionalAssessment.trim() || undefined,
        patientPerception: patientPerception.trim() || undefined,
      });
      onCreated(created);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar tratamento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo tratamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="space-y-1">
            <Label htmlFor="woundTypes">Tipos de ferida</Label>
            <Input
              id="woundTypes"
              value={woundTypes}
              onChange={(e) => setWoundTypes(e.target.value)}
              placeholder="Ex.: úlcera venosa"
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {KNOWN_WOUND_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addKnownType(type)}
                  className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  + {type}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="woundDetails">Detalhes da ferida</Label>
            <Textarea
              id="woundDetails"
              value={woundDetails}
              onChange={(e) => setWoundDetails(e.target.value)}
              placeholder="Local no corpo, lado, aspecto…"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="treatmentType">Tipo de tratamento</Label>
            <Input
              id="treatmentType"
              value={treatmentType}
              onChange={(e) => setTreatmentType(e.target.value)}
              placeholder="Ex.: ozonioterapia — bagging"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="startedOn">Data de início</Label>
            <Input
              id="startedOn"
              type="date"
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="assessment">Avaliação da profissional</Label>
            <Textarea
              id="assessment"
              value={professionalAssessment}
              onChange={(e) => setProfessionalAssessment(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="perception">Percepção do paciente</Label>
            <Textarea
              id="perception"
              value={patientPerception}
              onChange={(e) => setPatientPerception(e.target.value)}
            />
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={handleSubmit}
            disabled={saving || !woundTypes.trim()}
          >
            {saving ? "Criando…" : "Criar tratamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
