import { listPatientsAction } from "@/app/(app)/pacientes/actions";
import { PatientsClient } from "@/components/patients/patients-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function PatientsPage() {
  const patients = await listPatientsAction();

  return (
    <div>
      <PageHeader
        title="Pacientes"
        eyebrow="Clínica"
        description="Cadastro, histórico de tratamentos e mensagens em massa pelo WhatsApp."
      />
      <PatientsClient initialPatients={patients} />
    </div>
  );
}
