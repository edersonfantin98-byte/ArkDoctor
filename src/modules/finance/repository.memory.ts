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
        planId: null,
        installmentNumber: null,
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

    async updateFinancialEntry(accountId, id, input) {
      const existing = entries.get(id);
      if (!existing || existing.accountId !== accountId) {
        throw new Error("Financial entry not found");
      }
      const updated: FinancialEntry = {
        ...existing,
        amount: input.amount,
        category: input.category,
        description: input.description,
        occurredAt: input.occurredAt,
      };
      entries.set(id, updated);
      return updated;
    },

    async deleteFinancialEntry(accountId, id) {
      const existing = entries.get(id);
      if (!existing || existing.accountId !== accountId) return;
      entries.delete(id);
    },

    async insertInstallmentPurchase(accountId, plan, planEntries) {
      const planId = crypto.randomUUID();
      return planEntries.map((input) => {
        const entry: FinancialEntry = {
          id: crypto.randomUUID(),
          accountId,
          type: "expense",
          amount: input.amount,
          defaultAmount: null,
          category: plan.category,
          procedureId: null,
          appointmentId: null,
          description: input.description,
          occurredAt: input.occurredAt,
          planId,
          installmentNumber: input.installmentNumber,
          createdAt: new Date().toISOString(),
        };
        entries.set(entry.id, entry);
        return entry;
      });
    },

    async listEntriesByPlan(accountId, planId) {
      return [...entries.values()]
        .filter((e) => e.accountId === accountId && e.planId === planId)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },

    async deleteEntriesByPlan(accountId, planId, afterDate) {
      for (const [id, e] of entries) {
        if (e.accountId !== accountId || e.planId !== planId) continue;
        if (afterDate === null || e.occurredAt > afterDate) entries.delete(id);
      }
    },

    async deleteInstallmentPlan() {},
  };
}
