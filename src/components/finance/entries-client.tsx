"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewEntryDialog } from "@/components/finance/new-entry-dialog";
import { EditEntryDialog } from "@/components/finance/edit-entry-dialog";
import { listFinancialEntriesAction } from "@/app/(app)/financeiro/actions";
import type { FinancialEntry } from "@/modules/finance/types";
import type { Procedure } from "@/modules/scheduling/types";
import { formatCurrency } from "@/lib/format";

export function EntriesClient({
  initialEntries,
  procedures,
  range,
}: {
  initialEntries: FinancialEntry[];
  procedures: Procedure[];
  range: { from: string; to: string };
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [selectedEntry, setSelectedEntry] = useState<FinancialEntry | null>(null);

  async function refresh() {
    try {
      setEntries(await listFinancialEntriesAction(range));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Erro ao carregar lançamentos");
    }
  }

  return (
    <div className="space-y-4 px-6 pb-6">
      <div className="flex justify-end">
        <NewEntryDialog procedures={procedures} onCreated={refresh} />
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {entries.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              Nenhum lançamento neste período.
            </p>
          )}
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelectedEntry(entry)}
              className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted"
            >
              <div>
                <p className="font-medium">
                  {entry.category ?? "Sem categoria"}
                  {entry.description ? ` — ${entry.description}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">{entry.occurredAt}</p>
              </div>
              <Badge
                variant={entry.type === "revenue" ? "outline" : "destructive"}
                className={
                  entry.type === "revenue"
                    ? "border-transparent bg-green-100 text-green-700"
                    : ""
                }
              >
                {entry.type === "revenue" ? "+" : "-"} {formatCurrency(entry.amount)}
              </Badge>
            </button>
          ))}
        </CardContent>
      </Card>

      <EditEntryDialog
        entry={selectedEntry}
        open={selectedEntry !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
        onChanged={refresh}
      />
    </div>
  );
}
