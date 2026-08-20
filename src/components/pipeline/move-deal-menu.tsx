"use client";

import { moveDealAction } from "@/app/(app)/pipeline/actions";
import type { PipelineStage } from "@/modules/crm/types";

export function MoveDealMenu({
  dealId,
  currentStageId,
  stages,
}: {
  dealId: string;
  currentStageId: string;
  stages: PipelineStage[];
}) {
  return (
    <select
      className="mt-2 w-full rounded border p-1 text-sm"
      value={currentStageId}
      onChange={(e) => moveDealAction(dealId, e.target.value)}
    >
      {stages.map((stage) => (
        <option key={stage.id} value={stage.id}>
          {stage.name}
        </option>
      ))}
    </select>
  );
}
