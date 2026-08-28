"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseSchedulingRepository } from "@/modules/scheduling/repository.supabase";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import { createSupabaseTreatmentsRepository } from "@/modules/treatments/repository.supabase";
import * as scheduling from "@/modules/scheduling/service";
import * as treatments from "@/modules/treatments/service";
import type { AppointmentStatus } from "@/modules/scheduling/types";

async function getReposAndAccount() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const schedulingRepo = createSupabaseSchedulingRepository(supabase);
  const crmRepo = createSupabaseCrmRepository(supabase);
  const treatmentsRepo = createSupabaseTreatmentsRepository(supabase);
  return { schedulingRepo, crmRepo, treatmentsRepo, accountId };
}

export async function createAppointmentAction(input: unknown) {
  const { schedulingRepo, crmRepo, accountId } = await getReposAndAccount();
  const appointment = await scheduling.createAppointment(
    { scheduling: schedulingRepo, crm: crmRepo },
    accountId,
    input,
  );
  revalidatePath("/agenda");
  revalidatePath("/pipeline");
  return appointment;
}

export async function updateAppointmentTimeAction(id: string, startsAt: string, endsAt: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const appointment = await scheduling.updateAppointmentTime(
    schedulingRepo,
    accountId,
    id,
    startsAt,
    endsAt,
  );
  revalidatePath("/agenda");
  return appointment;
}

export async function updateAppointmentStatusAction(id: string, status: AppointmentStatus) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const appointment = await scheduling.updateAppointmentStatus(schedulingRepo, accountId, id, status);
  revalidatePath("/agenda");
  return appointment;
}

export async function updateAppointmentNotesAction(id: string, notes: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const appointment = await scheduling.updateAppointmentNotes(schedulingRepo, accountId, id, notes);
  revalidatePath("/agenda");
  return appointment;
}

export async function cancelAppointmentAction(id: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const appointment = await scheduling.cancelAppointment(schedulingRepo, accountId, id);
  revalidatePath("/agenda");
  return appointment;
}

export async function listAppointmentsAction(from: string, to: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.listAppointments(schedulingRepo, accountId, { from, to });
}

export async function listPendingStatusAppointmentsAction() {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.listPendingStatusAppointments(schedulingRepo, accountId);
}

export async function checkConflictAction(startsAt: string, endsAt: string, excludeAppointmentId?: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.checkConflict(schedulingRepo, accountId, { startsAt, endsAt, excludeAppointmentId });
}

export async function listOccupiedIntervalsAction(from: string, to: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.listOccupiedIntervals(schedulingRepo, accountId, { from, to });
}

export async function createProcedureAction(input: unknown) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const procedure = await scheduling.createProcedure(schedulingRepo, accountId, input);
  revalidatePath("/agenda");
  revalidatePath("/procedimentos");
  return procedure;
}

export async function updateProcedureAction(id: string, input: unknown) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const procedure = await scheduling.updateProcedure(schedulingRepo, accountId, id, input);
  revalidatePath("/agenda");
  revalidatePath("/procedimentos");
  return procedure;
}

export async function listProceduresAction() {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.listProcedures(schedulingRepo, accountId);
}

export async function deleteProcedureAction(id: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  await scheduling.deleteProcedure(schedulingRepo, accountId, id);
  revalidatePath("/agenda");
  revalidatePath("/procedimentos");
}

export async function createAvailabilityBlockAction(input: unknown) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const block = await scheduling.createAvailabilityBlock(schedulingRepo, accountId, input);
  revalidatePath("/agenda");
  return block;
}

export async function deleteAvailabilityBlockAction(id: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  await scheduling.deleteAvailabilityBlock(schedulingRepo, accountId, id);
  revalidatePath("/agenda");
}

export async function listAvailabilityBlocksAction() {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.listAvailabilityBlocks(schedulingRepo, accountId);
}

export async function createAvailabilityRuleAction(input: unknown) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  const rule = await scheduling.createAvailabilityRule(schedulingRepo, accountId, input);
  revalidatePath("/agenda");
  return rule;
}

export async function deleteAvailabilityRuleAction(id: string) {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  await scheduling.deleteAvailabilityRule(schedulingRepo, accountId, id);
  revalidatePath("/agenda");
}

export async function listAvailabilityRulesAction() {
  const { schedulingRepo, accountId } = await getReposAndAccount();
  return scheduling.listAvailabilityRules(schedulingRepo, accountId);
}

export async function listTreatmentsForContactAction(contactId: string) {
  const { treatmentsRepo, accountId } = await getReposAndAccount();
  return treatments.listTreatmentsForContact(treatmentsRepo, accountId, contactId);
}

export async function linkAppointmentToTreatmentAction(
  appointmentId: string,
  treatmentId: string | null,
) {
  const { schedulingRepo, treatmentsRepo, accountId } = await getReposAndAccount();
  const appointment = await scheduling.linkAppointmentToTreatment(
    schedulingRepo,
    treatmentsRepo,
    accountId,
    appointmentId,
    treatmentId,
  );
  revalidatePath("/agenda");
  return appointment;
}
