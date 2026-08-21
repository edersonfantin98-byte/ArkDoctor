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
      className={`w-64 shrink-0 rounded-lg p-2 transition-colors ${isOver ? "bg-primary/10" : ""}`}
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className="size-2 rounded-full"
          style={{
            backgroundColor:
              stage.kind === "follow_up" ? "#c2790a" : stage.kind === "lost" ? "#9ca3af" : "var(--primary)",
          }}
        />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{stage.name}</h2>
        <span className="text-xs text-muted-foreground">{deals.length}</span>
      </div>
      <div className="space-y-2">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} stages={allStages} onClick={onDealClick} />
        ))}
      </div>
    </div>
  );
}
