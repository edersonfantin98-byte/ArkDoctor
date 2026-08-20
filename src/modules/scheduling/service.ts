import type { SchedulingRepository } from "./repository";

export interface ConflictCheckInput {
  startsAt: string;
  endsAt: string;
  excludeAppointmentId?: string;
}

export interface ConflictResult {
  hasConflict: boolean;
  reason: string | null;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export async function checkConflict(
  repo: SchedulingRepository,
  accountId: string,
  input: ConflictCheckInput,
): Promise<ConflictResult> {
  const overlappingAppointments = await repo.listAppointmentsOverlapping(
    accountId,
    input.startsAt,
    input.endsAt,
    input.excludeAppointmentId,
  );
  if (overlappingAppointments.some((a) => a.status !== "cancelado")) {
    return { hasConflict: true, reason: "Conflita com outro agendamento" };
  }

  const overlappingBlocks = await repo.listAvailabilityBlocksOverlapping(
    accountId,
    input.startsAt,
    input.endsAt,
  );
  if (overlappingBlocks.length > 0) {
    return { hasConflict: true, reason: "Conflita com bloqueio de agenda" };
  }

  const rules = await repo.listAvailabilityRules(accountId);
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  const dayOfWeek = start.getDay();
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();

  const ruleConflict = rules.some((rule) => {
    if (rule.dayOfWeek !== dayOfWeek) return false;
    const ruleStart = timeToMinutes(rule.startTime);
    const ruleEnd = timeToMinutes(rule.endTime);
    return startMinutes < ruleEnd && endMinutes > ruleStart;
  });

  if (ruleConflict) {
    return { hasConflict: true, reason: "Conflita com bloqueio recorrente de agenda" };
  }

  return { hasConflict: false, reason: null };
}

import { createProcedureInputSchema, updateProcedureInputSchema } from "./schemas";
import type { Procedure } from "./types";

export async function createProcedure(
  repo: SchedulingRepository,
  accountId: string,
  rawInput: unknown,
): Promise<Procedure> {
  const input = createProcedureInputSchema.parse(rawInput);
  return repo.insertProcedure(accountId, input);
}

export async function updateProcedure(
  repo: SchedulingRepository,
  accountId: string,
  procedureId: string,
  rawInput: unknown,
): Promise<Procedure> {
  const input = updateProcedureInputSchema.parse(rawInput);
  return repo.updateProcedure(accountId, procedureId, input);
}

export async function listProcedures(
  repo: SchedulingRepository,
  accountId: string,
): Promise<Procedure[]> {
  return repo.listProcedures(accountId);
}

export async function deleteProcedure(
  repo: SchedulingRepository,
  accountId: string,
  procedureId: string,
): Promise<void> {
  const count = await repo.countAppointmentsForProcedure(accountId, procedureId);
  if (count > 0) {
    throw new Error("Não é possível remover um procedimento com agendamentos vinculados");
  }
  await repo.deleteProcedure(accountId, procedureId);
}

import type { CrmRepository } from "@/modules/crm/repository";
import { getOpenDealForContact, getStages, moveDeal } from "@/modules/crm/service";
import { createAppointmentInputSchema } from "./schemas";
import type { Appointment } from "./types";

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

async function resolveDealForAppointment(
  crmRepo: CrmRepository,
  accountId: string,
  contactId: string,
): Promise<string | null> {
  const openDeal = await getOpenDealForContact(crmRepo, accountId, contactId);
  if (!openDeal) return null;

  const stages = await getStages(crmRepo, accountId);
  const targetStage = stages.find((s) => s.name === "Agendado");
  if (!targetStage) return null;

  await moveDeal(crmRepo, accountId, openDeal.id, targetStage.id);
  return openDeal.id;
}

export async function createAppointment(
  repos: { scheduling: SchedulingRepository; crm: CrmRepository },
  accountId: string,
  rawInput: unknown,
): Promise<Appointment> {
  const input = createAppointmentInputSchema.parse(rawInput);

  const procedure = await repos.scheduling.getProcedure(accountId, input.procedureId);
  if (!procedure) throw new Error("Procedimento não encontrado");

  const startsAt = input.startsAt;
  const endsAt = input.endsAt ?? addMinutes(startsAt, procedure.defaultDurationMinutes);

  const conflict = await checkConflict(repos.scheduling, accountId, { startsAt, endsAt });
  if (conflict.hasConflict) throw new Error(conflict.reason ?? "Conflito de horário");

  const dealId = await resolveDealForAppointment(repos.crm, accountId, input.contactId);

  return repos.scheduling.insertAppointment(accountId, {
    contactId: input.contactId,
    procedureId: input.procedureId,
    dealId,
    startsAt,
    endsAt,
    notes: input.notes ?? null,
  });
}

import type { AppointmentStatus } from "./types";

export async function updateAppointmentTime(
  repo: SchedulingRepository,
  accountId: string,
  appointmentId: string,
  startsAt: string,
  endsAt: string,
): Promise<Appointment> {
  const conflict = await checkConflict(repo, accountId, {
    startsAt,
    endsAt,
    excludeAppointmentId: appointmentId,
  });
  if (conflict.hasConflict) throw new Error(conflict.reason ?? "Conflito de horário");

  return repo.updateAppointmentTime(accountId, appointmentId, startsAt, endsAt);
}

export async function updateAppointmentStatus(
  repo: SchedulingRepository,
  accountId: string,
  appointmentId: string,
  status: AppointmentStatus,
): Promise<Appointment> {
  return repo.updateAppointmentStatus(accountId, appointmentId, status);
}

export async function updateAppointmentNotes(
  repo: SchedulingRepository,
  accountId: string,
  appointmentId: string,
  notes: string | null,
): Promise<Appointment> {
  return repo.updateAppointmentNotes(accountId, appointmentId, notes);
}

export async function cancelAppointment(
  repo: SchedulingRepository,
  accountId: string,
  appointmentId: string,
): Promise<Appointment> {
  return updateAppointmentStatus(repo, accountId, appointmentId, "cancelado");
}

import type { AppointmentWithDetails } from "./types";

export async function listAppointments(
  repo: SchedulingRepository,
  accountId: string,
  range: { from: string; to: string },
): Promise<AppointmentWithDetails[]> {
  return repo.listAppointmentsInRange(accountId, range.from, range.to);
}

export async function listPendingStatusAppointments(
  repo: SchedulingRepository,
  accountId: string,
): Promise<AppointmentWithDetails[]> {
  return repo.listPendingStatusAppointments(accountId, new Date().toISOString());
}
