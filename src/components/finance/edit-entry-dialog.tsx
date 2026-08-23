"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteFinancialEntryAction,
  updateFinancialEntryAction,
} from "@/app/(app)/financeiro/actions";
import type { FinancialEntry } from "@/modules/finance/types";

export function EditEntryDialog({
  entry,
  open,
  onOpenChange,
  onChanged,
}: {
  entry: FinancialEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!entry) return null;

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      await updateFinancialEntryAction(entry!.id, {
        amount: Number(formData.get("amount")),
        category: String(formData.get("category") ?? "") || undefined,
        description: String(formData.get("description") ?? "") || undefined,
        occurredAt: String(formData.get("occurredAt")),
      });
      onOpenChange(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar lançamento");
    }
  }

  async function handleDelete() {
    setError(null);
    try {
      await deleteFinancialEntryAction(entry!.id);
      setConfirmingDelete(false);
      onOpenChange(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir lançamento");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirmingDelete(false);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry.type === "revenue" ? "Editar receita" : "Editar despesa"}</DialogTitle>
        </DialogHeader>
        <form key={entry.id} action={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={entry.amount}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="category">Categoria</Label>
            <Input
              id="category"
              name="category"
              defaultValue={entry.category ?? ""}
              required={entry.type === "expense"}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="occurredAt">Data</Label>
            <Input
              id="occurredAt"
              name="occurredAt"
              type="date"
              defaultValue={entry.occurredAt}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" defaultValue={entry.description ?? ""} />
          </div>
          <Button type="submit" className="w-full">
            Salvar
          </Button>
        </form>
        <DialogFooter>
          {confirmingDelete ? (
            <>
              <span className="mr-auto self-center text-sm text-muted-foreground">
                Excluir este lançamento?
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
              Excluir lançamento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
