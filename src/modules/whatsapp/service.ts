import type { WhatsappRepository } from "./repository";
import type { WhatsappProvider } from "./provider";
import { startConversationInputSchema, logMessageInputSchema } from "./schemas";

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
  const input = startConversationInputSchema.parse(rawInput);
  return repo.insertConversation(accountId, input);
}

export async function logMessage(
  repo: WhatsappRepository,
  provider: WhatsappProvider,
  accountId: string,
  conversationId: string,
  rawInput: unknown,
) {
  const input = logMessageInputSchema.parse(rawInput);
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
  }

  const message = await whatsappRepo.insertMessage(accountId, conversation.id, {
    direction: "inbound",
    body: input.body,
  });
  await whatsappRepo.touchConversation(accountId, conversation.id, input.body, message.sentAt);
  await whatsappRepo.incrementUnreadCount(accountId, conversation.id);

  return message;
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
