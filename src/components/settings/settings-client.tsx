"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfessionalIdentityAction } from "@/app/(app)/configuracoes/actions";

export function SettingsClient({
  initial,
}: {
  initial: {
    professionalName: string | null;
    councilId: string | null;
  };
}) {
  const [professionalName, setProfessionalName] = useState(initial.professionalName ?? "");
  const [councilId, setCouncilId] = useState(initial.councilId ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      {/* TODO card Conta: precisa de e-mail/plano nas props (getClinicSettingsAction hoje
          retorna só professionalName/councilId) */}
    </div>
  );
}
