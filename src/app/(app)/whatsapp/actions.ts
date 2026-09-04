"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";
import { createSupabaseWhatsappRepository } from "@/modules/whatsapp/repository.supabase";
import { createSupabaseWhatsappMediaStorage } from "@/modules/whatsapp/storage";
import type { Message } from "@/modules/whatsapp/types";
import { getWhatsappProvider } from "@/modules/whatsapp/provider";
import { createUazapiProvider } from "@/modules/whatsapp/provider.uazapi";
import * as whatsapp from "@/modules/whatsapp/service";
import { MAX_MEDIA_BYTES, mediaTypeFromMime } from "@/modules/whatsapp/media";
import { createSupabaseCrmRepository } from "@/modules/crm/repository.supabase";
import * as crm from "@/modules/crm/service";

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

const SIGNED_URL_TTL = 3600;
export type MessageView = Omit<Message, "mediaStoragePath"> & { mediaUrl: string | null };

export async function getConversationMessagesAction(
  conversationId: string,
): Promise<MessageView[]> {
  const { repo, accountId } = await getRepoAndAccount();
  const messages = await whatsapp.getConversationMessages(repo, accountId, conversationId);

  const storedPaths = messages
    .filter((m) => m.mediaStatus === "stored" && m.mediaStoragePath)
    .map((m) => m.mediaStoragePath as string);

  let urlByPath = new Map<string, string | null>();
  if (storedPaths.length > 0) {
    const supabase = await createServerSupabaseClient();
    const storage = createSupabaseWhatsappMediaStorage(supabase);
    const signed = await storage.createSignedUrls(storedPaths, SIGNED_URL_TTL);
    urlByPath = new Map(storedPaths.map((p, i) => [p, signed[i] ?? null]));
  }

  return messages.map((m) => {
    const { mediaStoragePath, ...rest } = m;
    return {
      ...rest,
      mediaUrl:
        m.mediaStatus === "stored" && mediaStoragePath
          ? urlByPath.get(mediaStoragePath) ?? null
          : null,
    };
  });
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
  const result = await whatsapp.logMessage(repo, provider, accountId, conversationId, input);
  if (result.ok) revalidatePath("/whatsapp");
  return result;
}

export async function getConnectionStatusAction() {
  const { repo, accountId } = await getRepoAndAccount();
  const connection = await repo.getConnection(accountId);
  const provider = getWhatsappProvider(connection?.provider ?? "fake", repo);
  return whatsapp.getConnectionStatus(provider, accountId);
}

export async function connectWhatsappAction(): Promise<{ error: string | null }> {
  try {
    const { repo, accountId } = await getRepoAndAccount();
    const connection = await repo.getConnection(accountId);
    const provider = getWhatsappProvider(connection?.provider ?? "fake", repo);
    await whatsapp.connectWhatsapp(provider, accountId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao conectar com o WhatsApp" };
  }
  revalidatePath("/whatsapp");
  return { error: null };
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

export async function sendWhatsappMediaAction(
  conversationId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um arquivo." };
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return { ok: false, error: "Arquivo acima do limite de 16 MB." };
  }
  const rawCaption = formData.get("caption");
  const caption = typeof rawCaption === "string" ? rawCaption : "";

  const { repo, accountId } = await getRepoAndAccount();
  const supabase = await createServerSupabaseClient();
  const storage = createSupabaseWhatsappMediaStorage(supabase);
  const uazapi = createUazapiProvider(repo);
  const mime = file.type || "application/octet-stream";

  const result = await whatsapp.sendMediaMessage(
    repo,
    storage,
    (accId, toPhone, input) => uazapi.sendMedia(accId, toPhone, input),
    accountId,
    conversationId,
    {
      type: mediaTypeFromMime(mime),
      bytes: new Uint8Array(await file.arrayBuffer()),
      mime,
      filename: file.name || null,
      caption,
    },
  );

  if (result.ok) {
    revalidatePath("/whatsapp");
    return { ok: true };
  }
  return { ok: false, error: result.error };
}

export async function importWhatsappHistoryAction(): Promise<whatsapp.ImportHistoryResult> {
  const { repo, accountId } = await getRepoAndAccount();
  const supabase = await createServerSupabaseClient();
  const storage = createSupabaseWhatsappMediaStorage(supabase);
  const crmRepo = createSupabaseCrmRepository(supabase);
  const uazapi = createUazapiProvider(repo);

  const result = await whatsapp.importWhatsappHistory(
    repo,
    {
      findContactByPhone: (accId, phone) => crm.findContactByPhone(crmRepo, accId, phone),
      createContact: (accId, input) => crm.createContact(crmRepo, accId, input),
    },
    {
      findChats: (accId, limit) => uazapi.findChats(accId, limit),
      findMessages: (accId, chatId, limit) => uazapi.findMessages(accId, chatId, limit),
      downloadMedia: (accId, providerMessageId) => uazapi.downloadMedia(accId, providerMessageId),
    },
    storage,
    accountId,
    new Date().toISOString(),
  );
  revalidatePath("/whatsapp");
  return result;
}
