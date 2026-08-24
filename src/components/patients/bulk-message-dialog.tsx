"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendBulkMessageAction } from "@/app/(app)/pacientes/actions";

export function BulkMessageDialog({
  open,
  onOpenChange,
  selectedCount,
  contactIds,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  contactIds: string[];
  onSent: () => void;
}) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: string[]; failed: { contactId: string; error: string }[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setMessage("");
      setResult(null);
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSend() {
    setError(null);
    setSending(true);
    try {
      const outcome = await sendBulkMessageAction({ contactIds, message });
      setResult(outcome);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar mensagens");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar mensagem para {selectedCount} paciente(s)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!result && (
            <>
              <Textarea
                placeholder="Escreva a mensagem. Use {{nome}} para inserir o nome do paciente."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending}
              />
              <Button
                type="button"
                className="w-full"
                onClick={handleSend}
                disabled={sending || !message.trim() || contactIds.length === 0}
              >
                {sending ? "Enviando..." : `Enviar para ${selectedCount} paciente(s)`}
              </Button>
            </>
          )}

          {result && (
            <div className="space-y-2 text-sm">
              <p>{result.sent.length} mensagem(ns) enviada(s) com sucesso.</p>
              {result.failed.length > 0 && (
                <div className="text-red-600">
                  <p>{result.failed.length} falha(s):</p>
                  <ul className="list-disc pl-5">
                    {result.failed.map((f) => (
                      <li key={f.contactId}>{f.error}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Button type="button" className="w-full" onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
