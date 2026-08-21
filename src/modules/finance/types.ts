export type FinancialEntryType = "revenue" | "expense";

export interface FinancialEntry {
  id: string;
  accountId: string;
  type: FinancialEntryType;
  amount: number;
  defaultAmount: number | null;
  category: string | null;
  procedureId: string | null;
  appointmentId: string | null;
  description: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface ProcedureSalesSummary {
  procedureId: string;
  procedureName: string;
  totalAmount: number;
  count: number;
}

export type CancellationRateMetric = { available: true; rate: number } | { available: false };

export interface DashboardMetrics {
  period: { from: string; to: string };
  revenueTotal: number;
  expenseTotal: number;
  balance: number;
  revenueChangePct: number | null;
  averageTicket: number | null;
  topProcedures: ProcedureSalesSummary[];
  expenseByCategory: { category: string; total: number }[];
  revenueExpenseHistory: { month: string; revenue: number; expense: number }[];
  cancellationRate: CancellationRateMetric;
}
