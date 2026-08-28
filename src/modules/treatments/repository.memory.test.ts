import { describe, it, expect } from "vitest";
import { createInMemoryTreatmentsRepository } from "./repository.memory";

function baseInput(overrides: Partial<Parameters<
  ReturnType<typeof createInMemoryTreatmentsRepository>["insertTreatment"]
>[1]> = {}) {
  return {
    contactId: "contact-1",
    woundTypes: "úlcera venosa",
    woundDetails: null,
    treatmentType: "ozonioterapia — bagging",
    startedOn: "2026-08-01",
    professionalAssessment: null,
    patientPerception: null,
    ...overrides,
  };
}

describe("createInMemoryTreatmentsRepository", () => {
  it("inserts and reads a treatment scoped to its account", async () => {
    const repo = createInMemoryTreatmentsRepository();
    const t = await repo.insertTreatment("acc-1", baseInput());

    expect(t.status).toBe("em_andamento");
    expect(t.woundTypes).toBe("úlcera venosa");
    expect(await repo.getTreatment("acc-1", t.id)).not.toBeNull();
    expect(await repo.getTreatment("acc-2", t.id)).toBeNull();
  });

  it("lists a contact's treatments newest-started first", async () => {
    const repo = createInMemoryTreatmentsRepository();
    await repo.insertTreatment("acc-1", baseInput({ startedOn: "2026-01-10" }));
    await repo.insertTreatment("acc-1", baseInput({ startedOn: "2026-06-20" }));
    await repo.insertTreatment("acc-1", baseInput({ contactId: "other", startedOn: "2026-09-01" }));

    const list = await repo.listTreatmentsForContact("acc-1", "contact-1");
    expect(list.map((t) => t.startedOn)).toEqual(["2026-06-20", "2026-01-10"]);
  });

  it("concludes a treatment and rejects a second conclusion", async () => {
    const repo = createInMemoryTreatmentsRepository();
    const t = await repo.insertTreatment("acc-1", baseInput());
    const done = await repo.concludeTreatment("acc-1", t.id, {
      dischargedOn: "2026-09-01",
      outcome: "cicatrizacao",
    });
    expect(done.status).toBe("concluido");
    expect(done.dischargedOn).toBe("2026-09-01");
    expect(done.outcome).toBe("cicatrizacao");

    await expect(
      repo.concludeTreatment("acc-1", t.id, { dischargedOn: "2026-09-02", outcome: "alta" }),
    ).rejects.toThrow();
  });

  it("sums photo bytes for the account only", async () => {
    const repo = createInMemoryTreatmentsRepository();
    const t = await repo.insertTreatment("acc-1", baseInput());
    await repo.insertPhoto("acc-1", {
      treatmentId: t.id, storagePath: "acc-1/x/a.jpg", bytes: 100_000, caption: null, takenOn: null,
    });
    await repo.insertPhoto("acc-1", {
      treatmentId: t.id, storagePath: "acc-1/x/b.jpg", bytes: 50_000, caption: null, takenOn: null,
    });
    await repo.insertPhoto("acc-2", {
      treatmentId: "t2", storagePath: "acc-2/y/c.jpg", bytes: 999_999, caption: null, takenOn: null,
    });

    expect(await repo.sumPhotoBytes("acc-1")).toBe(150_000);
  });
});
