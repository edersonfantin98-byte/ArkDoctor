import type { DashboardOverview } from "./types";

interface DashboardDeps {
  crm: {
    listPipeline: (
      accountId: string,
    ) => Promise<{ stage: { id: string; name: string }; deals: { id: string }[] }[]>;
    countNewContacts: (accountId: string, sinceIso: string) => Promise<number>;
  };
  scheduling: {
    listAppointments: (
      accountId: string,
      range: { from: string; to: string },
    ) => Promise<
      {
        id: string;
        startsAt: string;
        status: string;
        contact: { name: string };
        procedure: { name: string };
      }[]
    >;
    listProcedures: (accountId: string) => Promise<{ id: string; name: string }[]>;
  };
  finance: {
    getDashboardMetrics: (
      accountId: string,
      rawPeriod: unknown,
      procedures: { id: string; name: string }[],
    ) => Promise<{ revenueTotal: number; revenueChangePct: number | null }>;
  };
}

function monthRange(todayIso: string): { from: string; to: string } {
  const [year, month] = todayIso.split("-").map(Number);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export async function getDashboardOverview(
  deps: DashboardDeps,
  accountId: string,
  todayIso: string,
): Promise<DashboardOverview> {
  const range = monthRange(todayIso);

  const [pipeline, procedures, todaysAppointments] = await Promise.all([
    deps.crm.listPipeline(accountId),
    deps.scheduling.listProcedures(accountId),
    deps.scheduling.listAppointments(accountId, {
      from: `${todayIso}T00:00:00.000Z`,
      to: `${todayIso}T23:59:59.999Z`,
    }),
  ]);

  const financeMetrics = await deps.finance.getDashboardMetrics(accountId, range, procedures);
  const newContactsCount = await deps.crm.countNewContacts(accountId, range.from);

  const pipelineByStage = pipeline.map(({ stage, deals }) => ({
    stageId: stage.id,
    stageName: stage.name,
    count: deals.length,
  }));

  const completed = todaysAppointments.filter((a) => a.status === "concluido");
  const noShow = todaysAppointments.filter((a) => a.status === "nao_compareceu");

  return {
    revenueTotal: financeMetrics.revenueTotal,
    revenueChangePct: financeMetrics.revenueChangePct,
    appointmentsCompletedCount: completed.length,
    appointmentsCompletedChangePct: null,
    noShowRatePct:
      todaysAppointments.length === 0 ? null : (noShow.length / todaysAppointments.length) * 100,
    newContactsCount,
    pipelineByStage,
    todaysAppointments: todaysAppointments.map((a) => ({
      id: a.id,
      contactName: a.contact.name,
      procedureName: a.procedure.name,
      startsAt: a.startsAt,
      status: a.status,
    })),
  };
}
