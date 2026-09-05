import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
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
      <Breadcrumbs
        items={[
          { label: "Pacientes", href: "/pacientes" },
          { label: data.patientName, href: `/pacientes/${id}` },
          { label: "Documentos" },
        ]}
      />
      <PageHeader
        eyebrow="Documentos"
        title="Consentimentos"
        description="Termos assinados pela paciente. O PDF guarda a assinatura e a data."
      />
      <div className="px-6 pb-6">
        <ConsentCards
          contactId={id}
          patientName={data.patientName}
          professionalMissing={data.professionalMissing}
          docs={data.docs}
          initialConsents={data.consents}
        />
      </div>
    </div>
  );
}
