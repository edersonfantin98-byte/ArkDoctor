"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBrDate } from "@/modules/consents/templates";
import type { Block } from "@/modules/consents/templates";
import type { ConsentKind } from "@/modules/consents/schemas";
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
type Doc = { kind: ConsentKind; title: string; blocks: Block[] };

export function ConsentCards({
  contactId,
  patientName,
  professionalMissing,
  docs,
  initialConsents,
}: {
  contactId: string;
  patientName: string;
  professionalMissing: boolean;
  docs: Doc[];
  initialConsents: ConsentRow[];
}) {
  const [consents, setConsents] = useState<ConsentRow[]>(initialConsents);
  const [signing, setSigning] = useState<Doc | null>(null);
  const [linkState, setLinkState] = useState<{ doc: Doc; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  async function refresh() {
    setConsents(await listConsentsAction(contactId));
  }

  function latestFor(kind: ConsentKind): ConsentRow | undefined {
    return consents.find((c) => c.kind === kind); // lista já vem signed_at desc
  }

  async function handleComplete(kind: ConsentKind, pdfBytes: Uint8Array, signerName: string) {
    const fd = new FormData();
    fd.set("file", new Blob([pdfBytes as BlobPart], { type: "application/pdf" }), "consent.pdf");
    fd.set("signerName", signerName);
    try {
      await uploadConsentAction(contactId, kind, fd);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : undefined };
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setConfirmingDeleteId(null);
    const prev = consents;
    setConsents((rows) => rows.filter((c) => c.id !== id));
    try {
      await deleteConsentAction(id);
    } catch (err) {
      setConsents(prev);
      setError(err instanceof Error ? err.message : "Erro ao remover documento");
    }
  }

  async function handleLink(doc: Doc) {
    setError(null);
    try {
      const { url } = await createConsentLinkAction(contactId, doc.kind);
      setLinkState({ doc, url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar link");
    }
  }

  return (
    <div className="space-y-3">
      {professionalMissing && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Preencha seus dados profissionais em{" "}
          <Link href="/configuracoes" className="underline">
            Configurações
          </Link>{" "}
          para que apareçam no documento.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y rounded-lg border">
        {docs.map((doc) => {
          const latest = latestFor(doc.kind);
          return (
            <li key={doc.kind} className="flex items-center justify-between gap-3 p-3">
              <div className="text-sm">
                <p className="font-medium">{doc.title}</p>
                {latest ? (
                  <p className="text-muted-foreground">
                    Assinado em {formatBrDate(new Date(latest.signedAt))} por {latest.signerName}
                  </p>
                ) : (
                  <p className="text-muted-foreground">Pendente</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {latest && (
                  <>
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => window.open(latest.url, "_blank", "noopener")}
                    >
                      Ver PDF
                    </button>
                    {confirmingDeleteId === latest.id ? (
                      <span className="flex gap-2">
                        <button
                          type="button"
                          className="text-sm text-red-600 hover:underline"
                          onClick={() => handleDelete(latest.id)}
                        >
                          confirmar
                        </button>
                        <button
                          type="button"
                          className="text-sm text-muted-foreground hover:underline"
                          onClick={() => setConfirmingDeleteId(null)}
                        >
                          cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-sm text-red-600 hover:underline"
                        onClick={() => setConfirmingDeleteId(latest.id)}
                      >
                        Excluir
                      </button>
                    )}
                  </>
                )}
                <Button type="button" size="sm" variant="outline" onClick={() => handleLink(doc)}>
                  Enviar link
                </Button>
                <Button type="button" size="sm" onClick={() => setSigning(doc)}>
                  {latest ? "Assinar novamente" : "Assinar"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={signing !== null} onOpenChange={(open) => !open && setSigning(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{signing?.title}</DialogTitle>
          </DialogHeader>
          {signing && (
            <ConsentSignForm
              kind={signing.kind}
              documentTitle={signing.title}
              blocks={signing.blocks}
              defaultSignerName={patientName}
              submitLabel="Confirmar assinatura"
              onComplete={({ pdfBytes, signerName }) =>
                handleComplete(signing.kind, pdfBytes, signerName)
              }
              onDone={async () => {
                setSigning(null);
                await refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={linkState !== null} onOpenChange={(open) => !open && setLinkState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {linkState ? `Link para ${linkState.doc.title}` : ""}
            </DialogTitle>
          </DialogHeader>
          {linkState && (
            <div className="space-y-3">
              <QrCode url={linkState.url} />
              <input
                readOnly
                value={linkState.url}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded border px-2 py-1 text-xs"
              />
              <p className="text-xs text-muted-foreground">
                O link expira em 48 horas. Mostre o QR ou envie pelo WhatsApp.
              </p>
            </div>
          )}
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
    <div className="mx-auto h-[200px] w-[200px] animate-pulse rounded bg-muted" />
  );
}
