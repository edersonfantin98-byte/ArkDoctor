"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseFinanceRepository } from "@/modules/finance/repository.supabase";
import { createSupabaseSchedulingRepository } from "@/modules/scheduling/repository.supabase";
import * as finance from "@/modules/finance/service";
import { listProcedures } from "@/modules/scheduling/service";

async function getRepoAndAccount() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const repo = createSupabaseFinanceRepository(supabase);
  const schedulingRepo = createSupabaseSchedulingRepository(supabase);
  return { repo, schedulingRepo, accountId };
}

export async function createFinancialEntryAction(input: unknown) {
  const { repo, schedulingRepo, accountId } = await getRepoAndAccount();

  const procedureId =
    typeof input === "object" && input !== null && "procedureId" in input
      ? (input as { procedureId?: unknown }).procedureId
      : undefined;
  const linkedProcedure =
    typeof procedureId === "string" ? await schedulingRepo.getProcedure(accountId, procedureId) : null;

  const entry = await finance.createFinancialEntry(
    repo,
    accountId,
    input,
    linkedProcedure ? { defaultPrice: linkedProcedure.defaultPrice } : null,
  );
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  return entry;
}

export async function listFinancialEntriesAction(range: { from: string; to: string }) {
  const { repo, accountId } = await getRepoAndAccount();
  return finance.listFinancialEntries(repo, accountId, range);
}

export async function getDashboardMetricsAction(period: { from: string; to: string }) {
  const { repo, schedulingRepo, accountId } = await getRepoAndAccount();
  const procedures = await listProcedures(schedulingRepo, accountId);
  return finance.getDashboardMetrics(repo, accountId, period, procedures);
}
