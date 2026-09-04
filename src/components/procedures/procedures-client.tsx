"use client";

import { useState } from "react";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { THead, TH, TBody, TR, TD, RowActionsCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import {
  createProcedureAction,
  deleteProcedureAction,
  updateProcedureAction,
} from "@/app/(app)/agenda/actions";
import type { Procedure } from "@/modules/scheduling/types";

export function ProceduresClient({ initialProcedures }: { initialProcedures: Procedure[] }) {
  const [procedures, setProcedures] = useState(initialProcedures);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function upsertLocal(updated: Procedure) {
    setProcedures((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  async function handleCreate() {
    setError(null);
    try {
      const created = await createProcedureAction({
        name,
        defaultPrice: Number(price),
        defaultDurationMinutes: Number(duration),
      });
      setProcedures((prev) => [...prev, created]);
      setName("");
      setPrice("");
      setDuration("");
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar procedimento");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteProcedureAction(id);
      setProcedures((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover procedimento");
    }
  }

  return (
    <div className="space-y-4 px-6 pb-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <table className="w-full border-collapse text-sm">
          <THead>
            <TR>
              <TH>Procedimento</TH>
              <TH className="w-[150px]">Valor padrão</TH>
              <TH className="w-[130px]">Duração</TH>
              <TH className="w-13" />
            </TR>
          </THead>
          <TBody>
            {procedures.length === 0 && !creating && (
              <TR>
                <TD colSpan={4} className="p-0">
                  <EmptyState icon={ClipboardList} title="Nenhum procedimento cadastrado" />
                </TD>
              </TR>
            )}
            {procedures.map((p) =>
              editingId === p.id ? (
                <TR key={p.id} selected>
                  <TD>
                    <Input
                      defaultValue={p.name}
                      onBlur={(e) => {
                        if (e.target.value !== p.name) {
                          updateProcedureAction(p.id, { name: e.target.value }).then(upsertLocal);
                        }
                      }}
                    />
                  </TD>
                  <TD>
                    <Input
                      inputMode="decimal"
                      className="w-24"
                      defaultValue={p.defaultPrice}
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (value !== p.defaultPrice) {
                          updateProcedureAction(p.id, { defaultPrice: value }).then(upsertLocal);
                        }
                      }}
                    />
                  </TD>
                  <TD>
                    <Input
                      inputMode="numeric"
                      className="w-20"
                      defaultValue={p.defaultDurationMinutes}
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (value !== p.defaultDurationMinutes) {
                          updateProcedureAction(p.id, { defaultDurationMinutes: value }).then(
                            upsertLocal,
                          );
                        }
                      }}
                    />
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" onClick={() => setEditingId(null)}>
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </TD>
                </TR>
              ) : (
                <TR key={p.id}>
                  <TD>{p.name}</TD>
                  <TD className="tabular-nums">{formatCurrency(p.defaultPrice)}</TD>
                  <TD className="tabular-nums">{p.defaultDurationMinutes} min</TD>
                  <RowActionsCell>
                    <RowActionsMenu
                      actions={[{ label: "Editar", icon: Pencil, onSelect: () => setEditingId(p.id) }]}
                      destructive={{
                        label: "Excluir",
                        icon: Trash2,
                        confirmText: `Excluir "${p.name}"?`,
                        confirmLabel: "Excluir",
                        onConfirm: () => handleDelete(p.id),
                      }}
                    />
                  </RowActionsCell>
                </TR>
              ),
            )}
            {creating && (
              <TR selected>
                <TD>
                  <Input
                    placeholder="Nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </TD>
                <TD>
                  <Input
                    placeholder="Valor"
                    inputMode="decimal"
                    className="w-24"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </TD>
                <TD>
                  <Input
                    placeholder="Min."
                    inputMode="numeric"
                    className="w-20"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" onClick={handleCreate}>
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                      Cancelar
                    </Button>
                  </div>
                </TD>
              </TR>
            )}
          </TBody>
        </table>

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full items-center gap-2 border-t border-border px-3.5 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <Plus className="size-4" /> Adicionar procedimento
        </button>
      </div>
    </div>
  );
}
