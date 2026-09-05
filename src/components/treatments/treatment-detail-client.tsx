"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { Textarea } from "@/components/ui/textarea";
import { ConcludeTreatmentDialog } from "./conclude-treatment-dialog";
import { TreatmentPhotos } from "./treatment-photos";
import { deleteTreatmentAction, updateTreatmentAction } from "@/app/(app)/pacientes/[id]/actions";
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

function sessionsLabel(count: number): string {
  return `${count} ${count === 1 ? "sessão realizada" : "sessões realizadas"}`;
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
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const isDone = treatment.status === "concluido";

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteTreatmentAction(treatment.id);
      router.push(`/pacientes/${contactId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir tratamento");
      setDeleting(false);
    }
  }

  function handleDiscard() {
    setWoundTypes(treatment.woundTypes);
    setWoundDetails(treatment.woundDetails ?? "");
    setTreatmentType(treatment.treatmentType ?? "");
    setAssessment(treatment.professionalAssessment ?? "");
    setPerception(treatment.patientPerception ?? "");
  }

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
    <div className="space-y-6 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge
            variant={isDone ? "secondary" : "default"}
            className={isDone ? undefined : "bg-warn-soft text-warn"}
          >
            {isDone ? "Concluído" : "Em andamento"}
          </Badge>
          <span className="size-1 rounded-full bg-border" />
          <span>Início {formatDate(treatment.startedOn)}</span>
          <span className="size-1 rounded-full bg-border" />
          <span>{sessionsLabel(sessionCount)}</span>
          {isDone && treatment.dischargedOn && (
            <>
              <span className="size-1 rounded-full bg-border" />
              <span>
                Alta {formatDate(treatment.dischargedOn)} —{" "}
                {OUTCOME_LABELS[treatment.outcome ?? ""] ?? treatment.outcome}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isDone && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConcludeOpen(true)}
              disabled={deleting}
            >
              Concluir tratamento
            </Button>
          )}
          <Button
            type="button"
            disabled={deleting}
            nativeButton={false}
            render={<Link href={`/pacientes/${contactId}/tratamentos/${treatment.id}/relatorio`} />}
          >
            <Printer /> Imprimir relatório
          </Button>
          <RowActionsMenu
            triggerLabel="Mais ações"
            actions={[]}
            destructive={{
              label: "Excluir tratamento",
              icon: Trash2,
              confirmText:
                sessionCount === 1
                  ? "Excluir este tratamento? 1 sessão deixará de estar vinculada. Esta ação não pode ser desfeita."
                  : `Excluir este tratamento? ${sessionCount} sessões deixarão de estar vinculadas. Esta ação não pode ser desfeita.`,
              confirmLabel: "Excluir",
              onConfirm: handleDelete,
            }}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="px-6 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="px-6">
        <Card>
          <div className="grid gap-4 border-b px-4 py-4 sm:grid-cols-2">
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase sm:col-span-2">
              Ferida
            </p>
            <div className="space-y-1">
              <Label htmlFor="woundTypes">Tipos de ferida</Label>
              <Input
                id="woundTypes"
                value={woundTypes}
                onChange={(e) => setWoundTypes(e.target.value)}
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
          </div>
          <div className="grid gap-4 border-b px-4 py-4 sm:grid-cols-2">
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase sm:col-span-2">
              Tratamento
            </p>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="treatmentType">Tipo de tratamento / conduta</Label>
              <Input
                id="treatmentType"
                value={treatmentType}
                onChange={(e) => setTreatmentType(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase sm:col-span-2">
              Avaliação
            </p>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="assessment">Avaliação da profissional</Label>
              <Textarea
                id="assessment"
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="perception">Percepção do paciente</Label>
              <Textarea
                id="perception"
                value={perception}
                onChange={(e) => setPerception(e.target.value)}
              />
            </div>
          </div>
          <CardContent className="flex flex-wrap items-center gap-2 pt-4">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : "Salvar alterações"}
            </Button>
            <Button type="button" variant="ghost" onClick={handleDiscard}>
              Descartar
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="px-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Sessões realizadas</CardTitle>
            <span className="text-xs text-muted-foreground">{sessionsLabel(sessionCount)}</span>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <EmptyState icon={Activity} title="Nenhuma sessão concluída vinculada" />
            ) : (
              <ul>
                {sessions.map((s) => (
                  <li key={s.appointmentId} className="flex gap-3 border-b py-2.5 last:border-0">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {new Date(s.date).toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-sm">{s.notes ?? "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="px-6">
        <Card>
          <CardHeader>
            <CardTitle>Fotos da evolução</CardTitle>
          </CardHeader>
          <CardContent>
            <TreatmentPhotos treatmentId={treatment.id} initialPhotos={photos} />
          </CardContent>
        </Card>
      </div>

      <ConcludeTreatmentDialog
        open={concludeOpen}
        onOpenChange={setConcludeOpen}
        treatmentId={treatment.id}
        onConcluded={setTreatment}
      />
    </div>
  );
}
