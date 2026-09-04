import type { WhatsappRepository } from "./repository";
import type { WhatsappProvider } from "./provider";
import { startConversationInputSchema, logMessageInputSchema } from "./schemas";
import { normalizeWhatsappJid } from "./provider.uazapi";
import { MAX_MEDIA_BYTES, storagePathFor, safeContentType } from "./media";
import { mapUazapiMessage } from "./message-mapping";
import type { WhatsappMediaStorage } from "./storage";
import type { WhatsappConnection, Message, MediaType, MediaStatus, MessageDirection } from "./types";
import type { UazapiChat } from "./provider.uazapi";
import { parseOrThrow } from "@/lib/zod-error";

export type LogMessageResult =
  | { ok: true; message: Message }
  | { ok: false; error: string };

const DISCONNECTED_ERROR = "WhatsApp desconectado. Conecte para enviar mensagens.";

export const HISTORY_MAX_CONVERSATIONS = 50;
export const HISTORY_MAX_MESSAGES_PER_CONVERSATION = 30;
export const HISTORY_WINDOW_DAYS = 60;
export const HISTORY_BATCH_SIZE = 15;
const HISTORY_MEDIA_WINDOW_DAYS = 30;

export async function listConversations(repo: WhatsappRepository, accountId: string) {
  return repo.listConversations(accountId);
}

export async function getConversationMessages(
  repo: WhatsappRepository,
  accountId: string,
  conversationId: string,
) {
  const conversation = await repo.getConversation(accountId, conversationId);
  if (!conversation) throw new Error("Conversa não encontrada");
  return repo.listMessages(accountId, conversationId);
}

export async function startConversation(repo: WhatsappRepository, accountId: string, rawInput: unknown) {
  const input = parseOrThrow(startConversationInputSchema, rawInput);
  return repo.insertConversation(accountId, input);
}

export async function logMessage(
  repo: WhatsappRepository,
  provider: WhatsappProvider,
  accountId: string,
  conversationId: string,
  rawInput: unknown,
): Promise<LogMessageResult> {
  const input = parseOrThrow(logMessageInputSchema, rawInput);
  const conversation = await repo.getConversation(accountId, conversationId);
  if (!conversation) throw new Error("Conversa não encontrada");

  if (input.direction === "outbound") {
    const connection = await repo.getConnection(accountId);
    if (connection && connection.status !== "connected") {
      return { ok: false, error: DISCONNECTED_ERROR };
    }
    try {
      await provider.sendMessage(accountId, conversation.contactPhone, input.body);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Falha ao enviar mensagem" };
    }
  }

  const message = await repo.insertMessage(accountId, conversationId, input);
  await repo.touchConversation(accountId, conversationId, input.body, message.sentAt);
  return { ok: true, message };
}

export type SendMediaFn = (
  accountId: string,
  toPhone: string,
  input: { type: MediaType; dataBase64: string; filename: string | null; caption: string },
) => Promise<{ providerMessageId: string }>;

export async function sendMediaMessage(
  repo: WhatsappRepository,
  storage: WhatsappMediaStorage,
  sendMedia: SendMediaFn,
  accountId: string,
  conversationId: string,
  input: { type: MediaType; bytes: Uint8Array; mime: string; filename: string | null; caption: string },
): Promise<LogMessageResult> {
  const conversation = await repo.getConversation(accountId, conversationId);
  if (!conversation) throw new Error("Conversa não encontrada");

  const connection = await repo.getConnection(accountId);
  if (connection && connection.status !== "connected") {
    return { ok: false, error: DISCONNECTED_ERROR };
  }
  if (input.bytes.byteLength > MAX_MEDIA_BYTES) {
    return { ok: false, error: "Arquivo acima do limite de 16 MB." };
  }

  try {
    await sendMedia(accountId, conversation.contactPhone, {
      type: input.type,
      dataBase64: Buffer.from(input.bytes).toString("base64"),
      filename: input.filename,
      caption: input.caption,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao enviar mídia" };
  }

  const message = await repo.insertMessage(accountId, conversationId, {
    direction: "outbound",
    body: input.caption,
    media: {
      type: input.type,
      status: "stored",
      mime: input.mime,
      filename: input.filename,
      storagePath: null,
    },
  });

  let finalMessage = message;
  try {
    const path = storagePathFor(accountId, conversationId, message.id, input.mime);
    await storage.upload(path, input.bytes, safeContentType(input.type, input.mime));
    await repo.updateMessageMedia(accountId, message.id, { status: "stored", storagePath: path });
    finalMessage = { ...message, mediaStoragePath: path };
  } catch (err) {
    console.error("[whatsapp] envio: mídia enviada mas upload local falhou, marcada 'expired'", err);
    await repo.updateMessageMedia(accountId, message.id, { status: "expired", storagePath: null });
    finalMessage = { ...message, mediaStatus: "expired", mediaStoragePath: null };
  }

  const preview = input.caption || mediaPreviewLabel(input.type);
  await repo.touchConversation(accountId, conversationId, preview, message.sentAt);
  return { ok: true, message: finalMessage };
}

export async function runMediaRetention(
  repo: WhatsappRepository,
  storage: WhatsappMediaStorage,
  nowIso: string,
  retentionDays = 30,
): Promise<{ expired: number; errors: number }> {
  const cutoffIso = new Date(
    Date.parse(nowIso) - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const rows = await repo.listStoredMediaOlderThan(cutoffIso);

  let expired = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      await storage.remove([row.mediaStoragePath]);
    } catch (err) {
      console.error("[whatsapp] retenção: falha ao remover objeto, mantém 'stored'", row.id, err);
      errors += 1;
      continue;
    }
    await repo.updateMessageMedia(row.accountId, row.id, { status: "expired", storagePath: null });
    expired += 1;
  }
  return { expired, errors };
}

async function ingestMediaBytes(
  whatsappRepo: WhatsappRepository,
  storage: WhatsappMediaStorage,
  downloadMedia: (accountId: string, providerMessageId: string) => Promise<{ bytes: Uint8Array; mime: string }>,
  accountId: string,
  conversationId: string,
  message: Message,
  media: { providerMessageId: string; type: MediaType; mime: string },
): Promise<Message> {
  try {
    const { bytes, mime } = await downloadMedia(accountId, media.providerMessageId);
    if (bytes.byteLength > MAX_MEDIA_BYTES) {
      await whatsappRepo.updateMessageMedia(accountId, message.id, {
        status: "too_large",
        storagePath: null,
      });
      return { ...message, mediaStatus: "too_large", mediaStoragePath: null };
    }
    const path = storagePathFor(accountId, conversationId, message.id, mime || media.mime);
    await storage.upload(path, bytes, safeContentType(media.type, mime || media.mime));
    await whatsappRepo.updateMessageMedia(accountId, message.id, { status: "stored", storagePath: path });
    return { ...message, mediaStatus: "stored", mediaStoragePath: path };
  } catch (err) {
    console.error("[whatsapp] ingestão de mídia falhou, marcada como expired", err);
    return message;
  }
}

export async function handleInboundMessage(
  whatsappRepo: WhatsappRepository,
  crmDeps: {
    findContactByPhone: (accountId: string, phone: string) => Promise<{ id: string; name: string } | null>;
    createContact: (
      accountId: string,
      input: { name: string; phone: string },
    ) => Promise<{ id: string; name: string }>;
  },
  accountId: string,
  input: {
    fromPhone: string;
    fromName?: string;
    body: string;
    media?: {
      providerMessageId: string;
      type: MediaType;
      mime: string;
      filename: string | null;
      fileLength: number;
    };
  },
  mediaDeps?: {
    storage: WhatsappMediaStorage;
    downloadMedia: (
      accountId: string,
      providerMessageId: string,
    ) => Promise<{ bytes: Uint8Array; mime: string }>;
  },
) {
  let contact = await crmDeps.findContactByPhone(accountId, input.fromPhone);
  if (!contact) {
    contact = await crmDeps.createContact(accountId, {
      name: input.fromName ?? input.fromPhone,
      phone: input.fromPhone,
    });
  }

  let conversation = await whatsappRepo.getConversationByPhone(accountId, input.fromPhone);
  if (!conversation) {
    conversation = await whatsappRepo.insertConversation(accountId, {
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: input.fromPhone,
    });
  } else if (conversation.contactId === null) {
    await whatsappRepo.linkConversationContact(accountId, conversation.id, contact.id);
    conversation = { ...conversation, contactId: contact.id };
  }

  const preview =
    input.media && mediaDeps && input.body === ""
      ? mediaPreviewLabel(input.media.type)
      : input.body;

  let message: Message;
  if (input.media && mediaDeps) {
    const tooLarge = input.media.fileLength > MAX_MEDIA_BYTES;
    message = await whatsappRepo.insertMessage(accountId, conversation.id, {
      direction: "inbound",
      body: input.body,
      media: {
        type: input.media.type,
        status: tooLarge ? "too_large" : "expired",
        mime: input.media.mime,
        filename: input.media.filename,
        storagePath: null,
      },
    });
    if (!tooLarge) {
      message = await ingestMediaBytes(
        whatsappRepo,
        mediaDeps.storage,
        mediaDeps.downloadMedia,
        accountId,
        conversation.id,
        message,
        { providerMessageId: input.media.providerMessageId, type: input.media.type, mime: input.media.mime },
      );
    }
  } else {
    message = await whatsappRepo.insertMessage(accountId, conversation.id, {
      direction: "inbound",
      body: input.body,
    });
  }

  await whatsappRepo.touchConversation(accountId, conversation.id, preview, message.sentAt);
  await whatsappRepo.incrementUnreadCount(accountId, conversation.id);

  return message;
}

export interface ImportHistoryResult {
  imported: number;
  skipped: number;
  errors: number;
  hasMore: boolean;
}

export async function importWhatsappHistory(
  whatsappRepo: WhatsappRepository,
  crmDeps: {
    findContactByPhone: (accountId: string, phone: string) => Promise<{ id: string; name: string } | null>;
    createContact: (
      accountId: string,
      input: { name: string; phone: string },
    ) => Promise<{ id: string; name: string }>;
  },
  uazapiDeps: {
    findChats: (accountId: string, limit: number) => Promise<UazapiChat[]>;
    findMessages: (accountId: string, chatId: string, limit: number) => Promise<unknown[]>;
    downloadMedia: (
      accountId: string,
      providerMessageId: string,
    ) => Promise<{ bytes: Uint8Array; mime: string }>;
  },
  storage: WhatsappMediaStorage,
  accountId: string,
  nowIso: string,
): Promise<ImportHistoryResult> {
  const nowMs = Date.parse(nowIso);
  const cutoffMs = nowMs - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const mediaCutoffMs = nowMs - HISTORY_MEDIA_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const allChats = await uazapiDeps.findChats(accountId, HISTORY_MAX_CONVERSATIONS);
  const chats = allChats.filter((c) => !c.isGroup && c.lastMessageTimestampMs >= cutoffMs);

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let processed = 0;
  let hasMore = false;

  for (const chat of chats) {
    let conversation = await whatsappRepo.getConversationByPhone(accountId, chat.phone);
    if (conversation?.historyImportedAt) {
      skipped += 1;
      continue;
    }

    if (processed >= HISTORY_BATCH_SIZE) {
      hasMore = true;
      continue;
    }
    processed += 1;

    try {
      if (!conversation) {
        let contact = await crmDeps.findContactByPhone(accountId, chat.phone);
        if (!contact) {
          contact = await crmDeps.createContact(accountId, { name: chat.name, phone: chat.phone });
        }
        conversation = await whatsappRepo.insertConversation(accountId, {
          contactId: contact.id,
          contactName: contact.name,
          contactPhone: chat.phone,
        });
      }
      const conversationId = conversation.id;
      const priorLastMessageAt = conversation.lastMessageAt;

      const rawMessages = await uazapiDeps.findMessages(
        accountId,
        chat.chatId,
        HISTORY_MAX_MESSAGES_PER_CONVERSATION,
      );

      let newestPreview: string | null = null;
      let newestSentAtMs: number | null = null;

      for (const raw of rawMessages) {
        const mapped = mapUazapiMessage(raw);
        if (!mapped) continue;

        const sentAtMs = mapped.timestampMs ?? nowMs;
        const sentAtIso = new Date(sentAtMs).toISOString();
        const direction: MessageDirection = mapped.fromMe ? "outbound" : "inbound";

        if (mapped.media) {
          const withinMediaWindow = sentAtMs >= mediaCutoffMs;
          const tooLargeByLength = mapped.media.fileLength > MAX_MEDIA_BYTES;
          const attemptDownload = withinMediaWindow && !tooLargeByLength;
          const initialStatus: MediaStatus =
            withinMediaWindow && tooLargeByLength ? "too_large" : "expired";

          let message = await whatsappRepo.insertMessage(accountId, conversationId, {
            direction,
            body: mapped.body,
            sentAt: sentAtIso,
            media: {
              type: mapped.media.type,
              status: initialStatus,
              mime: mapped.media.mime,
              filename: mapped.media.filename,
              storagePath: null,
            },
          });

          if (attemptDownload) {
            message = await ingestMediaBytes(
              whatsappRepo,
              storage,
              uazapiDeps.downloadMedia,
              accountId,
              conversationId,
              message,
              { providerMessageId: mapped.media.providerMessageId, type: mapped.media.type, mime: mapped.media.mime },
            );
          }
        } else {
          await whatsappRepo.insertMessage(accountId, conversationId, {
            direction,
            body: mapped.body,
            sentAt: sentAtIso,
          });
        }

        if (newestSentAtMs === null || sentAtMs > newestSentAtMs) {
          newestSentAtMs = sentAtMs;
          newestPreview =
            mapped.media && mapped.body === "" ? mediaPreviewLabel(mapped.media.type) : mapped.body;
        }
      }

      if (
        newestSentAtMs !== null &&
        newestPreview !== null &&
        (!priorLastMessageAt || newestSentAtMs > Date.parse(priorLastMessageAt))
      ) {
        await whatsappRepo.touchConversation(
          accountId,
          conversationId,
          newestPreview,
          new Date(newestSentAtMs).toISOString(),
        );
      }

      await whatsappRepo.markHistoryImported(accountId, conversationId, nowIso);
      imported += 1;
    } catch (err) {
      console.error("[whatsapp] importação de histórico: erro numa conversa, seguindo", chat.chatId, err);
      errors += 1;
    }
  }

  return { imported, skipped, errors, hasMore };
}

function mediaPreviewLabel(type: MediaType): string {
  return { image: "📷 Imagem", audio: "🎤 Áudio", video: "🎬 Vídeo", document: "📄 Documento" }[type];
}

export function personalizeMessage(template: string, contactName: string): string {
  return template.replaceAll("{{nome}}", contactName);
}

function randomBulkSendDelayMs(): number {
  return 5000 + Math.random() * 5000;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendBulkMessages(
  whatsappRepo: WhatsappRepository,
  provider: WhatsappProvider,
  accountId: string,
  contacts: { id: string; name: string; phone: string }[],
  messageTemplate: string,
  wait: (ms: number) => Promise<void> = waitMs,
  randomDelayMs: () => number = randomBulkSendDelayMs,
): Promise<{ sent: string[]; failed: { contactId: string; error: string }[] }> {
  const sent: string[] = [];
  const failed: { contactId: string; error: string }[] = [];

  for (let i = 0; i < contacts.length; i += 1) {
    const contact = contacts[i];
    try {
      const body = personalizeMessage(messageTemplate, contact.name);

      let conversation = await whatsappRepo.getConversationByPhone(accountId, contact.phone);
      if (!conversation) {
        conversation = await whatsappRepo.insertConversation(accountId, {
          contactId: contact.id,
          contactName: contact.name,
          contactPhone: contact.phone,
        });
      } else if (conversation.contactId === null) {
        await whatsappRepo.linkConversationContact(accountId, conversation.id, contact.id);
      }

      await provider.sendMessage(accountId, contact.phone, body);
      const message = await whatsappRepo.insertMessage(accountId, conversation.id, {
        direction: "outbound",
        body,
      });
      await whatsappRepo.touchConversation(accountId, conversation.id, body, message.sentAt);

      sent.push(contact.id);
    } catch (err) {
      failed.push({
        contactId: contact.id,
        error: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }

    if (i < contacts.length - 1) {
      await wait(randomDelayMs());
    }
  }

  return { sent, failed };
}

export async function getConnectionStatus(provider: WhatsappProvider, accountId: string) {
  return provider.getConnectionStatus(accountId);
}

export async function connectWhatsapp(provider: WhatsappProvider, accountId: string) {
  await provider.connect(accountId);
}

export async function disconnectWhatsapp(provider: WhatsappProvider, accountId: string) {
  await provider.disconnect(accountId);
}

export async function resetUnreadCount(
  repo: WhatsappRepository,
  accountId: string,
  conversationId: string,
) {
  await repo.resetUnreadCount(accountId, conversationId);
}

export function isValidWebhookSecret(
  connection: WhatsappConnection | null,
  providedSecret: string | null,
): boolean {
  const expectedSecret = connection?.config?.webhookSecret;
  if (!expectedSecret) return process.env.NODE_ENV !== "production";
  return providedSecret === expectedSecret;
}

export function parseWebhookPayload(
  body: unknown,
): {
  fromPhone: string;
  fromName?: string;
  body: string;
  media?: {
    providerMessageId: string;
    type: import("./types").MediaType;
    mime: string;
    filename: string | null;
    fileLength: number;
  };
} | null {
  if (typeof body !== "object" || body === null) return null;
  const payload = body as Record<string, unknown>;

  if (payload.EventType === "messages") {
    const message = payload.message;
    if (typeof message !== "object" || message === null) return null;
    const messageData = message as Record<string, unknown>;
    if (messageData.fromMe === true || messageData.isGroup === true) return null;

    const mapped = mapUazapiMessage(messageData);
    if (!mapped || !mapped.senderJid) return null;

    const fromPhone = normalizeWhatsappJid(mapped.senderJid);
    const fromName = mapped.senderName ?? undefined;

    if (mapped.media) {
      return { fromPhone, fromName, body: mapped.body, media: mapped.media };
    }
    return { fromPhone, fromName, body: mapped.body };
  }

  if (payload.event === "messages.upsert") {
    const data = payload.data;
    if (typeof data !== "object" || data === null) return null;
    const eventData = data as Record<string, unknown>;
    const key = eventData.key;
    if (typeof key !== "object" || key === null) return null;
    const keyData = key as Record<string, unknown>;
    if (keyData.fromMe === true) return null;
    if (typeof keyData.remoteJid !== "string" || keyData.remoteJid.endsWith("@g.us")) return null;

    const message = eventData.message;
    const messageObj =
      typeof message === "object" && message !== null ? (message as Record<string, unknown>) : null;
    const extendedText = messageObj?.extendedTextMessage;
    const body =
      typeof messageObj?.conversation === "string"
        ? messageObj.conversation
        : typeof extendedText === "object" && extendedText !== null
          ? (extendedText as Record<string, unknown>).text
          : undefined;
    if (typeof body !== "string") return null;

    return {
      fromPhone: normalizeWhatsappJid(keyData.remoteJid),
      fromName: typeof eventData.pushName === "string" ? eventData.pushName : undefined,
      body,
    };
  }

  if (typeof payload.fromPhone === "string" && typeof payload.body === "string") {
    return {
      fromPhone: payload.fromPhone,
      fromName: typeof payload.fromName === "string" ? payload.fromName : undefined,
      body: payload.body,
    };
  }

  return null;
}
