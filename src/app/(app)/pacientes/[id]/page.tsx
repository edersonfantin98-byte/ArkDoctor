import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PatientDetailClient } from "@/components/patients/patient-detail-client";
import { getPatientAction, listTreatmentsAction } from "./actions";

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let patient;
  try {
    patient = await getPatientAction(id);
  } catch {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Paciente não encontrado.{" "}
          <Link href="/pacientes" className="underline">
            Voltar
          </Link>
        </p>
      </div>
    );
  }

  const treatments = await listTreatmentsAction(id);

  return (
    <div>
      <PageHeader title={patient.name} description="Detalhe do paciente e tratamentos." />
      <PatientDetailClient patient={patient} treatments={treatments} />
    </div>
  );
}
