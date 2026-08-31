"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { submitPublicConsentAction } from "@/app/assinar/actions";

const ConsentSignForm = dynamic(
  () => import("./consent-sign-form").then((m) => m.ConsentSignForm),
  { ssr: false },
);

export function PublicConsentForm(props: {
  token: string;
  documentTitle: string;
  headerLines: string[];
  paragraphs: string[];
  defaultSignerName: string;
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
      documentTitle={props.documentTitle}
      headerLines={props.headerLines}
      paragraphs={props.paragraphs}
      defaultSignerName={props.defaultSignerName}
      submitLabel="Confirmar assinatura"
      onComplete={async ({ pdfBytes, signerName }) => {
        const fd = new FormData();
        fd.set("file", new Blob([pdfBytes as BlobPart], { type: "application/pdf" }), "consent.pdf");
        fd.set("signerName", signerName);
        return submitPublicConsentAction(props.token, fd);
      }}
      onDone={() => setDone(true)}
    />
  );
}
