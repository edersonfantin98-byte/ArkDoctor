import type { ProcedureSalesSummary } from "@/modules/finance/types";

export type DashboardPeriodSelection =
  | { kind: "month" }
  | { kind: "week" }
  | { kind: "custom"; from: string; to: string };

export interface DashboardOverview {
  revenueTotal: number;
  revenueChangePct: number | null;
  expenseTotal: number;
  balance: number;
  revenueExpenseHistory: { month: string; revenue: number; expense: number }[];
  topProcedures: ProcedureSalesSummary[];
  appointmentsCompletedCount: number;
  appointmentsCompletedChangePct: number | null;
  noShowRatePct: number | null;
  noShowRateChangePp: number | null;
  newContactsCount: number;
  newContactsChangeCount: number | null;
  pipelineByStage: { stageId: string; stageName: string; stageKind: string; count: number }[];
  revenueHistory: { month: string; total: number }[];
  todaysAppointments: {
    id: string;
    contactName: string;
    procedureName: string;
    startsAt: string;
    status: string;
  }[];
}
