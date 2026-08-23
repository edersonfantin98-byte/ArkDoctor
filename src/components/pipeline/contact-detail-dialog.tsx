"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteContactAction,
  getContactDetailAction,
  reopenDealAction,
  updateContactAction,
} from "@/app/(app)/pipeline/actions";
import type { Deal, DealStageHistoryEntry, DealWithContact, PipelineStage } from "@/modules/crm/types";

export function ContactDetailDialog({
  deal,
  stages,
  open,
  onOpenChange,
  onChanged,
}: {
  deal: DealWithContact | null;
  stages: PipelineStage[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState(deal?.contact.notes ?? "");
  const [allDeals, setAllDeals] = useState<(Deal & { history: DealStageHistoryEntry[] })[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setNotes(deal?.contact.notes ?? "");
    setConfirmingDelete(false);
    if (deal) {
      getContactDetailAction(deal.contact.id).then(({ deals }) => setAllDeals(deals));
    }
  }, [deal]);

  if (!deal) return null;

  async function handleSaveNotes() {
    await updateContactAction(deal!.contact.id, { notes });
    onChanged();
  }

  async function handleReopen() {
    await reopenDealAction(deal!.contact.id);
    onChanged();
    onOpenChange(false);
  }

  async function handleDelete() {
    await deleteContactAction(deal!.contact.id);
    setConfirmingDelete(false);
    onOpenChange(false);
    onChanged();
  }

  const hasOpenDeal = allDeals.some((d) => d.closedAt === null);

  function stageName(stageId: string) {
    return stages.find((s) => s.id === stageId)?.name ?? stageId;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{deal.contact.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{deal.contact.phone}</p>

        <div className="space-y-1">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          <Button size="sm" onClick={handleSaveNotes}>
            Salvar notas
          </Button>
        </div>

        <div>
          <h3 className="font-semibold">Negociações</h3>
          {allDeals.map((d) => (
            <div key={d.id} className="mt-2 rounded border p-2 text-sm">
              <p>{d.closedAt ? `Encerrada em ${new Date(d.closedAt).toLocaleDateString()}` : "Em andamento"}</p>
              <ul className="ml-4 list-disc">
                {d.history.map((h) => (
                  <li key={h.id}>{new Date(h.movedAt).toLocaleString()} → estágio {stageName(h.toStageId)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {!hasOpenDeal && (
          <Button variant="outline" onClick={handleReopen}>
            Reabrir negociação
          </Button>
        )}

        <DialogFooter>
          {confirmingDelete ? (
            <>
              <span className="mr-auto self-center text-sm text-muted-foreground">
                Excluir este contato e todo o seu histórico?
              </span>
              <Button variant="outline" onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Confirmar exclusão
              </Button>
            </>
          ) : (
            <Button variant="destructive" onClick={() => setConfirmingDelete(true)}>
              Excluir contato
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
