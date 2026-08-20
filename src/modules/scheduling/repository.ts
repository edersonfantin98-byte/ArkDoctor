import type {
  Appointment,
  AppointmentStatus,
  AppointmentWithDetails,
  AvailabilityBlock,
  AvailabilityRule,
  Procedure,
} from "./types";

export interface SchedulingRepository {
  insertProcedure(
    accountId: string,
    input: { name: string; defaultPrice: number; defaultDurationMinutes: number },
  ): Promise<Procedure>;
  updateProcedure(
    accountId: string,
    procedureId: string,
    input: { name?: string; defaultPrice?: number; defaultDurationMinutes?: number },
  ): Promise<Procedure>;
  getProcedure(accountId: string, procedureId: string): Promise<Procedure | null>;
  listProcedures(accountId: string): Promise<Procedure[]>;
  deleteProcedure(accountId: string, procedureId: string): Promise<void>;
  countAppointmentsForProcedure(accountId: string, procedureId: string): Promise<number>;

  insertAppointment(
    accountId: string,
    input: {
      contactId: string;
      procedureId: string;
      dealId: string | null;
      startsAt: string;
      endsAt: string;
      notes: string | null;
    },
  ): Promise<Appointment>;
  getAppointment(accountId: string, appointmentId: string): Promise<Appointment | null>;
  updateAppointmentTime(
    accountId: string,
    appointmentId: string,
    startsAt: string,
    endsAt: string,
  ): Promise<Appointment>;
  updateAppointmentStatus(
    accountId: string,
    appointmentId: string,
    status: AppointmentStatus,
  ): Promise<Appointment>;
  updateAppointmentNotes(
    accountId: string,
    appointmentId: string,
    notes: string | null,
  ): Promise<Appointment>;
  listAppointmentsInRange(
    accountId: string,
    from: string,
    to: string,
  ): Promise<AppointmentWithDetails[]>;
  listAppointmentsOverlapping(
    accountId: string,
    startsAt: string,
    endsAt: string,
    excludeAppointmentId?: string,
  ): Promise<Appointment[]>;
  listPendingStatusAppointments(
    accountId: string,
    now: string,
  ): Promise<AppointmentWithDetails[]>;

  insertAvailabilityBlock(
    accountId: string,
    input: { startsAt: string; endsAt: string; reason: string | null },
  ): Promise<AvailabilityBlock>;
  deleteAvailabilityBlock(accountId: string, blockId: string): Promise<void>;
  listAvailabilityBlocksOverlapping(
    accountId: string,
    startsAt: string,
    endsAt: string,
  ): Promise<AvailabilityBlock[]>;
  listAvailabilityBlocks(accountId: string): Promise<AvailabilityBlock[]>;

  insertAvailabilityRule(
    accountId: string,
    input: { dayOfWeek: number; startTime: string; endTime: string; reason: string | null },
  ): Promise<AvailabilityRule>;
  deleteAvailabilityRule(accountId: string, ruleId: string): Promise<void>;
  listAvailabilityRules(accountId: string): Promise<AvailabilityRule[]>;
}
