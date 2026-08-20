"use client";

import { useMemo, useState } from "react";
import { KanbanBoard, type PipelineColumn } from "./kanban-board";
import { ContactSearch } from "./contact-search";
import type { Contact } from "@/modules/crm/types";

export function PipelineClient({ initialColumns }: { initialColumns: PipelineColumn[] }) {
  const [matchingContactIds, setMatchingContactIds] = useState<Set<string> | null>(null);

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
      <div className="px-4">
        <ContactSearch onResults={handleResults} />
      </div>
      <KanbanBoard columns={filteredColumns} />
    </div>
  );
}
