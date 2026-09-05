import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { TreatmentDetailClient } from "@/components/treatments/treatment-detail-client";
import {
  getTreatmentAction,
  listTreatmentPhotosAction,
  listTreatmentSessionsAction,
} from "@/app/(app)/pacientes/[id]/actions";

export default async function TreatmentDetailPage({
  params,
}: {
  params: Promise<{ id: string; treatmentId: string }>;
}) {
  const { id, treatmentId } = await params;
  const treatment = await getTreatmentAction(treatmentId);

  if (!treatment || treatment.contactId !== id) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Tratamento não encontrado.{" "}
          <Link href={`/pacientes/${id}`} className="underline">
            Voltar
          </Link>
        </p>
      </div>
    );
  }

  const [sessionsData, photos] = await Promise.all([
    listTreatmentSessionsAction(treatmentId),
    listTreatmentPhotosAction(treatmentId),
  ]);

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Pacientes", href: "/pacientes" },
          { label: "Paciente", href: `/pacientes/${id}` },
          { label: "Tratamento" },
        ]}
      />
      <PageHeader eyebrow="Tratamento" title={treatment.woundTypes} />
      <TreatmentDetailClient
        contactId={id}
        treatment={treatment}
        sessionCount={sessionsData.count}
        sessions={sessionsData.sessions}
        photos={photos}
      />
    </div>
  );
}
