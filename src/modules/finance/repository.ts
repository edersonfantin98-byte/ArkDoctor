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
}
