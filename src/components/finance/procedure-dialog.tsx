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
import { createProcedureAction, updateProcedureAction } from "@/app/(app)/financeiro/actions";
import type { Procedure } from "@/modules/finance/types";

export function ProcedureDialog({
  procedure,
  onSaved,
}: {
  procedure?: Procedure;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(procedure);

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      const input = {
        name: String(formData.get("name") ?? ""),
        defaultPrice: Number(formData.get("defaultPrice")),
        category: String(formData.get("category") ?? "") || (isEditing ? null : undefined),
      };
      if (isEditing && procedure) {
        await updateProcedureAction(procedure.id, input);
      } else {
        await createProcedureAction(input);
      }
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar procedimento");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={isEditing ? "outline" : "default"}>
            {isEditing ? "Editar" : "Novo procedimento"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar procedimento" : "Novo procedimento"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-1">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" defaultValue={procedure?.name} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="defaultPrice">Valor padrão (R$)</Label>
            <Input
              id="defaultPrice"
              name="defaultPrice"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={procedure?.defaultPrice}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="category">Categoria</Label>
            <Input id="category" name="category" defaultValue={procedure?.category ?? ""} />
          </div>
          <Button type="submit" className="w-full">
            Salvar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
