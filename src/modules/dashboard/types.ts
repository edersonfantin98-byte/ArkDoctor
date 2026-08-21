export interface DashboardOverview {
  revenueTotal: number;
  revenueChangePct: number | null;
  appointmentsCompletedCount: number;
  appointmentsCompletedChangePct: number | null;
  noShowRatePct: number | null;
  newContactsCount: number;
  pipelineByStage: { stageId: string; stageName: string; count: number }[];
  todaysAppointments: {
    id: string;
    contactName: string;
    procedureName: string;
    startsAt: string;
    status: string;
  }[];
}
