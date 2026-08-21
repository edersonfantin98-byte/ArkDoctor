"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, CheckCircle2, UserX, UserPlus } from "lucide-react";
import type { DashboardOverview } from "@/modules/dashboard/types";

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

const statusBadge: Record<string, { label: string; className: string }> = {
  agendado: { label: "Agendado", className: "bg-blue-100 text-blue-700" },
  confirmado: { label: "Confirmado", className: "bg-blue-100 text-blue-700" },
  concluido: { label: "Concluído", className: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado", className: "bg-red-100 text-red-700" },
  nao_compareceu: { label: "Não compareceu", className: "bg-red-100 text-red-700" },
};

export function DashboardClient({ overview }: { overview: DashboardOverview }) {
  const maxStageCount = Math.max(1, ...overview.pipelineByStage.map((s) => s.count));

  return (
    <div className="space-y-4 px-6 pb-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-8 items-center justify-center rounded-md bg-green-100 text-green-700">
              <TrendingUp className="size-4" />
            </div>
            <CardTitle className="text-sm text-muted-foreground">Receita</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(overview.revenueTotal)}</p>
            <p className="text-sm text-muted-foreground">
              {overview.revenueChangePct === null
                ? "Sem dados do período anterior"
                : `${overview.revenueChangePct >= 0 ? "+" : ""}${overview.revenueChangePct.toFixed(1)}% vs. mês anterior`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-8 items-center justify-center rounded-md bg-blue-100 text-blue-700">
              <CheckCircle2 className="size-4" />
            </div>
            <CardTitle className="text-sm text-muted-foreground">Consultas concluídas hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{overview.appointmentsCompletedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-8 items-center justify-center rounded-md bg-red-100 text-red-700">
              <UserX className="size-4" />
            </div>
            <CardTitle className="text-sm text-muted-foreground">Não comparecimento hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {overview.noShowRatePct === null ? "—" : `${overview.noShowRatePct.toFixed(1)}%`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-8 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <UserPlus className="size-4" />
            </div>
            <CardTitle className="text-sm text-muted-foreground">Novos contatos no mês</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{overview.newContactsCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline por estágio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.pipelineByStage.map((s) => (
              <div key={s.stageId} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-muted-foreground">{s.stageName}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(s.count / maxStageCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-sm font-semibold tabular-nums">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos atendimentos hoje</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {overview.todaysAppointments.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhum atendimento hoje.</p>
            )}
            {overview.todaysAppointments.map((a) => {
              const badge = statusBadge[a.status] ?? { label: a.status, className: "bg-muted text-muted-foreground" };
              return (
                <div key={a.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="font-medium">{a.contactName}</p>
                    <p className="text-sm text-muted-foreground">{a.procedureName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm tabular-nums">
                      {new Date(a.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <Badge variant="outline" className={badge.className}>
                      {badge.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
