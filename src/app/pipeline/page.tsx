import { listPipelineAction } from "./actions";
import { KanbanBoard } from "@/components/pipeline/kanban-board";

export default async function PipelinePage() {
  const columns = await listPipelineAction();

  return (
    <main>
      <h1 className="p-4 text-2xl font-bold">Pipeline</h1>
      <KanbanBoard columns={columns} />
    </main>
  );
}
