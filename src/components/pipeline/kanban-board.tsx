"use client";

import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { moveDealAction } from "@/app/(app)/pipeline/actions";
import type { PipelineStage, DealWithContact } from "@/modules/crm/types";

export interface PipelineColumn {
  stage: PipelineStage;
  deals: DealWithContact[];
}

export function KanbanBoard({
  columns,
  onDealClick,
}: {
  columns: PipelineColumn[];
  onDealClick?: (deal: DealWithContact) => void;
}) {
  const allStages = columns.map((c) => c.stage);

  function handleDragEnd(event: DragEndEvent) {
    const dealId = event.active.id as string;
    const toStageId = event.over?.id as string | undefined;
    if (!toStageId) return;
    moveDealAction(dealId, toStageId);
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto px-6 pb-6">
        {columns.map(({ stage, deals }) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            deals={deals}
            allStages={allStages}
            onDealClick={onDealClick}
          />
        ))}
      </div>
    </DndContext>
  );
}
