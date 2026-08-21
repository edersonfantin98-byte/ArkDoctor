"use client";

import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarX, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDashboardMetricsAction } from "@/app/(app)/financeiro/actions";
import type { DashboardMetrics } from "@/modules/finance/types";

type Preset = "week" | "month" | "custom";

function rangeForPreset(preset: Preset): { from: string; to: string } {
  const now = new Date();
  if (preset === "week") {
    const day = now.getUTCDay();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 6));
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

export function FinanceDashboardClient({ initialMetrics }: { initialMetrics: DashboardMetrics }) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [preset, setPreset] = useState<Preset>("month");

  async function applyPreset(next: Preset) {
    setPreset(next);
    const range = rangeForPreset(next);
    try {
      setMetrics(await getDashboardMetricsAction(range));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Erro ao carregar o dashboard");
    }
  }

  async function applyCustomRange(from: string, to: string) {
    setPreset("custom");
    try {
      setMetrics(await getDashboardMetricsAction({ from, to }));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Erro ao carregar o dashboard");
    }
  }

  const chartData = [
    { name: "Receita", value: metrics.revenueTotal, fill: "#16a34a" },
    { name: "Despesa", value: metrics.expenseTotal, fill: "#dc2626" },
  ];

  return (
    <div className="space-y-4 px-6 pb-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={preset === "week" ? "default" : "outline"} size="sm" onClick={() => applyPreset("week")}>
          Semana
        </Button>
        <Button variant={preset === "month" ? "default" : "outline"} size="sm" onClick={() => applyPreset("month")}>
          Mês
        </Button>
        <input
          type="date"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={metrics.period.from}
          onChange={(e) => applyCustomRange(e.target.value, metrics.period.to)}
        />
        <span className="text-sm text-muted-foreground">até</span>
        <input
          type="date"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={metrics.period.to}
          onChange={(e) => applyCustomRange(metrics.period.from, e.target.value)}
        />
      </div>

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
            <p className="text-3xl font-bold">{formatCurrency(metrics.revenueTotal)}</p>
            {metrics.revenueChangePct === null ? (
              <p className="text-sm text-muted-foreground">Sem dados do período anterior</p>
            ) : (
              <p
                className={`flex items-center gap-1 text-sm font-medium ${
                  metrics.revenueChangePct >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {metrics.revenueChangePct >= 0 ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                {metrics.revenueChangePct >= 0 ? "+" : ""}
                {metrics.revenueChangePct.toFixed(1)}% vs. período anterior
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Despesa</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-red-100 text-red-700">
                <TrendingDown className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(metrics.expenseTotal)}</p>
            <p className="text-sm text-muted-foreground">Saldo: {formatCurrency(metrics.balance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Ticket médio</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Receipt className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {metrics.averageTicket === null ? "—" : formatCurrency(metrics.averageTicket)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Taxa de cancelamento</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <CalendarX className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-muted-foreground">—</p>
            <p className="text-sm text-muted-foreground">Disponível quando a Agenda estiver conectada</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receita x Despesa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="value">
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Procedimentos mais vendidos</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {metrics.topProcedures.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">Nenhuma receita vinculada a procedimento neste período.</p>
          )}
          {metrics.topProcedures.map((row) => (
            <div key={row.procedureId} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{row.procedureName}</p>
                <p className="text-sm text-muted-foreground">{row.count} atendimento(s)</p>
              </div>
              <p className="font-semibold">{formatCurrency(row.totalAmount)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
