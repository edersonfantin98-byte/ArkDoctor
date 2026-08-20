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
