import { listPipelineAction } from "./actions";
import { PipelineClient } from "@/components/pipeline/pipeline-client";

export default async function PipelinePage() {
  const columns = await listPipelineAction();

  return (
    <main>
      <h1 className="p-4 text-2xl font-bold">Pipeline</h1>
      <PipelineClient initialColumns={columns} />
    </main>
  );
}
