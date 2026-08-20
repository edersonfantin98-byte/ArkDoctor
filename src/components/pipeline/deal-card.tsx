"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { MoveDealMenu } from "./move-deal-menu";
import type { DealWithContact, PipelineStage } from "@/modules/crm/types";

export function DealCard({
  deal,
  stages,
  onClick,
}: {
  deal: DealWithContact;
  stages: PipelineStage[];
  onClick?: (deal: DealWithContact) => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: deal.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
    >
      <Card>
        <CardContent className="p-3">
          <div {...listeners} className="cursor-grab">
            <p className="font-medium">{deal.contact.name}</p>
            <p className="text-sm text-muted-foreground">{deal.contact.phone}</p>
          </div>
          <MoveDealMenu dealId={deal.id} currentStageId={deal.stageId} stages={stages} />
          {onClick && (
            <button
              type="button"
              onClick={() => onClick(deal)}
              className="mt-2 text-sm text-primary underline"
            >
              Ver detalhes
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
