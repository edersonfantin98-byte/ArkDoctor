"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseFinanceRepository } from "@/modules/finance/repository.supabase";
import * as finance from "@/modules/finance/service";

async function getRepoAndAccount() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const repo = createSupabaseFinanceRepository(supabase);
  return { repo, accountId };
}

export async function createProcedureAction(input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const procedure = await finance.createProcedure(repo, accountId, input);
  revalidatePath("/financeiro/procedimentos");
  return procedure;
}

export async function updateProcedureAction(procedureId: string, input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const procedure = await finance.updateProcedure(repo, accountId, procedureId, input);
  revalidatePath("/financeiro/procedimentos");
  return procedure;
}

export async function deactivateProcedureAction(procedureId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  await finance.deactivateProcedure(repo, accountId, procedureId);
  revalidatePath("/financeiro/procedimentos");
}

export async function listProceduresAction(options?: { activeOnly?: boolean }) {
  const { repo, accountId } = await getRepoAndAccount();
  return finance.listProcedures(repo, accountId, options);
}

export async function getProcedureDefaultsAction(procedureId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  return finance.getProcedureDefaults(repo, accountId, procedureId);
}

export async function createFinancialEntryAction(input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const entry = await finance.createFinancialEntry(repo, accountId, input);
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  return entry;
}

export async function listFinancialEntriesAction(range: { from: string; to: string }) {
  const { repo, accountId } = await getRepoAndAccount();
  return finance.listFinancialEntries(repo, accountId, range);
}

export async function getDashboardMetricsAction(period: { from: string; to: string }) {
  const { repo, accountId } = await getRepoAndAccount();
  return finance.getDashboardMetrics(repo, accountId, period);
}
