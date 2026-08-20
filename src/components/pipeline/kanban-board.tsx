import { DealCard } from "./deal-card";
import type { PipelineStage, DealWithContact } from "@/modules/crm/types";

export interface PipelineColumn {
  stage: PipelineStage;
  deals: DealWithContact[];
}

export function KanbanBoard({ columns }: { columns: PipelineColumn[] }) {
  return (
    <div className="flex gap-4 overflow-x-auto p-4">
      {columns.map(({ stage, deals }) => (
        <div key={stage.id} className="w-64 shrink-0">
          <h2 className="mb-2 font-semibold">{stage.name}</h2>
          <div className="space-y-2">
            {deals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
