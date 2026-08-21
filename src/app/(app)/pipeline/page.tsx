import { listPipelineAction } from "./actions";
import { PipelineClient } from "@/components/pipeline/pipeline-client";
import { PageHeader } from "@/components/layout/page-header";
import { NewContactHeaderAction } from "@/components/pipeline/new-contact-header-action";

export default async function PipelinePage() {
  const columns = await listPipelineAction();

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Acompanhe seus contatos do primeiro contato ao pós-atendimento."
        action={<NewContactHeaderAction />}
      />
      <PipelineClient initialColumns={columns} />
    </div>
  );
}
