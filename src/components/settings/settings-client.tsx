"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfessionalIdentityAction } from "@/app/(app)/configuracoes/actions";

const GB = 1024 * 1024 * 1024;

export function SettingsClient({
  initial,
}: {
  initial: {
    professionalName: string | null;
    councilId: string | null;
    storageBytes: number;
  };
}) {
  const [professionalName, setProfessionalName] = useState(initial.professionalName ?? "");
  const [councilId, setCouncilId] = useState(initial.councilId ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usedMb = initial.storageBytes / (1024 * 1024);
  const usedPct = Math.min(100, (initial.storageBytes / GB) * 100);
  const nearLimit = usedPct >= 80;

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateProfessionalIdentityAction({
        professionalName: professionalName.trim() || null,
        councilId: councilId.trim() || null,
      });
      setMessage("Configurações salvas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-8 px-6 pb-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Identidade profissional</h2>
          <p className="text-sm text-muted-foreground">
            Usada no cabeçalho e no rodapé do relatório clínico.
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-green-700">{message}</p>}
        <div className="space-y-1">
          <Label htmlFor="professionalName">Nome da profissional</Label>
          <Input
            id="professionalName"
            value={professionalName}
            onChange={(e) => setProfessionalName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="councilId">Registro no conselho</Label>
          <Input
            id="councilId"
            value={councilId}
            onChange={(e) => setCouncilId(e.target.value)}
            placeholder="COREN-SP 123456"
          />
        </div>
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Armazenamento de fotos</h2>
        <p className={`text-sm ${nearLimit ? "text-red-600" : "text-muted-foreground"}`}>
          Fotos: {usedMb.toFixed(usedMb < 10 ? 1 : 0)} MB de 1 GB
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full ${nearLimit ? "bg-red-600" : "bg-primary"}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </section>
    </div>
  );
}
