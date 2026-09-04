import { listProceduresAction } from "@/app/(app)/agenda/actions";
import { ProceduresClient } from "@/components/procedures/procedures-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function ProceduresPage() {
  const procedures = await listProceduresAction();

  return (
    <div>
      <PageHeader
        title="Procedimentos"
        eyebrow="Clínica"
        description="Valor e duração padrão de cada procedimento. Usados como sugestão ao agendar e ao lançar no financeiro."
      />
      <ProceduresClient initialProcedures={procedures} />
    </div>
  );
}
