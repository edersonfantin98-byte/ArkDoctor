"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PatientFormDialog } from "./patient-form-dialog";
import { TreatmentFormDialog } from "@/components/treatments/treatment-form-dialog";
import type { Contact } from "@/modules/crm/types";
import type { Treatment } from "@/modules/treatments/types";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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
    <div className="space-y-8 px-6 pb-6">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Dados do paciente</h2>
          <div className="flex items-center gap-2">
            <Link
              href={`/pacientes/${patient.id}/documentos`}
              className="inline-flex h-7 items-center rounded-md border px-2.5 text-[0.8rem] font-medium hover:bg-muted/40"
            >
              Documentos
            </Link>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              Editar dados
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Telefone</dt><dd>{patient.phone}</dd></div>
          <div><dt className="text-muted-foreground">E-mail</dt><dd>{patient.email ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">CPF</dt><dd>{patient.cpf ?? "—"}</dd></div>
          <div>
            <dt className="text-muted-foreground">Nascimento</dt>
            <dd>{patient.birthDate ? formatDate(patient.birthDate) : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Tratamentos</h2>
          <Button type="button" size="sm" onClick={() => setTreatmentFormOpen(true)}>
            Novo tratamento
          </Button>
        </div>
        {treatments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum tratamento registrado.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {treatments.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/pacientes/${patient.id}/tratamentos/${t.id}`}
                  className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-muted/40"
                >
                  <span>
                    Tratamento iniciado em {formatDate(t.startedOn)} — {t.woundTypes}
                  </span>
                  <Badge variant={t.status === "concluido" ? "secondary" : "default"}>
                    {t.status === "concluido" ? "Concluído" : "Em andamento"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

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
    </div>
  );
}
