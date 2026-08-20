import { listPipelineAction } from "./actions";
import { PipelineClient } from "@/components/pipeline/pipeline-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function PipelinePage() {
  const columns = await listPipelineAction();

  return (
    <div>
      <PageHeader
        eyebrow="CRM"
        title="Pipeline"
        description="Acompanhe seus contatos do primeiro contato ao pós-atendimento."
      />
      <PipelineClient initialColumns={columns} />
    </div>
  );
}
