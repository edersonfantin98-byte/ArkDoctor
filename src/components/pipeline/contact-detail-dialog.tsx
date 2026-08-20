"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getContactDetailAction,
  reopenDealAction,
  updateContactAction,
} from "@/app/pipeline/actions";
import type { Deal, DealStageHistoryEntry, DealWithContact } from "@/modules/crm/types";

export function ContactDetailDialog({
  deal,
  open,
  onOpenChange,
  onChanged,
}: {
  deal: DealWithContact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState(deal?.contact.notes ?? "");
  const [allDeals, setAllDeals] = useState<(Deal & { history: DealStageHistoryEntry[] })[]>([]);

  useEffect(() => {
    setNotes(deal?.contact.notes ?? "");
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

  const hasOpenDeal = allDeals.some((d) => d.closedAt === null);

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
                  <li key={h.id}>{new Date(h.movedAt).toLocaleString()} → estágio {h.toStageId}</li>
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
      </DialogContent>
    </Dialog>
  );
}
