"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Meter } from "@/components/ui/meter";
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
    <div className="mx-6 mb-6 flex max-w-xl flex-col gap-5">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Identidade profissional</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-4">
          <p className="text-xs text-muted-foreground">
            Aparece no cabeçalho e no rodapé do relatório clínico e dos termos de consentimento.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="professionalName">Nome da profissional</Label>
            <Input
              id="professionalName"
              value={professionalName}
              onChange={(e) => setProfessionalName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="councilId">Registro no conselho</Label>
            <Input
              id="councilId"
              value={councilId}
              onChange={(e) => setCouncilId(e.target.value)}
              placeholder="COREN-SP 123456"
            />
            <p className="text-xs text-muted-foreground">
              Ex.: COREN-SP 123456. Deixe em branco se ainda não tiver.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            {message && (
              <span className="flex items-center gap-1.5 text-xs text-pos">
                <Check className="size-3.5" /> {message}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Armazenamento de fotos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {usedMb.toFixed(usedMb < 10 ? 1 : 0)} MB
            </span>
            <span className="text-sm text-muted-foreground">de 1 GB</span>
          </div>
          <Meter value={initial.storageBytes} max={GB} tone={nearLimit ? "danger" : "primary"} />
          <p className="text-xs text-muted-foreground">
            Fotos de evolução dos tratamentos. Ao chegar a 1 GB, o envio de novas fotos é bloqueado
            até você liberar espaço.
          </p>
        </CardContent>
      </Card>

      {/* TODO card Conta: precisa de e-mail/plano nas props (getClinicSettingsAction hoje
          retorna só professionalName/councilId/storageBytes) */}
    </div>
  );
}
