"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createProcedureAction,
  deleteProcedureAction,
  listProceduresAction,
  updateProcedureAction,
} from "@/app/(app)/agenda/actions";
import type { Procedure } from "@/modules/scheduling/types";

export function ProcedureDialog({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setProcedures(await listProceduresAction());
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function handleCreate() {
    setError(null);
    await createProcedureAction({
      name,
      defaultPrice: Number(price),
      defaultDurationMinutes: Number(duration),
    });
    setName("");
    setPrice("");
    setDuration("");
    await refresh();
    onChanged();
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteProcedureAction(id);
      await refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover procedimento");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Procedimentos</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Procedimentos</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="space-y-2">
          {procedures.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <Input
                defaultValue={p.name}
                onBlur={(e) => {
                  if (e.target.value !== p.name) {
                    updateProcedureAction(p.id, { name: e.target.value }).then(() => refresh());
                  }
                }}
              />
              <Input
                type="number"
                className="w-24"
                defaultValue={p.defaultPrice}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (value !== p.defaultPrice) {
                    updateProcedureAction(p.id, { defaultPrice: value }).then(() => refresh());
                  }
                }}
              />
              <Input
                type="number"
                className="w-20"
                defaultValue={p.defaultDurationMinutes}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (value !== p.defaultDurationMinutes) {
                    updateProcedureAction(p.id, { defaultDurationMinutes: value }).then(() => refresh());
                  }
                }}
              />
              <Button size="sm" variant="destructive" onClick={() => handleDelete(p.id)}>
                Remover
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            placeholder="Valor"
            type="number"
            className="w-24"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <Input
            placeholder="Min."
            type="number"
            className="w-20"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
          <Button onClick={handleCreate}>Adicionar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
