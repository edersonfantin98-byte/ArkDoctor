"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import { createSupabaseSchedulingRepository } from "@/modules/scheduling/repository.supabase";
import { createSupabaseFinanceRepository } from "@/modules/finance/repository.supabase";
import * as crm from "@/modules/crm/service";
import * as scheduling from "@/modules/scheduling/service";
import * as finance from "@/modules/finance/service";
import { getDashboardOverview } from "@/modules/dashboard/service";
import type { DashboardPeriodSelection } from "@/modules/dashboard/types";

export async function getDashboardOverviewAction(
  todayIso: string,
  selection?: DashboardPeriodSelection,
) {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const crmRepo = createSupabaseCrmRepository(supabase);
  const schedulingRepo = createSupabaseSchedulingRepository(supabase);
  const financeRepo = createSupabaseFinanceRepository(supabase);

  return getDashboardOverview(
    {
      crm: {
        listPipeline: (accId) => crm.listPipeline(crmRepo, accId),
        countNewContacts: (accId, sinceIso, untilIso) =>
          crm.countNewContacts(crmRepo, accId, sinceIso, untilIso),
      },
      scheduling: {
        listAppointments: (accId, range) => scheduling.listAppointments(schedulingRepo, accId, range),
        listProcedures: (accId) => scheduling.listProcedures(schedulingRepo, accId),
      },
      finance: {
        getDashboardMetrics: (accId, rawPeriod, procedures) =>
          finance.getDashboardMetrics(financeRepo, accId, rawPeriod, procedures),
        listEntries: (accId, range) => finance.listFinancialEntries(financeRepo, accId, range),
      },
    },
    accountId,
    todayIso,
    selection,
  );
}
