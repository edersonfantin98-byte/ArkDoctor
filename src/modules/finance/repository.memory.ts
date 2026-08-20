import type { FinanceRepository } from "./repository";
import type { FinancialEntry, Procedure } from "./types";

export function createInMemoryFinanceRepository(): FinanceRepository {
  const procedures = new Map<string, Procedure>();
  const entries = new Map<string, FinancialEntry>();

  return {
    async insertProcedure(accountId, input) {
      const id = crypto.randomUUID();
      const procedure: Procedure = {
        id,
        accountId,
        name: input.name,
        defaultPrice: input.defaultPrice,
        category: input.category ?? null,
        active: true,
        createdAt: new Date().toISOString(),
      };
      procedures.set(id, procedure);
      return procedure;
    },

    async updateProcedure(accountId, procedureId, input) {
      const procedure = procedures.get(procedureId);
      if (!procedure || procedure.accountId !== accountId) throw new Error("Procedure not found");
      const updated: Procedure = {
        ...procedure,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.defaultPrice !== undefined ? { defaultPrice: input.defaultPrice } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      };
      procedures.set(procedureId, updated);
      return updated;
    },

    async getProcedure(accountId, procedureId) {
      const procedure = procedures.get(procedureId);
      return procedure && procedure.accountId === accountId ? procedure : null;
    },

    async listProcedures(accountId, options) {
      return [...procedures.values()]
        .filter((p) => p.accountId === accountId && (!options?.activeOnly || p.active))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async insertFinancialEntry(accountId, input) {
      const id = crypto.randomUUID();
      const entry: FinancialEntry = {
        id,
        accountId,
        type: input.type,
        amount: input.amount,
        defaultAmount: input.defaultAmount,
        category: input.category,
        procedureId: input.procedureId,
        appointmentId: null,
        description: input.description,
        occurredAt: input.occurredAt,
        createdAt: new Date().toISOString(),
      };
      entries.set(id, entry);
      return entry;
    },

    async listFinancialEntries(accountId, range) {
      return [...entries.values()]
        .filter(
          (e) => e.accountId === accountId && e.occurredAt >= range.from && e.occurredAt <= range.to,
        )
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },
  };
}
