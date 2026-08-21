"use client";

import { useState } from "react";
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDashboardMetricsAction } from "@/app/(app)/financeiro/actions";
import type { DashboardMetrics } from "@/modules/finance/types";
import { formatCurrency } from "@/lib/format";

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
            <CardTitle className="text-sm text-muted-foreground">Saldo</CardTitle>
            <CardAction>
              <div className="flex size-8 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                <Wallet className="size-4" />
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(metrics.balance)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receita vs. despesas</CardTitle>
          <p className="text-sm text-muted-foreground">Comparativo mensal</p>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.revenueExpenseHistory}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend
                  formatter={(value) => (value === "revenue" ? "Entradas" : "Saídas")}
                  iconType="circle"
                />
                <Bar dataKey="revenue" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#f87171" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Por categoria</CardTitle>
          <p className="text-sm text-muted-foreground">Despesas do período</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {metrics.expenseByCategory.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma despesa neste período.</p>
          )}
          {metrics.expenseByCategory.length > 0 &&
            (() => {
              const max = Math.max(...metrics.expenseByCategory.map((c) => c.total));
              return metrics.expenseByCategory.map((c) => (
                <div key={c.category} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-sm text-muted-foreground">{c.category}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-red-400"
                      style={{ width: `${(c.total / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {formatCurrency(c.total)}
                  </span>
                </div>
              ));
            })()}
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
