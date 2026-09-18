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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteFinancialEntryAction,
  deleteInstallmentPlanEntriesAction,
  getInstallmentPlanSummaryAction,
  updateFinancialEntryAction,
} from "@/app/(app)/financeiro/actions";
import { formatCurrency } from "@/lib/format";
import type { FinancialEntry, InstallmentPlanSummary } from "@/modules/finance/types";

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

  const [summary, setSummary] = useState<InstallmentPlanSummary | null>(null);
  const planId = entry?.planId ?? null;

  useEffect(() => {
    if (!open || !planId) return;
    getInstallmentPlanSummaryAction(planId).then(setSummary).catch(() => setSummary(null));
  }, [open, planId]);
  const activeSummary = open && summary && summary.planId === planId ? summary : null;

  if (!entry) return null;

  async function handleDeletePlan(scope: "future" | "all") {
    setError(null);
    try {
      await deleteInstallmentPlanEntriesAction(entry!.planId!, scope);
      onOpenChange(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir parcelas");
    }
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    const amountValue = Number(formData.get("amount"));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Valor deve ser maior que zero");
      return;
    }
    if (entry!.type === "expense" && !String(formData.get("category") ?? "").trim()) {
      setError("Categoria é obrigatória para despesas");
      return;
    }
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
        <form key={entry.id} action={handleSubmit} noValidate className="space-y-3">
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
        {activeSummary && (
          <div className="space-y-2 rounded-md border border-border p-3 text-sm">
            <p className="font-medium">Compra parcelada ({activeSummary.count} parcelas)</p>
            <p className="text-muted-foreground">
              Total {formatCurrency(activeSummary.totalAmount)} · já vencido{" "}
              {formatCurrency(activeSummary.elapsedAmount)} ({activeSummary.elapsedCount}) · restante{" "}
              {formatCurrency(activeSummary.remainingAmount)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => handleDeletePlan("future")}>
                Excluir parcelas futuras
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handleDeletePlan("all")}>
                Excluir todas as parcelas
              </Button>
            </div>
          </div>
        )}
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
