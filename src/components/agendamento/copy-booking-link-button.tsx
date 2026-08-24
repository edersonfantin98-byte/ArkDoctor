"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyBookingLinkButton({ accountId }: { accountId: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/agendar/${accountId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="outline" onClick={handleCopy}>
      {copied ? "Link copiado!" : "Copiar link de agendamento"}
    </Button>
  );
}
