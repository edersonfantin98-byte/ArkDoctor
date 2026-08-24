import { describe, it, expect, vi } from "vitest";
import { getDashboardOverview } from "./service";

describe("getDashboardOverview", () => {
  it("combines pipeline, scheduling, and finance data for the given day", async () => {
    const todaysAppointments = [
      {
        id: "a1",
        startsAt: "2026-08-20T13:00:00.000Z",
        status: "confirmado",
        contact: { name: "Carla Souza" },
        procedure: { name: "Consulta de avaliação" },
      },
      {
        id: "a2",
        startsAt: "2026-08-20T15:00:00.000Z",
        status: "concluido",
        contact: { name: "João Lima" },
        procedure: { name: "Limpeza" },
      },
      {
        id: "a3",
        startsAt: "2026-08-20T16:00:00.000Z",
        status: "nao_compareceu",
        contact: { name: "Marta Reis" },
        procedure: { name: "Avaliação" },
      },
    ];

    // Current month: 10 appointments, 6 concluido, 2 nao_compareceu (of 10 => 20%)
    const monthAppointments = Array.from({ length: 10 }, (_, i) => ({
      id: `month-${i}`,
      startsAt: `2026-08-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
      status: i < 6 ? "concluido" : i < 8 ? "nao_compareceu" : "confirmado",
      contact: { name: "X" },
      procedure: { name: "Y" },
    }));

    // Previous month: 8 appointments, 4 concluido, 1 nao_compareceu (of 8 => 12.5%)
    const prevMonthAppointments = Array.from({ length: 8 }, (_, i) => ({
      id: `prev-${i}`,
      startsAt: `2026-07-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
      status: i < 4 ? "concluido" : i < 5 ? "nao_compareceu" : "confirmado",
      contact: { name: "X" },
      procedure: { name: "Y" },
    }));

    const listAppointments = vi.fn().mockImplementation((_accId: string, range: { from: string; to: string }) => {
      if (range.from.startsWith("2026-08-20")) return Promise.resolve(todaysAppointments);
      if (range.from.startsWith("2026-08")) return Promise.resolve(monthAppointments);
      if (range.from.startsWith("2026-07")) return Promise.resolve(prevMonthAppointments);
      return Promise.resolve([]);
    });

    const countNewContacts = vi
      .fn()
      .mockImplementation((_accId: string, sinceIso: string, untilIso?: string) => {
        if (sinceIso.startsWith("2026-08") && untilIso === undefined) return Promise.resolve(47);
        if (sinceIso.startsWith("2026-07") && untilIso?.startsWith("2026-08")) return Promise.resolve(42);
        return Promise.resolve(0);
      });

    const deps = {
      crm: {
        listPipeline: vi.fn().mockResolvedValue([
          { stage: { id: "stage-1", name: "Novo", kind: "normal" }, deals: [] },
          {
            stage: { id: "stage-2", name: "Agendado", kind: "normal" },
            deals: [{ id: "d1" }, { id: "d2" }],
          },
        ]),
        countNewContacts,
      },
      scheduling: {
        listAppointments,
        listProcedures: vi.fn().mockResolvedValue([{ id: "proc-1", name: "Consulta" }]),
      },
      finance: {
        getDashboardMetrics: vi.fn().mockResolvedValue({
          revenueTotal: 38240,
          revenueChangePct: 12,
          expenseTotal: 9100,
          balance: 29140,
          revenueExpenseHistory: [{ month: "Ago", revenue: 38240, expense: 9100 }],
          topProcedures: [
            { procedureId: "proc-1", procedureName: "Limpeza de pele", totalAmount: 5400, count: 12 },
          ],
        }),
        listEntries: vi.fn().mockResolvedValue([]),
      },
    };

    const overview = await getDashboardOverview(deps as never, "acc-1", "2026-08-20");

    expect(overview.revenueTotal).toBe(38240);
    expect(overview.revenueChangePct).toBe(12);
    expect(overview.pipelineByStage).toEqual([
      { stageId: "stage-1", stageName: "Novo", stageKind: "normal", count: 0 },
      { stageId: "stage-2", stageName: "Agendado", stageKind: "normal", count: 2 },
    ]);
    expect(overview.revenueHistory).toHaveLength(6);
    expect(overview.expenseTotal).toBe(9100);
    expect(overview.balance).toBe(29140);
    expect(overview.revenueExpenseHistory).toEqual([{ month: "Ago", revenue: 38240, expense: 9100 }]);
    expect(overview.topProcedures).toEqual([
      { procedureId: "proc-1", procedureName: "Limpeza de pele", totalAmount: 5400, count: 12 },
    ]);

    // Monthly completed count: 6 this month, 4 last month => +50%
    expect(overview.appointmentsCompletedCount).toBe(6);
    expect(overview.appointmentsCompletedChangePct).toBeCloseTo(50, 5);

    // Monthly no-show rate: 20% this month, 12.5% last month => +7.5pp
    expect(overview.noShowRatePct).toBeCloseTo(20, 5);
    expect(overview.noShowRateChangePp).toBeCloseTo(7.5, 5);

    // New contacts: 47 this month, 42 last month => +5 (absolute)
    expect(overview.newContactsCount).toBe(47);
    expect(overview.newContactsChangeCount).toBe(5);

    // Today's table still reflects today's appointments only
    expect(overview.todaysAppointments).toHaveLength(3);
    expect(overview.todaysAppointments[0].contactName).toBe("Carla Souza");
  });

  it("returns null deltas when there is no data for the prior period", async () => {
    const deps = {
      crm: {
        listPipeline: vi.fn().mockResolvedValue([]),
        countNewContacts: vi.fn().mockResolvedValue(0),
      },
      scheduling: {
        listAppointments: vi.fn().mockResolvedValue([]),
        listProcedures: vi.fn().mockResolvedValue([]),
      },
      finance: {
        getDashboardMetrics: vi.fn().mockResolvedValue({ revenueTotal: 0, revenueChangePct: null }),
        listEntries: vi.fn().mockResolvedValue([]),
      },
    };

    const overview = await getDashboardOverview(deps as never, "acc-1", "2026-08-20");

    expect(overview.appointmentsCompletedCount).toBe(0);
    expect(overview.appointmentsCompletedChangePct).toBeNull();
    expect(overview.noShowRatePct).toBeNull();
    expect(overview.noShowRateChangePp).toBeNull();
    expect(overview.newContactsChangeCount).toBe(0);
  });

  it("resolves a week selection to the calendar week (Mon-Sun) containing today, vs. the prior week", async () => {
    // Aug 20, 2026 is a Thursday -> week = Aug 17-23, previous week = Aug 10-16
    const currentWeekAppointments = [
      { id: "cw1", startsAt: "2026-08-18T10:00:00.000Z", status: "concluido", contact: { name: "X" }, procedure: { name: "Y" } },
      { id: "cw2", startsAt: "2026-08-19T10:00:00.000Z", status: "nao_compareceu", contact: { name: "X" }, procedure: { name: "Y" } },
    ];
    const previousWeekAppointments = [
      { id: "pw1", startsAt: "2026-08-11T10:00:00.000Z", status: "concluido", contact: { name: "X" }, procedure: { name: "Y" } },
    ];

    const listAppointments = vi.fn().mockImplementation((_accId: string, range: { from: string; to: string }) => {
      if (range.from.startsWith("2026-08-17")) return Promise.resolve(currentWeekAppointments);
      if (range.from.startsWith("2026-08-10")) return Promise.resolve(previousWeekAppointments);
      return Promise.resolve([]);
    });

    const deps = {
      crm: {
        listPipeline: vi.fn().mockResolvedValue([]),
        countNewContacts: vi.fn().mockResolvedValue(0),
      },
      scheduling: {
        listAppointments,
        listProcedures: vi.fn().mockResolvedValue([]),
      },
      finance: {
        getDashboardMetrics: vi.fn().mockResolvedValue({ revenueTotal: 0, revenueChangePct: null }),
        listEntries: vi.fn().mockResolvedValue([]),
      },
    };

    const overview = await getDashboardOverview(deps as never, "acc-1", "2026-08-20", { kind: "week" });

    expect(overview.appointmentsCompletedCount).toBe(1);
    // 1 completed, 1 previous completed => 0% change
    expect(overview.appointmentsCompletedChangePct).toBeCloseTo(0, 5);
  });

  it("resolves a custom selection to the exact range, vs. an equal-length immediately preceding window", async () => {
    const currentAppointments = Array.from({ length: 4 }, (_, i) => ({
      id: `c${i}`,
      startsAt: `2026-08-0${5 + i}T10:00:00.000Z`,
      status: "concluido",
      contact: { name: "X" },
      procedure: { name: "Y" },
    }));
    const previousAppointments = [
      { id: "p1", startsAt: "2026-07-30T10:00:00.000Z", status: "concluido", contact: { name: "X" }, procedure: { name: "Y" } },
    ];

    const listAppointments = vi.fn().mockImplementation((_accId: string, range: { from: string; to: string }) => {
      if (range.from.startsWith("2026-08-05")) return Promise.resolve(currentAppointments);
      if (range.from.startsWith("2026-07-26")) return Promise.resolve(previousAppointments);
      return Promise.resolve([]);
    });

    const deps = {
      crm: {
        listPipeline: vi.fn().mockResolvedValue([]),
        countNewContacts: vi.fn().mockResolvedValue(0),
      },
      scheduling: {
        listAppointments,
        listProcedures: vi.fn().mockResolvedValue([]),
      },
      finance: {
        getDashboardMetrics: vi.fn().mockResolvedValue({ revenueTotal: 0, revenueChangePct: null }),
        listEntries: vi.fn().mockResolvedValue([]),
      },
    };

    const overview = await getDashboardOverview(deps as never, "acc-1", "2026-08-20", {
      kind: "custom",
      from: "2026-08-05",
      to: "2026-08-14",
    });

    // 4 completed this 10-day window vs. 1 completed in the preceding 10-day window (Jul 26 - Aug 4) => +300%
    expect(overview.appointmentsCompletedCount).toBe(4);
    expect(overview.appointmentsCompletedChangePct).toBeCloseTo(300, 5);
  });
});
