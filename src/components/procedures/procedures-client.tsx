"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardContent className="space-y-2 p-4">
          {procedures.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum procedimento cadastrado.</p>
          )}
          {procedures.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <Input
                defaultValue={p.name}
                onBlur={(e) => {
                  if (e.target.value !== p.name) {
                    updateProcedureAction(p.id, { name: e.target.value }).then(upsertLocal);
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
                    updateProcedureAction(p.id, { defaultPrice: value }).then(upsertLocal);
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
                    updateProcedureAction(p.id, { defaultDurationMinutes: value }).then(upsertLocal);
                  }
                }}
              />
              <Button size="sm" variant="destructive" onClick={() => handleDelete(p.id)}>
                Remover
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
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
    </div>
  );
}
