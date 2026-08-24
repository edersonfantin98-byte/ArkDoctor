import type { WhatsappRepository } from "./repository";
import type { WhatsappProvider } from "./provider";
import { startConversationInputSchema, logMessageInputSchema } from "./schemas";
import { normalizeWhatsappJid } from "./provider.uazapi";
import type { WhatsappConnection } from "./types";
import { parseOrThrow } from "@/lib/zod-error";

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
) {
  const input = parseOrThrow(logMessageInputSchema, rawInput);
  const conversation = await repo.getConversation(accountId, conversationId);
  if (!conversation) throw new Error("Conversa não encontrada");

  if (input.direction === "outbound") {
    await provider.sendMessage(accountId, conversation.contactPhone, input.body);
  }

  const message = await repo.insertMessage(accountId, conversationId, input);
  await repo.touchConversation(accountId, conversationId, input.body, message.sentAt);
  return message;
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
  input: { fromPhone: string; fromName?: string; body: string },
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

  const message = await whatsappRepo.insertMessage(accountId, conversation.id, {
    direction: "inbound",
    body: input.body,
  });
  await whatsappRepo.touchConversation(accountId, conversation.id, input.body, message.sentAt);
  await whatsappRepo.incrementUnreadCount(accountId, conversation.id);

  return message;
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
): { fromPhone: string; fromName?: string; body: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const payload = body as Record<string, unknown>;

  if (payload.event === "messages") {
    const data = payload.data;
    if (typeof data !== "object" || data === null) return null;
    const eventData = data as Record<string, unknown>;
    if (eventData.fromMe === true || eventData.isGroup === true) return null;
    if (typeof eventData.sender !== "string" || typeof eventData.text !== "string") return null;
    return {
      fromPhone: normalizeWhatsappJid(eventData.sender),
      fromName: typeof eventData.senderName === "string" ? eventData.senderName : undefined,
      body: eventData.text,
    };
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
