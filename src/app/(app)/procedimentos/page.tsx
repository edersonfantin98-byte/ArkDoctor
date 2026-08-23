import { listProceduresAction } from "@/app/(app)/agenda/actions";
import { ProceduresClient } from "@/components/procedures/procedures-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function ProceduresPage() {
  const procedures = await listProceduresAction();

  return (
    <div>
      <PageHeader
        title="Procedimentos"
        description="Cadastre os procedimentos oferecidos, com valor e duração padrão."
      />
      <ProceduresClient initialProcedures={procedures} />
    </div>
  );
}
