"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, CheckCircle2, UserX, UserPlus } from "lucide-react";
import type { DashboardOverview } from "@/modules/dashboard/types";
import { formatCurrency } from "@/lib/format";

const statusBadge: Record<string, { label: string; className: string }> = {
  agendado: { label: "Agendado", className: "bg-blue-100 text-blue-700" },
  confirmado: { label: "Confirmado", className: "bg-blue-100 text-blue-700" },
  concluido: { label: "Concluído", className: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado", className: "bg-red-100 text-red-700" },
  nao_compareceu: { label: "Não compareceu", className: "bg-red-100 text-red-700" },
};

function stageBarColor(stage: { stageKind: string; stageName: string }): string {
  if (stage.stageKind === "lost") return "bg-gray-300";
  if (stage.stageKind === "follow_up") return "bg-amber-500";
  const name = stage.stageName.toLowerCase();
  if (name.includes("agend")) return "bg-blue-600";
  if (name.includes("atend") || name.includes("conclu")) return "bg-green-500";
  return "bg-gray-400";
}

function ChangeIndicator({ pct, previousLabel }: { pct: number | null; previousLabel: string }) {
  if (pct === null) {
    return <p className="text-sm text-muted-foreground">Sem dados do período anterior</p>;
  }
  const isUp = pct >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <p className={`flex items-center gap-1 text-sm font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>
      <Icon className="size-3.5" />
      {isUp ? "+" : ""}
      {pct.toFixed(1)}% {previousLabel}
    </p>
  );
}

function ChangePointIndicator({ pp, previousLabel }: { pp: number | null; previousLabel: string }) {
  if (pp === null) {
    return <p className="text-sm text-muted-foreground">Sem dados do período anterior</p>;
  }
  const isUp = pp >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <p className={`flex items-center gap-1 text-sm font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>
      <Icon className="size-3.5" />
      {isUp ? "+" : ""}
      {pp.toFixed(1)}pp {previousLabel}
    </p>
  );
}

function ChangeCountIndicator({ count, previousLabel }: { count: number | null; previousLabel: string }) {
  if (count === null) {
    return <p className="text-sm text-muted-foreground">Sem dados do período anterior</p>;
  }
  const isUp = count >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <p className={`flex items-center gap-1 text-sm font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>
      <Icon className="size-3.5" />
      {isUp ? "+" : ""}
      {count} {previousLabel}
    </p>
  );
}

export function DashboardClient({ overview }: { overview: DashboardOverview }) {
  const maxStageCount = Math.max(1, ...overview.pipelineByStage.map((s) => s.count));

  return (
    <div className="space-y-4 px-6 pb-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Receita</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-green-100 text-green-700">
                <TrendingUp className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(overview.revenueTotal)}</p>
            <ChangeIndicator pct={overview.revenueChangePct} previousLabel="vs. mês anterior" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Consultas concluídas</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                <CheckCircle2 className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{overview.appointmentsCompletedCount}</p>
            <ChangeIndicator pct={overview.appointmentsCompletedChangePct} previousLabel="vs. mês anterior" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Não comparecimento</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-red-100 text-red-700">
                <UserX className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {overview.noShowRatePct === null ? "—" : `${overview.noShowRatePct.toFixed(1)}%`}
            </p>
            <ChangePointIndicator pp={overview.noShowRateChangePp} previousLabel="vs. mês anterior" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Novos contatos</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-amber-100 text-amber-700">
                <UserPlus className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{overview.newContactsCount}</p>
            <ChangeCountIndicator count={overview.newContactsChangeCount} previousLabel="vs. mês anterior" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Receita — últimos 6 meses</CardTitle>
            <p className="text-sm text-muted-foreground">Faturamento confirmado por mês</p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overview.revenueHistory}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#revenueFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline por estágio</CardTitle>
            <p className="text-sm text-muted-foreground">Contatos ativos</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.pipelineByStage.map((s) => (
              <div key={s.stageId} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-muted-foreground">{s.stageName}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${stageBarColor(s)}`}
                    style={{ width: `${(s.count / maxStageCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right text-sm font-semibold tabular-nums">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximos atendimentos</CardTitle>
          <p className="text-sm text-muted-foreground">Hoje</p>
        </CardHeader>
        <CardContent className="p-0">
          {overview.todaysAppointments.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum atendimento hoje.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                  <th className="px-4 py-2 font-bold">Paciente</th>
                  <th className="px-4 py-2 font-bold">Procedimento</th>
                  <th className="px-4 py-2 font-bold">Horário</th>
                  <th className="px-4 py-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.todaysAppointments.map((a) => {
                  const badge = statusBadge[a.status] ?? {
                    label: a.status,
                    className: "bg-muted text-muted-foreground",
                  };
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-3 font-medium">{a.contactName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.procedureName}</td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {new Date(a.startsAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={badge.className}>
                          {badge.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
