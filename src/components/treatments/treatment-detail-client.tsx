"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConcludeTreatmentDialog } from "./conclude-treatment-dialog";
import { TreatmentPhotos } from "./treatment-photos";
import { updateTreatmentAction } from "@/app/(app)/pacientes/[id]/actions";
import type { Treatment, TreatmentSession } from "@/modules/treatments/types";

const OUTCOME_LABELS: Record<string, string> = {
  cicatrizacao: "Cicatrização completa",
  alta: "Alta pela profissional",
  abandono: "Abandono do tratamento",
  encaminhamento: "Encaminhamento",
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function TreatmentDetailClient({
  contactId,
  treatment: initialTreatment,
  sessionCount,
  sessions,
  photos,
}: {
  contactId: string;
  treatment: Treatment;
  sessionCount: number;
  sessions: TreatmentSession[];
  photos: { id: string; url: string; caption: string | null; takenOn: string | null }[];
}) {
  const [treatment, setTreatment] = useState(initialTreatment);
  const [woundTypes, setWoundTypes] = useState(treatment.woundTypes);
  const [woundDetails, setWoundDetails] = useState(treatment.woundDetails ?? "");
  const [treatmentType, setTreatmentType] = useState(treatment.treatmentType ?? "");
  const [assessment, setAssessment] = useState(treatment.professionalAssessment ?? "");
  const [perception, setPerception] = useState(treatment.patientPerception ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [concludeOpen, setConcludeOpen] = useState(false);

  const isDone = treatment.status === "concluido";

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTreatmentAction(treatment.id, {
        woundTypes,
        woundDetails: woundDetails.trim() || null,
        treatmentType: treatmentType.trim() || null,
        professionalAssessment: assessment.trim() || null,
        patientPerception: perception.trim() || null,
      });
      setTreatment(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8 px-6 pb-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Link href={`/pacientes/${contactId}`} className="underline">
          ← Voltar ao paciente
        </Link>
        <Badge variant={isDone ? "secondary" : "default"}>
          {isDone ? "Concluído" : "Em andamento"}
        </Badge>
        <span>Início: {formatDate(treatment.startedOn)}</span>
        {isDone && treatment.dischargedOn && (
          <span>
            Alta: {formatDate(treatment.dischargedOn)} —{" "}
            {OUTCOME_LABELS[treatment.outcome ?? ""] ?? treatment.outcome}
          </span>
        )}
        <Link
          href={`/pacientes/${contactId}/tratamentos/${treatment.id}/relatorio`}
          className="ml-auto"
        >
          <Button type="button" size="sm">Imprimir relatório</Button>
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="woundTypes">Tipos de ferida</Label>
          <Input id="woundTypes" value={woundTypes} onChange={(e) => setWoundTypes(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="treatmentType">Tipo de tratamento</Label>
          <Input
            id="treatmentType"
            value={treatmentType}
            onChange={(e) => setTreatmentType(e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="woundDetails">Detalhes da ferida</Label>
          <Textarea
            id="woundDetails"
            value={woundDetails}
            onChange={(e) => setWoundDetails(e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="assessment">Avaliação da profissional</Label>
          <Textarea id="assessment" value={assessment} onChange={(e) => setAssessment(e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="perception">Percepção do paciente</Label>
          <Textarea id="perception" value={perception} onChange={(e) => setPerception(e.target.value)} />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          {!isDone && (
            <Button type="button" variant="outline" onClick={() => setConcludeOpen(true)}>
              Concluir tratamento
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{sessionCount} sessões realizadas</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma sessão concluída vinculada.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {sessions.map((s) => (
              <li key={s.appointmentId} className="flex gap-3 p-2">
                <span className="text-muted-foreground">
                  {new Date(s.date).toLocaleDateString("pt-BR")}
                </span>
                <span className="min-w-0 flex-1 truncate">{s.notes ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TreatmentPhotos treatmentId={treatment.id} initialPhotos={photos} />

      <ConcludeTreatmentDialog
        open={concludeOpen}
        onOpenChange={setConcludeOpen}
        treatmentId={treatment.id}
        onConcluded={setTreatment}
      />
    </div>
  );
}
