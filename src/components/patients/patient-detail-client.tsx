"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, FileText, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DescriptionList, DLRow } from "@/components/ui/description-list";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionLabel } from "@/components/layout/section-label";
import { PatientFormDialog } from "./patient-form-dialog";
import { TreatmentFormDialog } from "@/components/treatments/treatment-form-dialog";
import type { Contact } from "@/modules/crm/types";
import type { Treatment } from "@/modules/treatments/types";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function calculateAge(birthDate: string | null): string {
  if (!birthDate) return "—";
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return "—";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return String(age);
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function PatientDetailClient({
  patient: initialPatient,
  treatments: initialTreatments,
}: {
  patient: Contact;
  treatments: Treatment[];
}) {
  const [patient, setPatient] = useState(initialPatient);
  const [treatments, setTreatments] = useState(initialTreatments);
  const [editOpen, setEditOpen] = useState(false);
  const [treatmentFormOpen, setTreatmentFormOpen] = useState(false);

  return (
    <>
      <div className="flex justify-end px-6 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil /> Editar dados
        </Button>
      </div>

      <div className="grid items-start gap-5 px-6 pb-6 md:grid-cols-[284px_1fr]">
        <Card className="md:sticky md:top-5">
          <div className="flex flex-col items-center gap-2 px-5 pt-6 pb-4 text-center">
            <Avatar className="size-14 text-lg">
              <AvatarFallback>{initials(patient.name)}</AvatarFallback>
            </Avatar>
            <b className="text-base font-medium">{patient.name}</b>
            <span className="text-xs text-muted-foreground">{calculateAge(patient.birthDate)} anos</span>
          </div>
          <div className="border-t px-5 py-4">
            <DescriptionList>
              <DLRow label="Telefone">
                <span className="tabular-nums">{patient.phone}</span>
              </DLRow>
              <DLRow label="E-mail">{patient.email ?? "—"}</DLRow>
              <DLRow label="CPF">
                <span className="tabular-nums">{patient.cpf ?? "—"}</span>
              </DLRow>
              <DLRow label="Nascimento">
                <span className="tabular-nums">
                  {patient.birthDate ? formatDate(patient.birthDate) : "—"}
                </span>
              </DLRow>
            </DescriptionList>
          </div>
          <div className="flex flex-col gap-2 border-t px-5 py-4">
            <b className="text-xs font-medium">Documentos</b>
            <Link
              href={`/pacientes/${patient.id}/documentos`}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Ver documentos →
            </Link>
          </div>
        </Card>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Tratamentos</SectionLabel>
            <Button type="button" size="sm" onClick={() => setTreatmentFormOpen(true)}>
              <Plus /> Novo tratamento
            </Button>
          </div>
          {treatments.length === 0 ? (
            <Card>
              <EmptyState
                icon={FileText}
                title="Nenhum tratamento registrado"
                action={
                  <Button type="button" size="sm" variant="outline" onClick={() => setTreatmentFormOpen(true)}>
                    Novo tratamento
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {treatments.map((t) => (
                <Link
                  key={t.id}
                  href={`/pacientes/${patient.id}/tratamentos/${t.id}`}
                  className="flex items-center gap-3.5 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition hover:ring-foreground/20"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-sm font-medium">{t.woundTypes}</b>
                      <Badge
                        variant={t.status === "concluido" ? "secondary" : "default"}
                        className={t.status === "concluido" ? undefined : "bg-warn-soft text-warn"}
                      >
                        {t.status === "concluido" ? "Concluído" : "Em andamento"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Iniciado em {formatDate(t.startedOn)}
                    </span>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <PatientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editingPatient={patient}
        onSaved={setPatient}
      />
      <TreatmentFormDialog
        open={treatmentFormOpen}
        onOpenChange={setTreatmentFormOpen}
        contactId={patient.id}
        onCreated={(t) => setTreatments((prev) => [t, ...prev])}
      />
    </>
  );
}
