"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardOverview } from "@/modules/dashboard/types";

export function ExportReportButton({ overview }: { overview: DashboardOverview }) {
  function handleExport() {
    const rows = [
      ["Métrica", "Valor"],
      ["Receita", overview.revenueTotal.toFixed(2)],
      ["Consultas concluídas hoje", String(overview.appointmentsCompletedCount)],
      ["Não comparecimento hoje", overview.noShowRatePct?.toFixed(1) ?? "—"],
      ["Novos contatos no mês", String(overview.newContactsCount)],
    ];
    const csv = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-arkdoctor-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button onClick={handleExport}>
      <Plus className="size-4" />
      Exportar relatório
    </Button>
  );
}
