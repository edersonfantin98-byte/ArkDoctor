"use server";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createSupabaseSchedulingRepository } from "@/modules/scheduling/repository.supabase";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import * as scheduling from "@/modules/scheduling/service";
import * as crm from "@/modules/crm/service";
import type { Appointment } from "@/modules/scheduling/types";
import { normalizePhone } from "./phone";

function getPublicRepos() {
  const supabase = createServiceRoleSupabaseClient();
  const schedulingRepo = createSupabaseSchedulingRepository(supabase);
  const crmRepo = createSupabaseCrmRepository(supabase);
  return { schedulingRepo, crmRepo };
}

export async function listPublicProceduresAction(accountId: string) {
  const { schedulingRepo } = getPublicRepos();
  return scheduling.listProcedures(schedulingRepo, accountId);
}

export async function checkPublicConflictAction(
  accountId: string,
  startsAt: string,
  endsAt: string,
) {
  const { schedulingRepo } = getPublicRepos();
  return scheduling.checkConflict(schedulingRepo, accountId, { startsAt, endsAt });
}

export async function listPublicOccupiedIntervalsAction(
  accountId: string,
  from: string,
  to: string,
) {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    toMs <= fromMs ||
    toMs - fromMs > 24 * 60 * 60 * 1000
  ) {
    throw new Error("Intervalo inválido");
  }

  const { schedulingRepo } = getPublicRepos();
  return scheduling.listOccupiedIntervals(schedulingRepo, accountId, { from, to });
}

export async function createPublicBookingAction(
  accountId: string,
  input: { name: string; phone: string; procedureId: string; startsAt: string },
): Promise<{ ok: true; appointment: Appointment } | { ok: false; error: string }> {
  const { schedulingRepo, crmRepo } = getPublicRepos();
  const phone = normalizePhone(input.phone);

  try {
    let contact = await crm.findContactByPhone(crmRepo, accountId, phone);
    if (!contact) {
      contact = await crm.createContact(crmRepo, accountId, {
        name: input.name,
        phone,
      });
    }

    const appointment = await scheduling.createAppointment(
      { scheduling: schedulingRepo, crm: crmRepo },
      accountId,
      { contactId: contact.id, procedureId: input.procedureId, startsAt: input.startsAt },
    );

    return { ok: true, appointment };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao criar agendamento",
    };
  }
}
