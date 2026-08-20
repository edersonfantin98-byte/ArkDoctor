"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createStageAction,
  deleteStageAction,
  renameStageAction,
  reorderStagesAction,
} from "@/app/pipeline/actions";
import type { PipelineStage } from "@/modules/crm/types";

export function StageSettingsDialog({
  stages,
  onChanged,
}: {
  stages: PipelineStage[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const normalStages = stages.filter((s) => s.kind === "normal");

  async function handleCreate() {
    if (!newStageName.trim()) return;
    await createStageAction(newStageName.trim());
    setNewStageName("");
    onChanged();
  }

  async function handleRename(stageId: string, name: string) {
    await renameStageAction(stageId, name);
    onChanged();
  }

  async function handleDelete(stageId: string) {
    setError(null);
    try {
      await deleteStageAction(stageId);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover estágio");
    }
  }

  async function moveUp(index: number) {
    if (index === 0) return;
    const ids = normalStages.map((s) => s.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    await reorderStagesAction(ids);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Configurar estágios</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estágios do pipeline</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="space-y-2">
          {stages.map((stage, index) => (
            <div key={stage.id} className="flex items-center gap-2">
              <Input
                defaultValue={stage.name}
                onBlur={(e) => {
                  if (e.target.value !== stage.name) handleRename(stage.id, e.target.value);
                }}
              />
              {stage.kind === "normal" && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => moveUp(index)}>
                    ↑
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(stage.id)}>
                    Remover
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Input
            placeholder="Novo estágio"
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
          />
          <Button onClick={handleCreate}>Adicionar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
