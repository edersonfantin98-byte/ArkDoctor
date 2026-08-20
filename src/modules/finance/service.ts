import type { FinanceRepository } from "./repository";
import {
  createFinancialEntryInputSchema,
  createProcedureInputSchema,
  dashboardPeriodSchema,
  updateProcedureInputSchema,
} from "./schemas";
import type {
  DashboardMetrics,
  FinancialEntry,
  FinancialEntryType,
  Procedure,
  ProcedureSalesSummary,
} from "./types";

export async function createProcedure(
  repo: FinanceRepository,
  accountId: string,
  rawInput: unknown,
): Promise<Procedure> {
  const input = createProcedureInputSchema.parse(rawInput);
  return repo.insertProcedure(accountId, input);
}

export async function updateProcedure(
  repo: FinanceRepository,
  accountId: string,
  procedureId: string,
  rawInput: unknown,
): Promise<Procedure> {
  const input = updateProcedureInputSchema.parse(rawInput);
  return repo.updateProcedure(accountId, procedureId, input);
}

export async function deactivateProcedure(
  repo: FinanceRepository,
  accountId: string,
  procedureId: string,
): Promise<Procedure> {
  return repo.updateProcedure(accountId, procedureId, { active: false });
}

export async function listProcedures(
  repo: FinanceRepository,
  accountId: string,
  options?: { activeOnly?: boolean },
): Promise<Procedure[]> {
  return repo.listProcedures(accountId, options);
}

export async function getProcedureDefaults(
  repo: FinanceRepository,
  accountId: string,
  procedureId: string,
): Promise<{ defaultPrice: number; category: string | null }> {
  const procedure = await repo.getProcedure(accountId, procedureId);
  if (!procedure) throw new Error("Procedure not found");
  return { defaultPrice: procedure.defaultPrice, category: procedure.category };
}

export async function createFinancialEntry(
  repo: FinanceRepository,
  accountId: string,
  rawInput: unknown,
): Promise<FinancialEntry> {
  const input = createFinancialEntryInputSchema.parse(rawInput);

  if (input.type === "expense" && input.procedureId) {
    throw new Error("Despesas não podem ter um procedimento vinculado");
  }

  let defaultAmount: number | null = null;
  let category = input.category ?? null;

  if (input.type === "revenue" && input.procedureId) {
    const procedure = await repo.getProcedure(accountId, input.procedureId);
    if (!procedure) throw new Error("Procedure not found");
    defaultAmount = procedure.defaultPrice;
    if (!category) category = procedure.category;
  }

  if (input.type === "expense" && !category) {
    throw new Error("Despesas exigem uma categoria");
  }

  return repo.insertFinancialEntry(accountId, {
    type: input.type,
    amount: input.amount,
    defaultAmount,
    category,
    procedureId: input.procedureId ?? null,
    description: input.description ?? null,
    occurredAt: input.occurredAt,
  });
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
): Promise<DashboardMetrics> {
  const period = dashboardPeriodSchema.parse(rawPeriod);
  const entries = await repo.listFinancialEntries(accountId, period);
  const prevEntries = await repo.listFinancialEntries(accountId, previousPeriod(period));
  const procedures = await repo.listProcedures(accountId);
  const procedureNames = new Map(procedures.map((p) => [p.id, p.name]));

  const revenueTotal = sumByType(entries, "revenue");
  const expenseTotal = sumByType(entries, "expense");
  const prevRevenueTotal = sumByType(prevEntries, "revenue");

  const revenueEntries = entries.filter((e) => e.type === "revenue");

  return {
    period,
    revenueTotal,
    expenseTotal,
    balance: revenueTotal - expenseTotal,
    revenueChangePct:
      prevRevenueTotal === 0 ? null : ((revenueTotal - prevRevenueTotal) / prevRevenueTotal) * 100,
    averageTicket: revenueEntries.length === 0 ? null : revenueTotal / revenueEntries.length,
    topProcedures: summarizeByProcedure(revenueEntries, procedureNames),
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
