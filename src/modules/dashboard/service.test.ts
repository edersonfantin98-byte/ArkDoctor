import { describe, it, expect, vi } from "vitest";
import { getDashboardOverview } from "./service";

describe("getDashboardOverview", () => {
  it("combines pipeline, scheduling, and finance data for the given day", async () => {
    const deps = {
      crm: {
        listPipeline: vi.fn().mockResolvedValue([
          { stage: { id: "stage-1", name: "Novo" }, deals: [] },
          { stage: { id: "stage-2", name: "Agendado" }, deals: [{ id: "d1" }, { id: "d2" }] },
        ]),
        countNewContacts: vi.fn().mockResolvedValue(3),
      },
      scheduling: {
        listAppointments: vi.fn().mockResolvedValue([
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
        ]),
        listProcedures: vi.fn().mockResolvedValue([{ id: "proc-1", name: "Consulta" }]),
      },
      finance: {
        getDashboardMetrics: vi.fn().mockResolvedValue({
          revenueTotal: 38240,
          revenueChangePct: 12,
        }),
      },
    };

    const overview = await getDashboardOverview(deps as never, "acc-1", "2026-08-20");

    expect(overview.revenueTotal).toBe(38240);
    expect(overview.revenueChangePct).toBe(12);
    expect(overview.pipelineByStage).toEqual([
      { stageId: "stage-1", stageName: "Novo", count: 0 },
      { stageId: "stage-2", stageName: "Agendado", count: 2 },
    ]);
    expect(overview.todaysAppointments).toHaveLength(3);
    expect(overview.todaysAppointments[0].contactName).toBe("Carla Souza");
    expect(overview.appointmentsCompletedCount).toBe(1);
    expect(overview.noShowRatePct).toBeCloseTo(33.333, 2);
    expect(overview.newContactsCount).toBe(3);

    expect(deps.finance.getDashboardMetrics).toHaveBeenCalledWith(
      "acc-1",
      { from: "2026-08-01", to: "2026-08-31" },
      [{ id: "proc-1", name: "Consulta" }],
    );
    expect(deps.crm.countNewContacts).toHaveBeenCalledWith("acc-1", "2026-08-01");
    expect(deps.scheduling.listAppointments).toHaveBeenCalledWith("acc-1", {
      from: "2026-08-20T00:00:00.000Z",
      to: "2026-08-20T23:59:59.999Z",
    });
  });

  it("returns null noShowRatePct when there are no appointments today", async () => {
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
      },
    };

    const overview = await getDashboardOverview(deps as never, "acc-1", "2026-08-20");

    expect(overview.noShowRatePct).toBeNull();
    expect(overview.appointmentsCompletedCount).toBe(0);
  });
});
