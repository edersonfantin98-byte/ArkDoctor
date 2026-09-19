"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  mergePatientAction,
  searchPatientsAction,
  updatePatientAction,
} from "@/app/(app)/pacientes/actions";
import type { Contact } from "@/modules/crm/types";

type Mode = "idle" | "confirm" | "link";

/**
 * Faixa para conferir um contato criado pelo link público de agendamento:
 * confirmar o cadastro (corrigindo o nome, se preciso) ou vincular a um
 * paciente que já existe (junta os dois).
 */
export function ReviewContactBanner({
  contactId,
  contactName,
  onConfirmed,
  onMerged,
}: {
  contactId: string;
  contactName: string;
  onConfirmed: (contact: Contact) => void;
  onMerged: (targetId: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [name, setName] = useState(contactName);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [target, setTarget] = useState<Contact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(task: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível concluir. Tente novamente.");
      }
    });
  }

  async function handleSearch(value: string) {
    setQuery(value);
    setTarget(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    const found = await searchPatientsAction(value);
    setResults(found.filter((c) => c.id !== contactId));
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p>
        <strong>Agendado pelo link.</strong> Confira se {contactName} já é paciente antes de seguir.
      </p>

      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setMode("confirm")}>
            Confirmar cadastro
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("link")}>
            Vincular a paciente existente
          </Button>
        </div>
      )}

      {mode === "confirm" && (
        <div className="space-y-2">
          <label className="block text-xs font-medium" htmlFor="review-name">
            Nome do paciente
          </label>
          <Input id="review-name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending || !name.trim()}
              onClick={() =>
                run(async () => {
                  const updated = await updatePatientAction(contactId, { name, needsReview: false });
                  onConfirmed(updated);
                })
              }
            >
              Salvar e confirmar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {mode === "link" && (
        <div className="space-y-2">
          <Input
            placeholder="Buscar paciente por nome ou telefone"
            value={query}
            onChange={(e) => void handleSearch(e.target.value)}
          />
          {results.length > 0 && !target && (
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 bg-background text-foreground">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-muted"
                    onClick={() => setTarget(c)}
                  >
                    {c.name} <span className="text-muted-foreground">· {c.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {target && (
            <p>
              Juntar <strong>{contactName}</strong> em <strong>{target.name}</strong>? O agendamento
              passa a ser dele(a) e este contato duplicado é apagado.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isPending || !target}
              onClick={() =>
                target &&
                run(async () => {
                  await mergePatientAction(contactId, target.id);
                  onMerged(target.id);
                })
              }
            >
              Vincular
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}
