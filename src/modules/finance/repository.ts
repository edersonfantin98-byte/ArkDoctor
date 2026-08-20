import type { FinancialEntry, FinancialEntryType, Procedure } from "./types";

export interface FinanceRepository {
  insertProcedure(
    accountId: string,
    input: { name: string; defaultPrice: number; category?: string },
  ): Promise<Procedure>;
  updateProcedure(
    accountId: string,
    procedureId: string,
    input: { name?: string; defaultPrice?: number; category?: string | null; active?: boolean },
  ): Promise<Procedure>;
  getProcedure(accountId: string, procedureId: string): Promise<Procedure | null>;
  listProcedures(accountId: string, options?: { activeOnly?: boolean }): Promise<Procedure[]>;

  insertFinancialEntry(
    accountId: string,
    input: {
      type: FinancialEntryType;
      amount: number;
      defaultAmount: number | null;
      category: string | null;
      procedureId: string | null;
      description: string | null;
      occurredAt: string;
    },
  ): Promise<FinancialEntry>;
  listFinancialEntries(
    accountId: string,
    range: { from: string; to: string },
  ): Promise<FinancialEntry[]>;
}
