"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { submitPublicConsentAction } from "@/app/assinar/actions";
import type { Block } from "@/modules/consents/templates";

const ConsentSignForm = dynamic(
  () => import("./consent-sign-form").then((m) => m.ConsentSignForm),
  { ssr: false },
);

export function PublicConsentForm(props: {
  token: string;
  documentTitle: string;
  blocks: Block[];
  defaultSignerName: string;
  tipoFerida: string;
}) {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="rounded-md bg-green-50 p-4 text-sm text-green-800">
        Assinatura registrada. Você já pode devolver o aparelho à profissional.
      </p>
    );
  }

  return (
    <ConsentSignForm
      kind="tcle"
      documentTitle={props.documentTitle}
      blocks={props.blocks}
      defaultSignerName={props.defaultSignerName}
      submitLabel="Confirmar assinatura"
      lockedTipoFerida={props.tipoFerida}
      onComplete={async ({ pdfBytes, signerName, docFields }) => {
        const fd = new FormData();
        fd.set("file", new Blob([pdfBytes as BlobPart], { type: "application/pdf" }), "consent.pdf");
        fd.set("signerName", signerName);
        fd.set("docFields", JSON.stringify(docFields));
        return submitPublicConsentAction(props.token, fd);
      }}
      onDone={() => setDone(true)}
    />
  );
}
