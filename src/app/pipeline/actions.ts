"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import * as crm from "@/modules/crm/service";

async function getRepoAndAccount() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const repo = createSupabaseCrmRepository(supabase);
  return { repo, accountId };
}

export async function createContactAction(input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const contact = await crm.createContact(repo, accountId, input);
  revalidatePath("/pipeline");
  return contact;
}

export async function updateContactAction(contactId: string, input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const contact = await crm.updateContact(repo, accountId, contactId, input);
  revalidatePath("/pipeline");
  return contact;
}

export async function searchContactsAction(query: string) {
  const { repo, accountId } = await getRepoAndAccount();
  return crm.searchContacts(repo, accountId, query);
}

export async function listPipelineAction() {
  const { repo, accountId } = await getRepoAndAccount();
  return crm.listPipeline(repo, accountId);
}

export async function moveDealAction(dealId: string, toStageId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const deal = await crm.moveDeal(repo, accountId, dealId, toStageId);
  revalidatePath("/pipeline");
  return deal;
}

export async function createStageAction(name: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const stage = await crm.createStage(repo, accountId, name);
  revalidatePath("/pipeline");
  return stage;
}

export async function renameStageAction(stageId: string, name: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const stage = await crm.renameStage(repo, accountId, stageId, name);
  revalidatePath("/pipeline");
  return stage;
}

export async function reorderStagesAction(orderedIds: string[]) {
  const { repo, accountId } = await getRepoAndAccount();
  await crm.reorderStages(repo, accountId, orderedIds);
  revalidatePath("/pipeline");
}

export async function deleteStageAction(stageId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  await crm.deleteStage(repo, accountId, stageId);
  revalidatePath("/pipeline");
}

export async function reopenDealAction(contactId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const deal = await crm.reopenDeal(repo, accountId, contactId);
  revalidatePath("/pipeline");
  return deal;
}
