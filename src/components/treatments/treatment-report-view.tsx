"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TreatmentReport } from "@/modules/treatments/types";

const OUTCOME_LABELS: Record<string, string> = {
  cicatrizacao: "Cicatrização completa",
  alta: "Alta pela profissional",
  abandono: "Abandono do tratamento",
  encaminhamento: "Encaminhamento",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function calcAge(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const had =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!had) age -= 1;
  return `${age} anos`;
}

export function TreatmentReportView({ report }: { report: TreatmentReport }) {
  const [hideSessionDetail, setHideSessionDetail] = useState(false);
  const { treatment, contact, professional } = report;
  const age = calcAge(contact.birthDate);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 text-sm text-black">
      <div className="flex items-center gap-2 print:hidden">
        <Button type="button" onClick={() => window.print()}>
          Imprimir / Salvar PDF
        </Button>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={hideSessionDetail}
            onChange={(e) => setHideSessionDetail(e.target.checked)}
          />
          Ocultar detalhe das sessões
        </label>
      </div>

      <header className="space-y-1 border-b pb-3">
        <h1 className="text-lg font-bold">{professional.clinicName}</h1>
        {professional.name && (
          <p>
            {professional.name}
            {professional.councilId ? ` — ${professional.councilId}` : ""}
          </p>
        )}
        <p>
          Paciente: <strong>{contact.name}</strong>
          {age ? ` — ${age}` : ""}
          {contact.cpf ? ` — CPF ${contact.cpf}` : ""}
        </p>
        <p className="text-xs text-neutral-600">
          Relatório gerado em {new Date(report.generatedAt).toLocaleString("pt-BR")}
        </p>
      </header>

      <section className="space-y-1">
        <h2 className="font-semibold">Dados do tratamento</h2>
        <p>Tipos de ferida: {treatment.woundTypes}</p>
        <p>Detalhes: {treatment.woundDetails ?? "—"}</p>
        <p>Tipo de tratamento: {treatment.treatmentType ?? "—"}</p>
        <p>Início: {formatDate(treatment.startedOn)}</p>
        <p>
          Fim:{" "}
          {treatment.status === "concluido"
            ? `${formatDate(treatment.dischargedOn)} — ${
                OUTCOME_LABELS[treatment.outcome ?? ""] ?? treatment.outcome
              }`
            : "Em andamento"}
        </p>
        <p>Duração: {report.durationLabel}</p>
        <p>Sessões realizadas: {report.sessionCount}</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold">Avaliação da profissional</h2>
        <p className="whitespace-pre-wrap">{treatment.professionalAssessment ?? "—"}</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold">Percepção do paciente</h2>
        <p className="whitespace-pre-wrap">{treatment.patientPerception ?? "—"}</p>
      </section>

      {!hideSessionDetail && report.sessions.length > 0 && (
        <section className="space-y-1">
          <h2 className="font-semibold">Linha do tempo das sessões</h2>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b">
                <th className="py-1 pr-3">Data</th>
                <th className="py-1">Anotação</th>
              </tr>
            </thead>
            <tbody>
              {report.sessions.map((s) => (
                <tr key={s.appointmentId} className="border-b align-top">
                  <td className="py-1 pr-3 whitespace-nowrap">
                    {new Date(s.date).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-1 whitespace-pre-wrap">{s.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report.photos.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Fotos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {report.photos.map((p, i) => (
              <figure key={i} className="break-inside-avoid space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption ?? "Foto"} className="w-full rounded object-cover" />
                <figcaption className="text-xs text-neutral-600">
                  {p.caption ?? "—"}
                  {p.takenOn ? ` (${formatDate(p.takenOn)})` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t pt-8">
        <p>
          Assinatura: ______________________________
          {professional.name ? `  ${professional.name}` : ""}
          {professional.councilId ? ` — ${professional.councilId}` : ""}
        </p>
      </footer>
    </div>
  );
}
