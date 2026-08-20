import { describe, it, expect } from "vitest";
import { createInMemorySchedulingRepository } from "./repository.memory";
import { checkConflict } from "./service";

describe("checkConflict", () => {
  async function setupProcedure(repo: ReturnType<typeof createInMemorySchedulingRepository>) {
    return repo.insertProcedure("acc-1", {
      name: "Consulta",
      defaultPrice: 100,
      defaultDurationMinutes: 30,
    });
  }

  it("detects overlap with another appointment", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await setupProcedure(repo);
    await repo.insertAppointment("acc-1", {
      contactId: "contact-1",
      procedureId: procedure.id,
      dealId: null,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      notes: null,
    });

    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T10:15:00.000Z",
      endsAt: "2026-09-01T10:45:00.000Z",
    });

    expect(result.hasConflict).toBe(true);
  });

  it("does not conflict with a cancelled appointment", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await setupProcedure(repo);
    const appointment = await repo.insertAppointment("acc-1", {
      contactId: "contact-1",
      procedureId: procedure.id,
      dealId: null,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      notes: null,
    });
    await repo.updateAppointmentStatus("acc-1", appointment.id, "cancelado");

    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T10:15:00.000Z",
      endsAt: "2026-09-01T10:45:00.000Z",
    });

    expect(result.hasConflict).toBe(false);
  });

  it("excludes the given appointment id from its own conflict check", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await setupProcedure(repo);
    const appointment = await repo.insertAppointment("acc-1", {
      contactId: "contact-1",
      procedureId: procedure.id,
      dealId: null,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      notes: null,
    });

    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      excludeAppointmentId: appointment.id,
    });

    expect(result.hasConflict).toBe(false);
  });

  it("detects overlap with a one-off availability block", async () => {
    const repo = createInMemorySchedulingRepository();
    await repo.insertAvailabilityBlock("acc-1", {
      startsAt: "2026-09-01T12:00:00.000Z",
      endsAt: "2026-09-01T13:00:00.000Z",
      reason: "Almoço",
    });

    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T12:30:00.000Z",
      endsAt: "2026-09-01T12:45:00.000Z",
    });

    expect(result.hasConflict).toBe(true);
  });

  it("detects overlap with a recurring rule on the matching weekday", async () => {
    const repo = createInMemorySchedulingRepository();
    // 2026-09-01 is a Tuesday (day 2).
    await repo.insertAvailabilityRule("acc-1", {
      dayOfWeek: 2,
      startTime: "12:00",
      endTime: "13:00",
      reason: "Almoço",
    });

    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T12:30:00.000Z",
      endsAt: "2026-09-01T12:45:00.000Z",
    });

    expect(result.hasConflict).toBe(true);
  });

  it("does not conflict with a recurring rule on a different weekday", async () => {
    const repo = createInMemorySchedulingRepository();
    // Rule is for Wednesday (day 3); the checked slot is Tuesday.
    await repo.insertAvailabilityRule("acc-1", {
      dayOfWeek: 3,
      startTime: "12:00",
      endTime: "13:00",
      reason: "Almoço",
    });

    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T12:30:00.000Z",
      endsAt: "2026-09-01T12:45:00.000Z",
    });

    expect(result.hasConflict).toBe(false);
  });

  it("returns no conflict for a free slot", async () => {
    const repo = createInMemorySchedulingRepository();
    const result = await checkConflict(repo, "acc-1", {
      startsAt: "2026-09-01T09:00:00.000Z",
      endsAt: "2026-09-01T09:30:00.000Z",
    });
    expect(result.hasConflict).toBe(false);
    expect(result.reason).toBeNull();
  });
});

import {
  createProcedure,
  deleteProcedure,
  listProcedures,
  updateProcedure,
} from "./service";

describe("createProcedure", () => {
  it("creates a procedure with the given fields", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Limpeza de pele",
      defaultPrice: 150,
      defaultDurationMinutes: 40,
    });
    expect(procedure.name).toBe("Limpeza de pele");
    expect(procedure.defaultDurationMinutes).toBe(40);
  });

  it("rejects a procedure with an empty name", async () => {
    const repo = createInMemorySchedulingRepository();
    await expect(
      createProcedure(repo, "acc-1", { name: "", defaultPrice: 100, defaultDurationMinutes: 30 }),
    ).rejects.toThrow();
  });
});

describe("updateProcedure and listProcedures", () => {
  it("updates the provided fields and lists all procedures for the account", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 100,
      defaultDurationMinutes: 30,
    });

    const updated = await updateProcedure(repo, "acc-1", procedure.id, { defaultPrice: 120 });
    expect(updated.defaultPrice).toBe(120);
    expect(updated.name).toBe("Consulta");

    const all = await listProcedures(repo, "acc-1");
    expect(all).toHaveLength(1);
  });
});

describe("deleteProcedure", () => {
  it("blocks deletion when an appointment references the procedure", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 100,
      defaultDurationMinutes: 30,
    });
    await repo.insertAppointment("acc-1", {
      contactId: "contact-1",
      procedureId: procedure.id,
      dealId: null,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      notes: null,
    });

    await expect(deleteProcedure(repo, "acc-1", procedure.id)).rejects.toThrow();
  });

  it("allows deletion when no appointment references the procedure", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await createProcedure(repo, "acc-1", {
      name: "Consulta",
      defaultPrice: 100,
      defaultDurationMinutes: 30,
    });

    await expect(deleteProcedure(repo, "acc-1", procedure.id)).resolves.toBeUndefined();
  });
});
