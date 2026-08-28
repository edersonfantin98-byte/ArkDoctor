import Link from "next/link";
import { TreatmentReportView } from "@/components/treatments/treatment-report-view";
import { getTreatmentReportDataAction } from "@/app/(app)/pacientes/[id]/actions";

export default async function TreatmentReportPage({
  params,
}: {
  params: Promise<{ id: string; treatmentId: string }>;
}) {
  const { id, treatmentId } = await params;

  let report;
  try {
    report = await getTreatmentReportDataAction(treatmentId);
  } catch {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Não foi possível gerar o relatório.{" "}
          <Link href={`/pacientes/${id}/tratamentos/${treatmentId}`} className="underline">
            Voltar
          </Link>
        </p>
      </div>
    );
  }

  if (report.treatment.contactId !== id) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Relatório não encontrado.</p>
      </div>
    );
  }

  return <TreatmentReportView report={report} />;
}
