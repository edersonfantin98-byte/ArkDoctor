import type { FinanceRepository } from "./repository";
import {
  createFinancialEntryInputSchema,
  dashboardPeriodSchema,
  updateFinancialEntryInputSchema,
} from "./schemas";
import type { DashboardMetrics, FinancialEntry, FinancialEntryType, ProcedureSalesSummary } from "./types";

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function groupExpensesByCategory(entries: FinancialEntry[]): { category: string; total: number }[] {
  const byCategory = new Map<string, number>();
  for (const entry of entries) {
    if (entry.type !== "expense") continue;
    const category = entry.category ?? "Sem categoria";
    byCategory.set(category, (byCategory.get(category) ?? 0) + entry.amount);
  }
  return [...byCategory.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

async function buildRevenueExpenseHistory(
  repo: FinanceRepository,
  accountId: string,
  anchorIso: string,
): Promise<{ month: string; revenue: number; expense: number }[]> {
  const [year, month] = anchorIso.split("-").map(Number);
  const firstMonth = new Date(Date.UTC(year, month - 6, 1));
  const from = firstMonth.toISOString().slice(0, 10);
  const lastDayOfAnchorMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfAnchorMonth).padStart(2, "0")}`;

  const entries = await repo.listFinancialEntries(accountId, { from, to });

  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 6 + i, 1));
    return {
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      month: MONTH_LABELS[d.getUTCMonth()],
      revenue: 0,
      expense: 0,
    };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const entry of entries) {
    const key = entry.occurredAt.slice(0, 7);
    const bucket = byKey.get(key);
    if (!bucket) continue;
    if (entry.type === "revenue") bucket.revenue += entry.amount;
    else bucket.expense += entry.amount;
  }

  return buckets.map(({ month, revenue, expense }) => ({ month, revenue, expense }));
}

export async function createFinancialEntry(
  repo: FinanceRepository,
  accountId: string,
  rawInput: unknown,
  linkedProcedure: { defaultPrice: number } | null,
): Promise<FinancialEntry> {
  const input = createFinancialEntryInputSchema.parse(rawInput);

  if (input.type === "expense" && input.procedureId) {
    throw new Error("Despesas não podem ter um procedimento vinculado");
  }

  if (input.type === "revenue" && input.procedureId && !linkedProcedure) {
    throw new Error("Procedure not found");
  }

  const category = input.category ?? null;
  if (input.type === "expense" && !category) {
    throw new Error("Despesas exigem uma categoria");
  }

  return repo.insertFinancialEntry(accountId, {
    type: input.type,
    amount: input.amount,
    defaultAmount:
      input.type === "revenue" && input.procedureId ? linkedProcedure!.defaultPrice : null,
    category,
    procedureId: input.procedureId ?? null,
    appointmentId: input.appointmentId ?? null,
    description: input.description ?? null,
    occurredAt: input.occurredAt,
  });
}

export async function updateFinancialEntry(
  repo: FinanceRepository,
  accountId: string,
  id: string,
  rawInput: unknown,
): Promise<FinancialEntry> {
  const input = updateFinancialEntryInputSchema.parse(rawInput);
  return repo.updateFinancialEntry(accountId, id, {
    amount: input.amount,
    category: input.category ?? null,
    description: input.description ?? null,
    occurredAt: input.occurredAt,
  });
}

export async function deleteFinancialEntry(
  repo: FinanceRepository,
  accountId: string,
  id: string,
): Promise<void> {
  await repo.deleteFinancialEntry(accountId, id);
}

export async function getFinancialEntryByAppointmentId(
  repo: FinanceRepository,
  accountId: string,
  appointmentId: string,
): Promise<FinancialEntry | null> {
  return repo.getFinancialEntryByAppointmentId(accountId, appointmentId);
}

export async function listFinancialEntries(
  repo: FinanceRepository,
  accountId: string,
  range: { from: string; to: string },
): Promise<FinancialEntry[]> {
  return repo.listFinancialEntries(accountId, range);
}

export async function getDashboardMetrics(
  repo: FinanceRepository,
  accountId: string,
  rawPeriod: unknown,
  procedures: { id: string; name: string }[],
): Promise<DashboardMetrics> {
  const period = dashboardPeriodSchema.parse(rawPeriod);
  const entries = await repo.listFinancialEntries(accountId, period);
  const prevEntries = await repo.listFinancialEntries(accountId, previousPeriod(period));
  const procedureNames = new Map(procedures.map((p) => [p.id, p.name]));

  const revenueTotal = sumByType(entries, "revenue");
  const expenseTotal = sumByType(entries, "expense");
  const prevRevenueTotal = sumByType(prevEntries, "revenue");

  const revenueEntries = entries.filter((e) => e.type === "revenue");

  const expenseByCategory = groupExpensesByCategory(entries);
  const revenueExpenseHistory = await buildRevenueExpenseHistory(repo, accountId, period.to);

  return {
    period,
    revenueTotal,
    expenseTotal,
    balance: revenueTotal - expenseTotal,
    revenueChangePct:
      prevRevenueTotal === 0 ? null : ((revenueTotal - prevRevenueTotal) / prevRevenueTotal) * 100,
    averageTicket: revenueEntries.length === 0 ? null : revenueTotal / revenueEntries.length,
    topProcedures: summarizeByProcedure(revenueEntries, procedureNames),
    expenseByCategory,
    revenueExpenseHistory,
    cancellationRate: { available: false },
  };
}

function previousPeriod(period: { from: string; to: string }): { from: string; to: string } {
  const fromDate = new Date(`${period.from}T00:00:00Z`);
  const toDate = new Date(`${period.to}T00:00:00Z`);
  const durationMs = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

function sumByType(entries: FinancialEntry[], type: FinancialEntryType): number {
  return entries.filter((e) => e.type === type).reduce((sum, e) => sum + e.amount, 0);
}

function summarizeByProcedure(
  revenueEntries: FinancialEntry[],
  procedureNames: Map<string, string>,
): ProcedureSalesSummary[] {
  const byProcedure = new Map<string, { totalAmount: number; count: number }>();
  for (const entry of revenueEntries) {
    if (!entry.procedureId) continue;
    const current = byProcedure.get(entry.procedureId) ?? { totalAmount: 0, count: 0 };
    current.totalAmount += entry.amount;
    current.count += 1;
    byProcedure.set(entry.procedureId, current);
  }
  return [...byProcedure.entries()]
    .map(([procedureId, v]) => ({
      procedureId,
      procedureName: procedureNames.get(procedureId) ?? "Procedimento removido",
      totalAmount: v.totalAmount,
      count: v.count,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}
