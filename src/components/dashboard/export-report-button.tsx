"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportReportButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="size-4" />
      Imprimir relatório
    </Button>
  );
}
