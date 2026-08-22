import type { WhatsappRepository } from "./repository";
import type { Conversation, Message } from "./types";

export function createInMemoryWhatsappRepository(): WhatsappRepository {
  const conversations = new Map<string, Conversation>();
  const messages = new Map<string, Message>();

  return {
    async listConversations(accountId) {
      return [...conversations.values()]
        .filter((c) => c.accountId === accountId)
        .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
    },

    async getConversation(accountId, conversationId) {
      const c = conversations.get(conversationId);
      return c && c.accountId === accountId ? c : null;
    },

    async insertConversation(accountId, input) {
      const id = crypto.randomUUID();
      const conversation: Conversation = {
        id,
        accountId,
        contactId: input.contactId,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        lastMessagePreview: null,
        lastMessageAt: null,
        unreadCount: 0,
        createdAt: new Date().toISOString(),
      };
      conversations.set(id, conversation);
      return conversation;
    },

    async getConversationByPhone(accountId, phone) {
      return (
        [...conversations.values()].find(
          (c) => c.accountId === accountId && c.contactPhone === phone,
        ) ?? null
      );
    },

    async listMessages(accountId, conversationId) {
      return [...messages.values()]
        .filter((m) => m.accountId === accountId && m.conversationId === conversationId)
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    },

    async insertMessage(accountId, conversationId, input) {
      const id = crypto.randomUUID();
      const message: Message = {
        id,
        conversationId,
        accountId,
        direction: input.direction,
        body: input.body,
        sentAt: new Date().toISOString(),
      };
      messages.set(id, message);
      return message;
    },

    async touchConversation(accountId, conversationId, lastMessagePreview, lastMessageAt) {
      const c = conversations.get(conversationId);
      if (!c || c.accountId !== accountId) return;
      conversations.set(conversationId, { ...c, lastMessagePreview, lastMessageAt });
    },

    async incrementUnreadCount(accountId, conversationId) {
      const c = conversations.get(conversationId);
      if (!c || c.accountId !== accountId) return;
      conversations.set(conversationId, { ...c, unreadCount: c.unreadCount + 1 });
    },

    async resetUnreadCount(accountId, conversationId) {
      const c = conversations.get(conversationId);
      if (!c || c.accountId !== accountId) return;
      conversations.set(conversationId, { ...c, unreadCount: 0 });
    },
  };
}
