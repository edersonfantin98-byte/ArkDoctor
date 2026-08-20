import type { FinanceRepository } from "./repository";
import {
  createFinancialEntryInputSchema,
  createProcedureInputSchema,
  updateProcedureInputSchema,
} from "./schemas";
import type { FinancialEntry, Procedure } from "./types";

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
