import { describe, it, expect } from "vitest";
import { createInMemoryTreatmentsRepository } from "./repository.memory";
import {
  assembleReport,
  concludeTreatment,
  createTreatment,
  formatDurationLabel,
  localDate,
} from "./service";
import type { AssembleReportInput } from "./types";

const validCreate = {
  contactId: "11111111-1111-4111-8111-111111111111",
  woundTypes: "úlcera venosa",
  treatmentType: "ozonioterapia — bagging",
  startedOn: "2026-08-01",
};

describe("createTreatment", () => {
  it("persists all fields and defaults optionals to null", async () => {
    const repo = createInMemoryTreatmentsRepository();
    const t = await createTreatment(repo, "acc-1", validCreate);
    expect(t.woundTypes).toBe("úlcera venosa");
    expect(t.treatmentType).toBe("ozonioterapia — bagging");
    expect(t.woundDetails).toBeNull();
    expect(t.professionalAssessment).toBeNull();
    expect(t.status).toBe("em_andamento");
  });

  it("rejects an empty woundTypes", async () => {
    const repo = createInMemoryTreatmentsRepository();
    await expect(
      createTreatment(repo, "acc-1", { ...validCreate, woundTypes: "   " }),
    ).rejects.toThrow(/tipo de ferida/i);
  });
});

describe("concludeTreatment", () => {
  it("requires a valid outcome and dischargedOn", async () => {
    const repo = createInMemoryTreatmentsRepository();
    const t = await createTreatment(repo, "acc-1", validCreate);
    await expect(
      concludeTreatment(repo, "acc-1", t.id, { dischargedOn: "2026-09-01", outcome: "curou" }),
    ).rejects.toThrow();
  });

  it("sets status to concluido and rejects a second conclusion", async () => {
    const repo = createInMemoryTreatmentsRepository();
    const t = await createTreatment(repo, "acc-1", validCreate);
    const done = await concludeTreatment(repo, "acc-1", t.id, {
      dischargedOn: "2026-09-15",
      outcome: "cicatrizacao",
    });
    expect(done.status).toBe("concluido");
    await expect(
      concludeTreatment(repo, "acc-1", t.id, { dischargedOn: "2026-09-16", outcome: "alta" }),
    ).rejects.toThrow();
  });
});

describe("formatDurationLabel", () => {
  it("formats sub-week spans in days and longer spans in weeks", () => {
    expect(formatDurationLabel("2026-08-01", "2026-08-01")).toBe("0 dias");
    expect(formatDurationLabel("2026-08-01", "2026-08-04")).toBe("3 dias");
    expect(formatDurationLabel("2026-08-01", "2026-08-08")).toBe("1 semana");
    expect(formatDurationLabel("2026-08-01", "2026-09-12")).toBe("6 semanas");
  });
});

describe("localDate", () => {
  it("resolves the date in Cuiabá (UTC-4), not UTC", () => {
    // 01:00 UTC on the 21st is still 21:00 on the 20th in Cuiabá
    expect(localDate("2026-08-21T01:00:00.000Z")).toBe("2026-08-20");
    expect(localDate("2026-08-21T12:00:00.000Z")).toBe("2026-08-21");
  });
});

describe("assembleReport", () => {
  const baseInput = (over: Partial<AssembleReportInput> = {}): AssembleReportInput => ({
    treatment: {
      id: "t1", accountId: "acc-1", contactId: "c1",
      woundTypes: "úlcera venosa", woundDetails: null, treatmentType: "ozonioterapia",
      startedOn: "2026-08-01", status: "concluido", dischargedOn: "2026-09-12",
      outcome: "cicatrizacao", professionalAssessment: "Boa evolução.",
      patientPerception: "Sente menos dor.", createdAt: "", updatedAt: "",
    },
    contact: { name: "Maria", birthDate: "1970-05-02", cpf: null },
    professional: { clinicName: "Clínica X", name: "Silvana", councilId: "COREN-SP 123456" },
    sessionCount: 8,
    sessions: [
      { appointmentId: "a2", date: "2026-08-10T14:00:00.000Z", notes: "curativo" },
      { appointmentId: "a1", date: "2026-08-03T14:00:00.000Z", notes: null },
    ],
    photos: [{ url: "https://signed/x", caption: "Sessão 1", takenOn: "2026-08-03" }],
    now: "2026-10-01T12:00:00.000Z",
    ...over,
  });

  it("passes through counts, sorts sessions by date, and derives duration from dischargedOn", () => {
    const report = assembleReport(baseInput());
    expect(report.sessionCount).toBe(8);
    expect(report.sessions.map((s) => s.appointmentId)).toEqual(["a1", "a2"]);
    expect(report.durationLabel).toBe("6 semanas");
    expect(report.generatedAt).toBe("2026-10-01T12:00:00.000Z");
  });

  it("uses `now` for the duration end when the treatment is still open", () => {
    const input = baseInput();
    input.treatment.status = "em_andamento";
    input.treatment.dischargedOn = null;
    input.treatment.outcome = null;
    input.now = "2026-08-15T00:00:00.000Z";
    const report = assembleReport(input);
    expect(report.durationLabel).toBe("2 semanas");
  });
});
