"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseWhatsappRepository } from "@/modules/whatsapp/repository.supabase";
import { getWhatsappProvider } from "@/modules/whatsapp/provider";
import { createUazapiProvider } from "@/modules/whatsapp/provider.uazapi";
import { createEvolutionProvider } from "@/modules/whatsapp/provider.evolution";
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
  const connection = await repo.getConnection(accountId);
  const provider = getWhatsappProvider(connection?.provider ?? "fake", repo);
  const message = await whatsapp.logMessage(repo, provider, accountId, conversationId, input);
  revalidatePath("/whatsapp");
  return message;
}

export async function getConnectionStatusAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const connection = await repo.getConnection(accountId);
  const provider = getWhatsappProvider(connection?.provider ?? "fake", repo);
  return whatsapp.getConnectionStatus(provider, accountId);
}

export async function connectWhatsappAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const connection = await repo.getConnection(accountId);
  const provider = getWhatsappProvider(connection?.provider ?? "fake", repo);
  await whatsapp.connectWhatsapp(provider, accountId);
  revalidatePath("/whatsapp");
}

export async function disconnectWhatsappAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const connection = await repo.getConnection(accountId);
  const provider = getWhatsappProvider(connection?.provider ?? "fake", repo);
  await whatsapp.disconnectWhatsapp(provider, accountId);
  revalidatePath("/whatsapp");
}

export async function resetUnreadCountAction(conversationId: string) {
  const { repo, accountId } = await getRepoAndAccount();
  await whatsapp.resetUnreadCount(repo, accountId, conversationId);
  revalidatePath("/whatsapp");
}

export async function saveUazapiConfigAction(subdomain: string, token: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const existing = await repo.getConnection(accountId);
  const webhookSecret = existing?.config?.webhookSecret ?? crypto.randomUUID();
  await repo.updateConnectionConfig(accountId, "uazapi", {
    subdomain,
    token,
    webhookSecret,
  });
  await repo.upsertConnectionStatus(accountId, "disconnected", null);
  await repo.updateConnectionQrCode(accountId, null);
  revalidatePath("/whatsapp");
}

export async function getUazapiQrCodeAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const provider = createUazapiProvider(repo);
  return provider.getQrCode(accountId);
}

export async function saveEvolutionConfigAction(baseUrl: string, instanceName: string, apiKey: string) {
  const { repo, accountId } = await getRepoAndAccount();
  const existing = await repo.getConnection(accountId);
  const webhookSecret = existing?.config?.webhookSecret ?? crypto.randomUUID();
  await repo.updateConnectionConfig(accountId, "evolution", {
    baseUrl,
    instanceName,
    apiKey,
    webhookSecret,
  });
  await repo.upsertConnectionStatus(accountId, "disconnected", null);
  await repo.updateConnectionQrCode(accountId, null);
  revalidatePath("/whatsapp");
}

export async function getEvolutionQrCodeAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const provider = createEvolutionProvider(repo);
  return provider.getQrCode(accountId);
}

export async function getWhatsappConnectionAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const connection = await repo.getConnection(accountId);
  if (!connection) return null;
  return {
    provider: connection.provider,
    status: connection.status,
    isConfigured: connection.config !== null,
  };
}
