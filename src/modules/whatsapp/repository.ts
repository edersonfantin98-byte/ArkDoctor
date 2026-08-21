import type { Conversation, Message } from "./types";

export interface WhatsappRepository {
  listConversations(accountId: string): Promise<Conversation[]>;
  getConversation(accountId: string, conversationId: string): Promise<Conversation | null>;
  insertConversation(
    accountId: string,
    input: { contactId: string | null; contactName: string; contactPhone: string },
  ): Promise<Conversation>;
  listMessages(accountId: string, conversationId: string): Promise<Message[]>;
  insertMessage(
    accountId: string,
    conversationId: string,
    input: { direction: "inbound" | "outbound"; body: string },
  ): Promise<Message>;
  touchConversation(
    accountId: string,
    conversationId: string,
    lastMessagePreview: string,
    lastMessageAt: string,
  ): Promise<void>;
}
