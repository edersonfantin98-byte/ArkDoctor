import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ConsentCards } from "@/components/consents/consent-cards";
import { getConsentPageDataAction } from "../actions";

export default async function ConsentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getConsentPageDataAction(id);
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

  return (
    <div>
      <PageHeader
        title={`Documentos — ${data.patientName}`}
        description="Consentimentos assinados pelo paciente."
      />
      <div className="px-6 pb-6">
        <ConsentCards
          contactId={id}
          patientName={data.patientName}
          professionalMissing={data.professionalMissing}
          headerLines={data.headerLines}
          docs={data.docs}
          initialConsents={data.consents}
        />
      </div>
    </div>
  );
}
