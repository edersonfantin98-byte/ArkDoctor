"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MoveDealMenu } from "./move-deal-menu";
import type { DealWithContact, PipelineStage, StageKind } from "@/modules/crm/types";

const stageKindBadge: Record<StageKind, { label: string; className: string }> = {
  normal: { label: "Em andamento", className: "bg-primary/10 text-primary" },
  follow_up: { label: "Follow-up", className: "bg-amber-100 text-amber-700" },
  lost: { label: "Perdido", className: "bg-muted text-muted-foreground" },
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

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

  const stage = stages.find((s) => s.id === deal.stageId);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
    >
      <Card>
        <CardContent className="space-y-2 p-3">
          <div {...listeners} className="flex cursor-grab items-center gap-3">
            <Avatar size="sm">
              <AvatarFallback>{initials(deal.contact.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{deal.contact.name}</p>
              <p className="truncate text-sm text-muted-foreground">{deal.contact.phone}</p>
            </div>
          </div>
          {stage && (
            <Badge variant="outline" className={stageKindBadge[stage.kind].className}>
              {stageKindBadge[stage.kind].label}
            </Badge>
          )}
          <MoveDealMenu dealId={deal.id} currentStageId={deal.stageId} stages={stages} />
          {onClick && (
            <button
              type="button"
              onClick={() => onClick(deal)}
              className="text-sm text-primary underline"
            >
              Ver detalhes
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
