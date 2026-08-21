import { describe, it, expect } from "vitest";
import { createInMemorySchedulingRepository } from "./repository.memory";

describe("createInMemorySchedulingRepository", () => {
  it("inserts and retrieves a procedure scoped to its account", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await repo.insertProcedure("acc-1", {
      name: "Limpeza de pele",
      defaultPrice: 150,
      defaultDurationMinutes: 40,
    });

    expect(procedure.name).toBe("Limpeza de pele");
    const found = await repo.getProcedure("acc-1", procedure.id);
    expect(found?.id).toBe(procedure.id);

    const foundOtherAccount = await repo.getProcedure("acc-2", procedure.id);
    expect(foundOtherAccount).toBeNull();
  });

  it("finds overlapping appointments and excludes a given id", async () => {
    const repo = createInMemorySchedulingRepository();
    const procedure = await repo.insertProcedure("acc-1", {
      name: "Consulta",
      defaultPrice: 100,
      defaultDurationMinutes: 30,
    });
    const appointment = await repo.insertAppointment("acc-1", {
      contactId: "contact-1",
      procedureId: procedure.id,
      dealId: null,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      notes: null,
    });

    const overlapping = await repo.listAppointmentsOverlapping(
      "acc-1",
      "2026-09-01T10:15:00.000Z",
      "2026-09-01T10:45:00.000Z",
    );
    expect(overlapping).toHaveLength(1);

    const excludingSelf = await repo.listAppointmentsOverlapping(
      "acc-1",
      "2026-09-01T10:15:00.000Z",
      "2026-09-01T10:45:00.000Z",
      appointment.id,
    );
    expect(excludingSelf).toHaveLength(0);
  });
});
