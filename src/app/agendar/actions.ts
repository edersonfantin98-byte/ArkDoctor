"use server";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createSupabaseSchedulingRepository } from "@/modules/scheduling/repository.supabase";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import * as scheduling from "@/modules/scheduling/service";
import * as crm from "@/modules/crm/service";

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

export async function createPublicBookingAction(
  accountId: string,
  input: { name: string; phone: string; procedureId: string; startsAt: string },
) {
  const { schedulingRepo, crmRepo } = getPublicRepos();

  let contact = await crm.findContactByPhone(crmRepo, accountId, input.phone);
  if (!contact) {
    contact = await crm.createContact(crmRepo, accountId, {
      name: input.name,
      phone: input.phone,
    });
  }

  return scheduling.createAppointment(
    { scheduling: schedulingRepo, crm: crmRepo },
    accountId,
    { contactId: contact.id, procedureId: input.procedureId, startsAt: input.startsAt },
  );
}
