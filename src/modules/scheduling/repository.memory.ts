import type { SchedulingRepository } from "./repository";
import type {
  Appointment,
  AppointmentWithDetails,
  AvailabilityBlock,
  AvailabilityRule,
  Procedure,
} from "./types";

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(aEnd).getTime() > new Date(bStart).getTime();
}

export function createInMemorySchedulingRepository(): SchedulingRepository {
  const procedures = new Map<string, Procedure>();
  const appointments = new Map<string, Appointment>();
  const blocks = new Map<string, AvailabilityBlock>();
  const rules = new Map<string, AvailabilityRule>();

  return {
    async insertProcedure(accountId, input) {
      const id = crypto.randomUUID();
      const procedure: Procedure = {
        id,
        accountId,
        name: input.name,
        defaultPrice: input.defaultPrice,
        defaultDurationMinutes: input.defaultDurationMinutes,
        createdAt: new Date().toISOString(),
      };
      procedures.set(id, procedure);
      return procedure;
    },

    async updateProcedure(accountId, procedureId, input) {
      const procedure = procedures.get(procedureId);
      if (!procedure || procedure.accountId !== accountId) throw new Error("Procedure not found");
      const updated: Procedure = {
        ...procedure,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.defaultPrice !== undefined ? { defaultPrice: input.defaultPrice } : {}),
        ...(input.defaultDurationMinutes !== undefined
          ? { defaultDurationMinutes: input.defaultDurationMinutes }
          : {}),
      };
      procedures.set(procedureId, updated);
      return updated;
    },

    async getProcedure(accountId, procedureId) {
      const procedure = procedures.get(procedureId);
      return procedure && procedure.accountId === accountId ? procedure : null;
    },

    async listProcedures(accountId) {
      return [...procedures.values()].filter((p) => p.accountId === accountId);
    },

    async deleteProcedure(accountId, procedureId) {
      const procedure = procedures.get(procedureId);
      if (!procedure || procedure.accountId !== accountId) throw new Error("Procedure not found");
      procedures.delete(procedureId);
    },

    async countAppointmentsForProcedure(accountId, procedureId) {
      return [...appointments.values()].filter(
        (a) => a.accountId === accountId && a.procedureId === procedureId,
      ).length;
    },

    async insertAppointment(accountId, input) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const appointment: Appointment = {
        id,
        accountId,
        contactId: input.contactId,
        procedureId: input.procedureId,
        dealId: input.dealId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: "agendado",
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      appointments.set(id, appointment);
      return appointment;
    },

    async getAppointment(accountId, appointmentId) {
      const appointment = appointments.get(appointmentId);
      return appointment && appointment.accountId === accountId ? appointment : null;
    },

    async updateAppointmentTime(accountId, appointmentId, startsAt, endsAt) {
      const appointment = appointments.get(appointmentId);
      if (!appointment || appointment.accountId !== accountId) {
        throw new Error("Appointment not found");
      }
      const updated: Appointment = {
        ...appointment,
        startsAt,
        endsAt,
        updatedAt: new Date().toISOString(),
      };
      appointments.set(appointmentId, updated);
      return updated;
    },

    async updateAppointmentStatus(accountId, appointmentId, status) {
      const appointment = appointments.get(appointmentId);
      if (!appointment || appointment.accountId !== accountId) {
        throw new Error("Appointment not found");
      }
      const updated: Appointment = { ...appointment, status, updatedAt: new Date().toISOString() };
      appointments.set(appointmentId, updated);
      return updated;
    },

    async updateAppointmentNotes(accountId, appointmentId, notes) {
      const appointment = appointments.get(appointmentId);
      if (!appointment || appointment.accountId !== accountId) {
        throw new Error("Appointment not found");
      }
      const updated: Appointment = { ...appointment, notes, updatedAt: new Date().toISOString() };
      appointments.set(appointmentId, updated);
      return updated;
    },

    async listAppointmentsInRange(accountId, from, to) {
      const result: AppointmentWithDetails[] = [];
      for (const appointment of appointments.values()) {
        if (appointment.accountId !== accountId) continue;
        if (!overlaps(appointment.startsAt, appointment.endsAt, from, to)) continue;
        const procedure = procedures.get(appointment.procedureId);
        if (!procedure) continue;
        // Contact is not owned by this repository; callers needing full
        // AppointmentWithDetails from the in-memory repo in tests should
        // assert on the fields they need without relying on `contact`.
        result.push({ ...appointment, procedure, contact: undefined as never });
      }
      return result;
    },

    async listAppointmentsOverlapping(accountId, startsAt, endsAt, excludeAppointmentId) {
      return [...appointments.values()].filter((a) => {
        if (a.accountId !== accountId) return false;
        if (excludeAppointmentId && a.id === excludeAppointmentId) return false;
        return overlaps(a.startsAt, a.endsAt, startsAt, endsAt);
      });
    },

    async listPendingStatusAppointments(accountId, now) {
      const result: AppointmentWithDetails[] = [];
      for (const appointment of appointments.values()) {
        if (appointment.accountId !== accountId) continue;
        if (appointment.status !== "agendado") continue;
        if (new Date(appointment.endsAt).getTime() >= new Date(now).getTime()) continue;
        const procedure = procedures.get(appointment.procedureId);
        if (!procedure) continue;
        result.push({ ...appointment, procedure, contact: undefined as never });
      }
      return result;
    },

    async insertAvailabilityBlock(accountId, input) {
      const id = crypto.randomUUID();
      const block: AvailabilityBlock = {
        id,
        accountId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason: input.reason,
      };
      blocks.set(id, block);
      return block;
    },

    async deleteAvailabilityBlock(accountId, blockId) {
      const block = blocks.get(blockId);
      if (!block || block.accountId !== accountId) throw new Error("Block not found");
      blocks.delete(blockId);
    },

    async listAvailabilityBlocksOverlapping(accountId, startsAt, endsAt) {
      return [...blocks.values()].filter(
        (b) => b.accountId === accountId && overlaps(b.startsAt, b.endsAt, startsAt, endsAt),
      );
    },

    async listAvailabilityBlocks(accountId) {
      return [...blocks.values()].filter((b) => b.accountId === accountId);
    },

    async insertAvailabilityRule(accountId, input) {
      const id = crypto.randomUUID();
      const rule: AvailabilityRule = {
        id,
        accountId,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        reason: input.reason,
      };
      rules.set(id, rule);
      return rule;
    },

    async deleteAvailabilityRule(accountId, ruleId) {
      const rule = rules.get(ruleId);
      if (!rule || rule.accountId !== accountId) throw new Error("Rule not found");
      rules.delete(ruleId);
    },

    async listAvailabilityRules(accountId) {
      return [...rules.values()].filter((r) => r.accountId === accountId);
    },
  };
}
