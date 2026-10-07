"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FileText, Link2, TriangleAlert, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { formatBrDate } from "@/modules/consents/templates";
import type { Block } from "@/modules/consents/templates";
import {
  createConsentLinkAction,
  deleteConsentAction,
  listConsentsAction,
  uploadConsentAction,
} from "@/app/(app)/pacientes/[id]/actions";

const ConsentSignForm = dynamic(
  () => import("./consent-sign-form").then((m) => m.ConsentSignForm),
  { ssr: false },
);

type ConsentRow = Awaited<ReturnType<typeof listConsentsAction>>[number];
type Doc = { title: string; blocks: Block[] };

export function ConsentCards({
  contactId,
  patientName,
  professionalMissing,
  doc,
  initialConsents,
  activeTreatmentWoundTypes,
}: {
  contactId: string;
  patientName: string;
  professionalMissing: boolean;
  doc: Doc;
  initialConsents: ConsentRow[];
  activeTreatmentWoundTypes: string | null;
}) {
  const [consents, setConsents] = useState<ConsentRow[]>(initialConsents);
  const [signing, setSigning] = useState(false);
  const [linkState, setLinkState] = useState<{ url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tipoFeridaPrompt, setTipoFeridaPrompt] = useState<{ value: string } | null>(null);
  const [tipoFeridaError, setTipoFeridaError] = useState<string | null>(null);

  const latest = consents[0]; // listConsentsAction já ordena signed_at desc

  async function refresh() {
    setConsents(await listConsentsAction(contactId));
  }

  async function handleComplete(pdfBytes: Uint8Array, signerName: string, docFields: Record<string, string>) {
    const fd = new FormData();
    fd.set("file", new Blob([pdfBytes as BlobPart], { type: "application/pdf" }), "documentos.pdf");
    fd.set("signerName", signerName);
    fd.set("docFields", JSON.stringify(docFields));
    try {
      await uploadConsentAction(contactId, fd);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : undefined };
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    const prev = consents;
    setConsents((rows) => rows.filter((c) => c.id !== id));
    try {
      await deleteConsentAction(id);
    } catch (err) {
      setConsents(prev);
      setError(err instanceof Error ? err.message : "Erro ao remover documento");
    }
  }

  function handleLink() {
    setError(null);
    setTipoFeridaError(null);
    setTipoFeridaPrompt({ value: activeTreatmentWoundTypes ?? "" });
  }

  async function handleConfirmTipoFeridaLink() {
    if (!tipoFeridaPrompt) return;
    const value = tipoFeridaPrompt.value.trim();
    if (!value) {
      setTipoFeridaError("Informe o tipo de ferida.");
      return;
    }
    try {
      const { url } = await createConsentLinkAction(contactId, value);
      setLinkState({ url });
      setTipoFeridaPrompt(null);
    } catch (err) {
      setTipoFeridaError(err instanceof Error ? err.message : "Erro ao gerar link");
    }
  }

  return (
    <div className="space-y-3">
      {professionalMissing && (
        <div className="flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn-soft px-3.5 py-3 text-sm text-warn">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Seus dados profissionais ainda não estão preenchidos. Complete em{" "}
            <Link href="/configuracoes" className="font-bold underline">
              Configurações
            </Link>{" "}
            para que apareçam no rodapé dos termos.
          </span>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div className="text-sm">
            <p className="font-medium">Documentos do paciente</p>
            <p className="text-xs text-muted-foreground">
              TCLE, Autorização de Imagem e Laserterapia — assinados juntos, numa única vez.
            </p>
            {latest ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Assinado em {formatBrDate(new Date(latest.signedAt))} por {latest.signerName}
              </p>
            ) : (
              <p className="mt-1 text-xs text-warn">Pendente de assinatura</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {latest && (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  onClick={() => window.open(latest.url, "_blank", "noopener")}
                >
                  <FileText className="size-3.5" /> Ver PDF
                </button>
                <RowActionsMenu
                  triggerLabel="Ações do documento"
                  actions={[]}
                  destructive={{
                    label: "Excluir documento",
                    icon: Trash2,
                    confirmText: "Excluir este documento assinado? Esta ação não pode ser desfeita.",
                    confirmLabel: "Excluir",
                    onConfirm: () => handleDelete(latest.id),
                  }}
                />
              </>
            )}
            <Button type="button" size="sm" variant="outline" onClick={handleLink}>
              <Link2 /> Enviar link
            </Button>
            <Button type="button" size="sm" onClick={() => setSigning(true)}>
              {latest ? "Assinar novamente" : "Assinar documentos"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={signing} onOpenChange={setSigning}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{doc.title}</DialogTitle>
          </DialogHeader>
          <ConsentSignForm
            key={signing ? "open" : "closed"}
            kind="tcle"
            documentTitle={doc.title}
            blocks={doc.blocks}
            defaultSignerName={patientName}
            submitLabel="Confirmar assinatura"
            onComplete={({ pdfBytes, signerName, docFields }) =>
              handleComplete(pdfBytes, signerName, docFields)
            }
            onDone={async () => {
              setSigning(false);
              await refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={linkState !== null} onOpenChange={(open) => !open && setLinkState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link para assinatura</DialogTitle>
          </DialogHeader>
          {linkState && (
            <div className="space-y-3">
              <QrCode url={linkState.url} />
              <input
                readOnly
                value={linkState.url}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border px-2 py-1.5 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                O link expira em 48 horas. Mostre o QR ou envie pelo WhatsApp.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={tipoFeridaPrompt !== null}
        onOpenChange={(open) => !open && setTipoFeridaPrompt(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tipo de ferida</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esse dado vai travado no link — o paciente não poderá alterá-lo ao assinar pelo celular.
            </p>
            <label className="block text-sm">
              <span className="text-muted-foreground">Tipo de ferida</span>
              <input
                autoFocus
                value={tipoFeridaPrompt?.value ?? ""}
                onChange={(e) =>
                  setTipoFeridaPrompt((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                }
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            {tipoFeridaError && (
              <p role="alert" className="text-sm text-red-600">{tipoFeridaError}</p>
            )}
            <Button type="button" onClick={handleConfirmTipoFeridaLink}>
              Gerar link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QrCode({ url }: { url: string }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia a tentativa (failed/src) quando a prop url muda
    setFailed(false);
    setSrc("");
    void import("qrcode")
      .then(async (QR) => {
        const dataUrl = await QR.toDataURL(url, { margin: 1, width: 200 });
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (failed) {
    return (
      <p className="mx-auto text-center text-xs text-muted-foreground">
        Não foi possível gerar o QR. Copie o link abaixo.
      </p>
    );
  }
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- data: URL do QR gerado no cliente
    <img
      src={src}
      alt="QR code do link de assinatura"
      className="mx-auto h-[200px] w-[200px]"
    />
  ) : (
    <div className="mx-auto h-[200px] w-[200px] animate-pulse rounded-md bg-muted" />
  );
}
