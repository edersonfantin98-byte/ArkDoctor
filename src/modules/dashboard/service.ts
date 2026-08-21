import type { DashboardOverview } from "./types";

interface DashboardDeps {
  crm: {
    listPipeline: (
      accountId: string,
    ) => Promise<
      { stage: { id: string; name: string; kind: string }; deals: { id: string }[] }[]
    >;
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
    listEntries: (
      accountId: string,
      range: { from: string; to: string },
    ) => Promise<{ type: string; amount: number; occurredAt: string }[]>;
  };
}

const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

async function revenueHistory(
  deps: DashboardDeps,
  accountId: string,
  todayIso: string,
): Promise<{ month: string; total: number }[]> {
  const [year, month] = todayIso.split("-").map(Number);
  const firstMonth = new Date(Date.UTC(year, month - 6, 1));
  const from = firstMonth.toISOString().slice(0, 10);
  const to = monthRange(todayIso).to;

  const entries = await deps.finance.listEntries(accountId, { from, to });

  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 6 + 1 + i, 1));
    return { key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, month: MONTH_LABELS[d.getUTCMonth()], total: 0 };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const entry of entries) {
    if (entry.type !== "revenue") continue;
    const key = entry.occurredAt.slice(0, 7);
    const bucket = byKey.get(key);
    if (bucket) bucket.total += entry.amount;
  }

  return buckets.map(({ month, total }) => ({ month, total }));
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

  const [pipeline, procedures, todaysAppointments, history] = await Promise.all([
    deps.crm.listPipeline(accountId),
    deps.scheduling.listProcedures(accountId),
    deps.scheduling.listAppointments(accountId, {
      from: `${todayIso}T00:00:00.000Z`,
      to: `${todayIso}T23:59:59.999Z`,
    }),
    revenueHistory(deps, accountId, todayIso),
  ]);

  const financeMetrics = await deps.finance.getDashboardMetrics(accountId, range, procedures);
  const newContactsCount = await deps.crm.countNewContacts(accountId, range.from);

  const pipelineByStage = pipeline.map(({ stage, deals }) => ({
    stageId: stage.id,
    stageName: stage.name,
    stageKind: stage.kind,
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
    revenueHistory: history,
    todaysAppointments: todaysAppointments.map((a) => ({
      id: a.id,
      contactName: a.contact.name,
      procedureName: a.procedure.name,
      startsAt: a.startsAt,
      status: a.status,
    })),
  };
}
