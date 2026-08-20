"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createFinancialEntryAction,
  getProcedureDefaultsAction,
} from "@/app/(app)/financeiro/actions";
import type { Procedure } from "@/modules/finance/types";

const today = () => new Date().toISOString().slice(0, 10);

export function NewEntryDialog({
  procedures,
  onCreated,
}: {
  procedures: Procedure[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"revenue" | "expense">("revenue");
  const [procedureId, setProcedureId] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setType("revenue");
    setProcedureId("");
    setAmount("");
    setCategory("");
    setError(null);
  }

  async function handleProcedureChange(id: string) {
    setProcedureId(id);
    if (!id) return;
    const defaults = await getProcedureDefaultsAction(id);
    setAmount(String(defaults.defaultPrice));
    setCategory(defaults.category ?? "");
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      await createFinancialEntryAction({
        type,
        amount: Number(formData.get("amount")),
        category: String(formData.get("category") ?? "") || undefined,
        procedureId: type === "revenue" && procedureId ? procedureId : undefined,
        description: String(formData.get("description") ?? "") || undefined,
        occurredAt: String(formData.get("occurredAt") ?? today()),
      });
      setOpen(false);
      resetForm();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar lançamento");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Novo lançamento</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <Label htmlFor="type">Tipo</Label>
            <select
              id="type"
              value={type}
              onChange={(e) => {
                setType(e.target.value as "revenue" | "expense");
                setProcedureId("");
              }}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="revenue">Receita</option>
              <option value="expense">Despesa</option>
            </select>
          </div>
          {type === "revenue" && (
            <div className="space-y-1">
              <Label htmlFor="procedureId">Procedimento (opcional)</Label>
              <select
                id="procedureId"
                value={procedureId}
                onChange={(e) => handleProcedureChange(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Nenhum</option>
                {procedures
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="amount">Valor (R$)</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="category">Categoria</Label>
            <Input
              id="category"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required={type === "expense"}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="occurredAt">Data</Label>
            <Input id="occurredAt" name="occurredAt" type="date" defaultValue={today()} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" />
          </div>
          <Button type="submit" className="w-full">
            Salvar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
