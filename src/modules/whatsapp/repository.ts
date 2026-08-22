import type { Conversation, Message, WhatsappConnection, ConnectionStatus } from "./types";

export interface WhatsappRepository {
  listConversations(accountId: string): Promise<Conversation[]>;
  getConversation(accountId: string, conversationId: string): Promise<Conversation | null>;
  insertConversation(
    accountId: string,
    input: { contactId: string | null; contactName: string; contactPhone: string },
  ): Promise<Conversation>;
  getConversationByPhone(accountId: string, phone: string): Promise<Conversation | null>;
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
  incrementUnreadCount(accountId: string, conversationId: string): Promise<void>;
  resetUnreadCount(accountId: string, conversationId: string): Promise<void>;
  getConnection(accountId: string): Promise<WhatsappConnection | null>;
  upsertConnectionStatus(
    accountId: string,
    status: ConnectionStatus,
    connectedAt: string | null,
  ): Promise<WhatsappConnection>;
}
