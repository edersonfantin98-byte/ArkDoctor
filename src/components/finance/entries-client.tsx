"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewEntryDialog } from "@/components/finance/new-entry-dialog";
import { listFinancialEntriesAction } from "@/app/(app)/financeiro/actions";
import type { FinancialEntry } from "@/modules/finance/types";
import type { Procedure } from "@/modules/finance/types";

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

  async function refresh() {
    setEntries(await listFinancialEntriesAction(range));
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
            <div key={entry.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">
                  {entry.category ?? "Sem categoria"}
                  {entry.description ? ` — ${entry.description}` : ""}
                </p>
                <p className="text-sm text-muted-foreground">{entry.occurredAt}</p>
              </div>
              <Badge
                variant={entry.type === "revenue" ? "outline" : "destructive"}
                className={entry.type === "revenue" ? "border-green-600 text-green-700" : ""}
              >
                {entry.type === "revenue" ? "+" : "-"} R$ {entry.amount.toFixed(2)}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
