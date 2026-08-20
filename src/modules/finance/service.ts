import type { FinanceRepository } from "./repository";
import { createProcedureInputSchema, updateProcedureInputSchema } from "./schemas";
import type { Procedure } from "./types";

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
