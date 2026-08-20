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

import { createInMemoryCrmRepository } from "@/modules/crm/repository.memory";
import { createContact } from "@/modules/crm/service";
import { createAppointment } from "./service";

async function setup() {
  const schedulingRepo = createInMemorySchedulingRepository();
  const crmRepo = createInMemoryCrmRepository();
  const procedure = await schedulingRepo.insertProcedure("acc-1", {
    name: "Consulta",
    defaultPrice: 100,
    defaultDurationMinutes: 30,
  });
  const contact = await createContact(crmRepo, "acc-1", {
    name: "Ana",
    phone: "11999990000",
  });
  return { schedulingRepo, crmRepo, procedure, contact };
}

describe("createAppointment", () => {
  it("uses the procedure's default duration when endsAt is not given", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();

    const appointment = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      {
        contactId: contact.id,
        procedureId: procedure.id,
        startsAt: "2026-09-01T10:00:00.000Z",
      },
    );

    expect(appointment.startsAt).toBe("2026-09-01T10:00:00.000Z");
    expect(appointment.endsAt).toBe("2026-09-01T10:30:00.000Z");
  });

  it("rejects when the requested time conflicts with an existing appointment", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    await schedulingRepo.insertAppointment("acc-1", {
      contactId: contact.id,
      procedureId: procedure.id,
      dealId: null,
      startsAt: "2026-09-01T10:00:00.000Z",
      endsAt: "2026-09-01T10:30:00.000Z",
      notes: null,
    });

    await expect(
      createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, "acc-1", {
        contactId: contact.id,
        procedureId: procedure.id,
        startsAt: "2026-09-01T10:15:00.000Z",
      }),
    ).rejects.toThrow();
  });

  it("moves the contact's open deal to the 'Agendado' stage when it exists", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    const stages = await crmRepo.getStages("acc-1");
    const agendadoStage = stages.find((s) => s.name === "Agendado")!;

    const appointment = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      {
        contactId: contact.id,
        procedureId: procedure.id,
        startsAt: "2026-09-01T10:00:00.000Z",
      },
    );

    expect(appointment.dealId).not.toBeNull();
    const deal = await crmRepo.getDeal("acc-1", appointment.dealId!);
    expect(deal?.stageId).toBe(agendadoStage.id);
  });

  it("does not move any deal or fail when there is no 'Agendado' stage", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    const stages = await crmRepo.getStages("acc-1");
    const agendadoStage = stages.find((s) => s.name === "Agendado")!;
    await crmRepo.renameStage("acc-1", agendadoStage.id, "Marcado");

    const appointment = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      {
        contactId: contact.id,
        procedureId: procedure.id,
        startsAt: "2026-09-01T10:00:00.000Z",
      },
    );

    expect(appointment.dealId).toBeNull();
    const openDeal = await crmRepo.getOpenDealForContact("acc-1", contact.id);
    expect(openDeal?.stageId).not.toBe(agendadoStage.id);
  });
});

import {
  cancelAppointment,
  updateAppointmentNotes,
  updateAppointmentStatus,
  updateAppointmentTime,
} from "./service";

describe("updateAppointmentTime", () => {
  it("revalidates conflict, excluding the appointment being edited", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    const appointment = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      { contactId: contact.id, procedureId: procedure.id, startsAt: "2026-09-01T10:00:00.000Z" },
    );

    const moved = await updateAppointmentTime(
      schedulingRepo,
      "acc-1",
      appointment.id,
      "2026-09-01T11:00:00.000Z",
      "2026-09-01T11:30:00.000Z",
    );
    expect(moved.startsAt).toBe("2026-09-01T11:00:00.000Z");
  });

  it("rejects a move into a slot occupied by another appointment", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    const first = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      { contactId: contact.id, procedureId: procedure.id, startsAt: "2026-09-01T10:00:00.000Z" },
    );
    await createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, "acc-1", {
      contactId: contact.id,
      procedureId: procedure.id,
      startsAt: "2026-09-01T14:00:00.000Z",
    });

    await expect(
      updateAppointmentTime(
        schedulingRepo,
        "acc-1",
        first.id,
        "2026-09-01T14:10:00.000Z",
        "2026-09-01T14:40:00.000Z",
      ),
    ).rejects.toThrow();
  });
});

describe("updateAppointmentStatus, updateAppointmentNotes, cancelAppointment", () => {
  it("updates status and notes independently, and cancelAppointment sets status to cancelado", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    const appointment = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      { contactId: contact.id, procedureId: procedure.id, startsAt: "2026-09-01T10:00:00.000Z" },
    );

    const confirmed = await updateAppointmentStatus(schedulingRepo, "acc-1", appointment.id, "confirmado");
    expect(confirmed.status).toBe("confirmado");

    const withNotes = await updateAppointmentNotes(schedulingRepo, "acc-1", appointment.id, "Trouxe exame");
    expect(withNotes.notes).toBe("Trouxe exame");
    expect(withNotes.status).toBe("confirmado");

    const cancelled = await cancelAppointment(schedulingRepo, "acc-1", appointment.id);
    expect(cancelled.status).toBe("cancelado");
  });
});

import { listAppointments, listPendingStatusAppointments } from "./service";

describe("listAppointments", () => {
  it("returns appointments overlapping the given range", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    await createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, "acc-1", {
      contactId: contact.id,
      procedureId: procedure.id,
      startsAt: "2026-09-01T10:00:00.000Z",
    });
    await createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, "acc-1", {
      contactId: contact.id,
      procedureId: procedure.id,
      startsAt: "2026-09-05T10:00:00.000Z",
    });

    const inRange = await listAppointments(schedulingRepo, "acc-1", {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-02T00:00:00.000Z",
    });
    expect(inRange).toHaveLength(1);
  });
});

describe("listPendingStatusAppointments", () => {
  it("returns only 'agendado' appointments whose end time is in the past", async () => {
    const { schedulingRepo, crmRepo, procedure, contact } = await setup();
    const past = await createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, "acc-1", {
      contactId: contact.id,
      procedureId: procedure.id,
      startsAt: "2020-01-01T10:00:00.000Z",
    });
    const future = await createAppointment({ scheduling: schedulingRepo, crm: crmRepo }, "acc-1", {
      contactId: contact.id,
      procedureId: procedure.id,
      startsAt: "2099-01-01T10:00:00.000Z",
    });
    const pastConfirmed = await createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      "acc-1",
      { contactId: contact.id, procedureId: procedure.id, startsAt: "2020-06-01T10:00:00.000Z" },
    );
    await updateAppointmentStatus(schedulingRepo, "acc-1", pastConfirmed.id, "concluido");

    const pending = await listPendingStatusAppointments(schedulingRepo, "acc-1");

    expect(pending.map((a) => a.id)).toEqual([past.id]);
    expect(pending.map((a) => a.id)).not.toContain(future.id);
    expect(pending.map((a) => a.id)).not.toContain(pastConfirmed.id);
  });
});
