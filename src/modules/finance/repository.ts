import type { FinancialEntry, FinancialEntryType } from "./types";

export interface FinanceRepository {
  insertFinancialEntry(
    accountId: string,
    input: {
      type: FinancialEntryType;
      amount: number;
      defaultAmount: number | null;
      category: string | null;
      procedureId: string | null;
      appointmentId: string | null;
      description: string | null;
      occurredAt: string;
    },
  ): Promise<FinancialEntry>;
  listFinancialEntries(
    accountId: string,
    range: { from: string; to: string },
  ): Promise<FinancialEntry[]>;
  getFinancialEntryByAppointmentId(
    accountId: string,
    appointmentId: string,
  ): Promise<FinancialEntry | null>;
  updateFinancialEntry(
    accountId: string,
    id: string,
    input: {
      amount: number;
      category: string | null;
      description: string | null;
      occurredAt: string;
    },
  ): Promise<FinancialEntry>;
  deleteFinancialEntry(accountId: string, id: string): Promise<void>;
  insertInstallmentPurchase(
    accountId: string,
    plan: {
      description: string | null;
      category: string;
      totalAmount: number;
      installments: number;
      firstDueDate: string;
    },
    entries: {
      amount: number;
      description: string;
      occurredAt: string;
      installmentNumber: number;
    }[],
  ): Promise<FinancialEntry[]>;
  listEntriesByPlan(accountId: string, planId: string): Promise<FinancialEntry[]>;
  deleteEntriesByPlan(accountId: string, planId: string, afterDate: string | null): Promise<void>;
  deleteInstallmentPlan(accountId: string, planId: string): Promise<void>;
}
