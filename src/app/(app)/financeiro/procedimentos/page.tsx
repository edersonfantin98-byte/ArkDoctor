import { listProceduresAction } from "../actions";
import { ProceduresClient } from "@/components/finance/procedures-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function ProceduresPage() {
  const procedures = await listProceduresAction();

  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Procedimentos"
        description="Cadastre os procedimentos e valores padrão usados nos seus lançamentos."
      />
      <ProceduresClient initialProcedures={procedures} />
    </div>
  );
}
