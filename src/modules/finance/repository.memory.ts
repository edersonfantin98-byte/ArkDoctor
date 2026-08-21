import type { FinanceRepository } from "./repository";
import type { FinancialEntry } from "./types";

export function createInMemoryFinanceRepository(): FinanceRepository {
  const entries = new Map<string, FinancialEntry>();

  return {
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
        appointmentId: input.appointmentId,
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

    async getFinancialEntryByAppointmentId(accountId, appointmentId) {
      return (
        [...entries.values()].find(
          (e) => e.accountId === accountId && e.appointmentId === appointmentId,
        ) ?? null
      );
    },
  };
}
