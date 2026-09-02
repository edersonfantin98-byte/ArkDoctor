"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  applyDocFields,
  applyTcleFields,
  formatBrDateTime,
  PATIENT_DOC_KEYS,
  type Block,
  type TcleFieldValues,
} from "@/modules/consents/templates";
import type { ConsentKind } from "@/modules/consents/schemas";
import { buildConsentPdf } from "./pdf";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

export interface ConsentSignFormProps {
  kind: ConsentKind;
  documentTitle: string;
  blocks: Block[];
  defaultSignerName: string;
  submitLabel: string;
  onComplete: (args: {
    pdfBytes: Uint8Array;
    signerName: string;
    docFields: Record<string, string>;
  }) => Promise<{ ok: boolean; error?: string }>;
  onDone?: () => void;
}

function BlockPreview({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return <p className="mt-2 font-semibold">{block.text}</p>;
    case "paragraph":
      return <p className="whitespace-pre-wrap">{block.text}</p>;
    case "field":
      return (
        <p className="text-muted-foreground">
          {block.label}: {block.value ?? "—"}
        </p>
      );
    case "checkbox":
      return (
        <p className="text-muted-foreground">
          {block.checked ? "☑" : "☐"} {block.label}
        </p>
      );
    case "signature":
      return <p className="text-muted-foreground">— {block.label} —</p>;
  }
}

export function ConsentSignForm(props: ConsentSignFormProps) {
  const isTcle = props.kind === "tcle";

  const [signerName, setSignerName] = useState(props.defaultSignerName);
  const [tipoFerida, setTipoFerida] = useState("");
  const [autoriza, setAutoriza] = useState<"" | "sim" | "nao">("");
  const [comoResponsavel, setComoResponsavel] = useState(false);
  const [responsavelNome, setResponsavelNome] = useState("");
  const [responsavelRg, setResponsavelRg] = useState("");
  const [responsavelTelefone, setResponsavelTelefone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<SignaturePadHandle>(null);

  // Campos de documento do paciente que este termo usa (RG, CPF, endereço,
  // município/UF). Prefill vem do valor já montado no bloco.
  const docFieldDefs = useMemo(
    () =>
      props.blocks.filter(
        (b): b is Extract<Block, { type: "field" }> =>
          b.type === "field" &&
          !!b.key &&
          (PATIENT_DOC_KEYS as readonly string[]).includes(b.key),
      ),
    [props.blocks],
  );
  const [docValues, setDocValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(docFieldDefs.map((b) => [b.key as string, b.value ?? ""])),
  );

  const effectiveSignerName = (comoResponsavel ? responsavelNome : signerName).trim();

  const previewBlocks = useMemo(() => {
    const withDocs = applyDocFields(props.blocks, docValues);
    if (props.kind !== "tcle") return withDocs;
    return applyTcleFields(withDocs, {
      tipoFerida: tipoFerida.trim() || null,
      autoriza: autoriza === "sim",
      responsavelNome: comoResponsavel ? responsavelNome.trim() : null,
      responsavelRg: comoResponsavel ? responsavelRg.trim() : null,
      responsavelTelefone: comoResponsavel ? responsavelTelefone.trim() : null,
    });
  }, [props.kind, props.blocks, docValues, tipoFerida, autoriza, comoResponsavel, responsavelNome, responsavelRg, responsavelTelefone]);

  const docFieldsMissing = docFieldDefs.some((b) => !docValues[b.key as string]?.trim());

  const canSubmit = useMemo(() => {
    if (busy || !effectiveSignerName || docFieldsMissing) return false;
    if (isTcle) {
      if (autoriza === "") return false;
      if (comoResponsavel && (!responsavelNome.trim() || !responsavelRg.trim() || !responsavelTelefone.trim())) return false;
    }
    return true;
  }, [busy, effectiveSignerName, docFieldsMissing, isTcle, autoriza, comoResponsavel, responsavelNome, responsavelRg, responsavelTelefone]);

  async function handleSubmit() {
    if (busy) return;
    if (isTcle && autoriza === "nao") {
      setError("Sem autorização do tratamento, o documento não é registrado.");
      return;
    }
    if (!effectiveSignerName) {
      setError("Informe o nome de quem assina.");
      return;
    }
    if (isTcle && autoriza === "") {
      setError("Escolha se autoriza ou não o tratamento.");
      return;
    }
    if (isTcle && comoResponsavel && (!responsavelNome.trim() || !responsavelRg.trim() || !responsavelTelefone.trim())) {
      setError("Informe nome, RG e telefone do responsável legal.");
      return;
    }
    if (docFieldsMissing) {
      setError("Preencha todos os dados do paciente antes de assinar.");
      return;
    }
    if (padRef.current?.isEmpty() ?? true) {
      setError("Assine no quadro antes de confirmar.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const withDocs = applyDocFields(props.blocks, docValues);
      const finalBlocks = isTcle
        ? applyTcleFields(withDocs, {
            tipoFerida: tipoFerida.trim() || null,
            autoriza: true,
            responsavelNome: comoResponsavel ? responsavelNome.trim() : null,
            responsavelRg: comoResponsavel ? responsavelRg.trim() : null,
            responsavelTelefone: comoResponsavel ? responsavelTelefone.trim() : null,
          } satisfies TcleFieldValues)
        : withDocs;

      const pdfBytes = await buildConsentPdf({
        title: props.documentTitle,
        blocks: finalBlocks,
        signatureDataUrl: padRef.current!.toDataURL(),
        signerName: effectiveSignerName,
        signedAtLabel: formatBrDateTime(new Date()),
      });
      const res = await props.onComplete({
        pdfBytes,
        signerName: effectiveSignerName,
        docFields: Object.fromEntries(
          docFieldDefs.map((b) => [b.key as string, docValues[b.key as string]?.trim() ?? ""]),
        ),
      });
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
        {previewBlocks.map((b, i) => (
          <BlockPreview key={i} block={b} />
        ))}
      </div>

      {docFieldDefs.length > 0 && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm text-muted-foreground">Dados do paciente</p>
          {docFieldDefs.map((b) => {
            const key = b.key as string;
            return (
              <label key={key} className="block text-sm">
                <span className="text-muted-foreground">{b.label}</span>
                <input
                  value={docValues[key] ?? ""}
                  onChange={(e) => setDocValues((v) => ({ ...v, [key]: e.target.value }))}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
            );
          })}
        </div>
      )}

      {isTcle && (
        <div className="space-y-3 rounded-md border p-3">
          <label className="block text-sm">
            <span className="text-muted-foreground">Tipo de ferida</span>
            <input
              value={tipoFerida}
              onChange={(e) => setTipoFerida(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1"
            />
          </label>

          <fieldset className="space-y-1 text-sm">
            <legend className="text-muted-foreground">Sobre o tratamento proposto</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="autoriza"
                checked={autoriza === "sim"}
                onChange={() => setAutoriza("sim")}
              />
              <span>Autorizo o tratamento proposto</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="autoriza"
                checked={autoriza === "nao"}
                onChange={() => setAutoriza("nao")}
              />
              <span>Não autorizo a realização do tratamento proposto</span>
            </label>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={comoResponsavel}
              onChange={(e) => setComoResponsavel(e.target.checked)}
            />
            <span>Assino como responsável legal</span>
          </label>

          {comoResponsavel && (
            <div className="space-y-2">
              <label className="block text-sm">
                <span className="text-muted-foreground">Nome do responsável legal</span>
                <input
                  value={responsavelNome}
                  onChange={(e) => setResponsavelNome(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">RG do responsável legal</span>
                <input
                  value={responsavelRg}
                  onChange={(e) => setResponsavelRg(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Telefone do responsável legal</span>
                <input
                  value={responsavelTelefone}
                  onChange={(e) => setResponsavelTelefone(e.target.value)}
                  className="mt-1 w-full rounded border px-2 py-1"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {!comoResponsavel && (
        <label className="block text-sm">
          <span className="text-muted-foreground">Nome de quem assina</span>
          <input
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1"
          />
        </label>
      )}

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

      <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
        {busy ? "Salvando…" : props.submitLabel}
      </Button>
    </div>
  );
}
