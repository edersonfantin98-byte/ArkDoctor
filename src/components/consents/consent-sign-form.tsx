"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBrDateTime } from "@/modules/consents/templates";
import { buildConsentPdf } from "./pdf";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

export interface ConsentSignFormProps {
  documentTitle: string;
  headerLines: string[];
  paragraphs: string[];
  defaultSignerName: string;
  submitLabel: string;
  onComplete: (args: {
    pdfBytes: Uint8Array;
    signerName: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onDone?: () => void;
}

export function ConsentSignForm(props: ConsentSignFormProps) {
  const [signerName, setSignerName] = useState(props.defaultSignerName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  async function handleSubmit() {
    if (busy) return;
    if (!signerName.trim()) {
      setError("Informe o nome de quem assina.");
      return;
    }
    if (padRef.current?.isEmpty() ?? true) {
      setError("Assine no quadro antes de confirmar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pdfBytes = await buildConsentPdf({
        documentTitle: props.documentTitle,
        headerLines: props.headerLines,
        paragraphs: props.paragraphs,
        signatureDataUrl: padRef.current!.toDataURL(),
        signerName: signerName.trim(),
        signedAtLabel: formatBrDateTime(new Date()),
      });
      const res = await props.onComplete({ pdfBytes, signerName: signerName.trim() });
      if (!res.ok) {
        setError(res.error ?? "Não foi possível salvar. Tente novamente.");
        return;
      }
      props.onDone?.();
    } catch {
      setError("Não foi possível gerar o documento neste aparelho.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3 text-sm">
        {props.paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {p}
          </p>
        ))}
      </div>

      <label className="block text-sm">
        <span className="text-muted-foreground">Nome de quem assina</span>
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          className="mt-1 w-full rounded border px-2 py-1"
        />
      </label>

      <div className="space-y-1">
        <span className="text-sm text-muted-foreground">Assinatura</span>
        <SignaturePad ref={padRef} className="h-40 w-full touch-none rounded-md border bg-white" />
        <button
          type="button"
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => padRef.current?.clear()}
        >
          Limpar
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <Button type="button" disabled={busy} onClick={handleSubmit}>
        {busy ? "Salvando…" : props.submitLabel}
      </Button>
    </div>
  );
}
