"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KanbanBoard, type PipelineColumn } from "./kanban-board";
import { ContactSearch } from "./contact-search";
import { NewContactDialog } from "./new-contact-dialog";
import { ContactDetailDialog } from "./contact-detail-dialog";
import { StageSettingsDialog } from "./stage-settings-dialog";
import type { Contact, DealWithContact } from "@/modules/crm/types";

export function PipelineClient({ initialColumns }: { initialColumns: PipelineColumn[] }) {
  const router = useRouter();
  const [matchingContactIds, setMatchingContactIds] = useState<Set<string> | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<DealWithContact | null>(null);

  function handleResults(contacts: Contact[] | null) {
    setMatchingContactIds(contacts ? new Set(contacts.map((c) => c.id)) : null);
  }

  const filteredColumns = useMemo(() => {
    if (!matchingContactIds) return initialColumns;
    return initialColumns.map((col) => ({
      ...col,
      deals: col.deals.filter((deal) => matchingContactIds.has(deal.contact.id)),
    }));
  }, [initialColumns, matchingContactIds]);

  return (
    <div>
      <div className="flex items-center justify-between px-4">
        <ContactSearch onResults={handleResults} />
        <div className="flex gap-2">
          <StageSettingsDialog
            stages={initialColumns.map((c) => c.stage)}
            onChanged={() => router.refresh()}
          />
          <NewContactDialog onCreated={() => router.refresh()} />
        </div>
      </div>
      <KanbanBoard columns={filteredColumns} onDealClick={setSelectedDeal} />
      <ContactDetailDialog
        deal={selectedDeal}
        open={selectedDeal !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDeal(null);
        }}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
