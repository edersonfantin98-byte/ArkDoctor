import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { PatientDetailClient } from "@/components/patients/patient-detail-client";
import { Button } from "@/components/ui/button";
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
  const activeCount = treatments.filter((t) => t.status !== "concluido").length;
  const [y, m, d] = patient.createdAt.slice(0, 10).split("-");
  const description = `Cadastrado em ${d}/${m}/${y} · ${activeCount} ${
    activeCount === 1 ? "tratamento ativo" : "tratamentos ativos"
  }`;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Pacientes", href: "/pacientes" }, { label: patient.name }]} />
      <PageHeader
        eyebrow="Paciente"
        title={patient.name}
        description={description}
        action={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/pacientes/${patient.id}/documentos`} />}>
            Documentos
          </Button>
        }
      />
      <PatientDetailClient patient={patient} treatments={treatments} />
    </div>
  );
}
