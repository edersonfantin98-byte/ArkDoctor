"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseFinanceRepository } from "@/modules/finance/repository.supabase";
import { createSupabaseSchedulingRepository } from "@/modules/scheduling/repository.supabase";
import * as finance from "@/modules/finance/service";
import { createFinancialEntryInputSchema } from "@/modules/finance/schemas";
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

  const parsed = createFinancialEntryInputSchema.safeParse(input);
  const procedureId = parsed.success ? parsed.data.procedureId : undefined;
  const linkedProcedure =
    procedureId !== undefined ? await schedulingRepo.getProcedure(accountId, procedureId) : null;

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

export async function updateFinancialEntryAction(id: string, input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const entry = await finance.updateFinancialEntry(repo, accountId, id, input);
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  return entry;
}

export async function deleteFinancialEntryAction(id: string) {
  const { repo, accountId } = await getRepoAndAccount();
  await finance.deleteFinancialEntry(repo, accountId, id);
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
}

export async function getFinancialEntryByAppointmentAction(appointmentId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  return finance.getFinancialEntryByAppointmentId(repo, accountId, appointmentId);
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
