"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseWhatsappRepository } from "@/modules/whatsapp/repository.supabase";
import { getWhatsappProvider } from "@/modules/whatsapp/provider";
import * as whatsapp from "@/modules/whatsapp/service";

async function getRepoAndAccount() {
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const repo = createSupabaseWhatsappRepository(supabase);
  return { repo, accountId };
}

export async function listConversationsAction() {
  const { repo, accountId } = await getRepoAndAccount();
  return whatsapp.listConversations(repo, accountId);
}

export async function getConversationMessagesAction(conversationId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  return whatsapp.getConversationMessages(repo, accountId, conversationId);
}

export async function startConversationAction(input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const conversation = await whatsapp.startConversation(repo, accountId, input);
  revalidatePath("/whatsapp");
  return conversation;
}

export async function logMessageAction(conversationId: string, input: unknown) {
  const { repo, accountId } = await getRepoAndAccount();
  const provider = getWhatsappProvider("fake", repo);
  const message = await whatsapp.logMessage(repo, provider, accountId, conversationId, input);
  revalidatePath("/whatsapp");
  return message;
}
