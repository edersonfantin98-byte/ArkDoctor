"use client";

import { useDroppable } from "@dnd-kit/core";
import { DealCard } from "./deal-card";
import type { PipelineStage, DealWithContact } from "@/modules/crm/types";

export function KanbanColumn({
  stage,
  deals,
  allStages,
  onDealClick,
}: {
  stage: PipelineStage;
  deals: DealWithContact[];
  allStages: PipelineStage[];
  onDealClick?: (deal: DealWithContact) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 rounded p-2 ${isOver ? "bg-accent" : ""}`}
    >
      <h2 className="mb-2 font-semibold">{stage.name}</h2>
      <div className="space-y-2">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} stages={allStages} onClick={onDealClick} />
        ))}
      </div>
    </div>
  );
}
