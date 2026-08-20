"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProcedureDialog } from "@/components/finance/procedure-dialog";
import {
  listProceduresAction,
  deactivateProcedureAction,
} from "@/app/(app)/financeiro/actions";
import type { Procedure } from "@/modules/finance/types";

export function ProceduresClient({ initialProcedures }: { initialProcedures: Procedure[] }) {
  const [procedures, setProcedures] = useState(initialProcedures);

  async function refresh() {
    try {
      setProcedures(await listProceduresAction());
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Erro ao carregar procedimentos");
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await deactivateProcedureAction(id);
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Erro ao desativar procedimento");
    }
  }

  return (
    <div className="space-y-4 px-6 pb-6">
      <div className="flex justify-end">
        <ProcedureDialog onSaved={refresh} />
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {procedures.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              Nenhum procedimento cadastrado ainda.
            </p>
          )}
          {procedures.map((procedure) => (
            <div key={procedure.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{procedure.name}</p>
                <p className="text-sm text-muted-foreground">
                  {procedure.category ?? "Sem categoria"} · R${" "}
                  {procedure.defaultPrice.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!procedure.active && <Badge variant="outline">Inativo</Badge>}
                <ProcedureDialog procedure={procedure} onSaved={refresh} />
                {procedure.active && (
                  <Button variant="destructive" size="sm" onClick={() => handleDeactivate(procedure.id)}>
                    Desativar
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
