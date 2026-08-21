import type { WhatsappRepository } from "./repository";
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
  accountId: string,
  conversationId: string,
  rawInput: unknown,
) {
  const input = logMessageInputSchema.parse(rawInput);
  const conversation = await repo.getConversation(accountId, conversationId);
  if (!conversation) throw new Error("Conversa não encontrada");
  const message = await repo.insertMessage(accountId, conversationId, input);
  await repo.touchConversation(accountId, conversationId, input.body, message.sentAt);
  return message;
}
