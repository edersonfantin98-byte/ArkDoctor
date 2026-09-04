import type { WhatsappRepository } from "./repository";
import type { Conversation, Message, WhatsappConnection } from "./types";

export function createInMemoryWhatsappRepository(): WhatsappRepository {
  const conversations = new Map<string, Conversation>();
  const messages = new Map<string, Message>();
  const connections = new Map<string, WhatsappConnection>();

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
        historyImportedAt: null,
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
        sentAt: input.sentAt ?? new Date().toISOString(),
        mediaType: input.media?.type ?? null,
        mediaStatus: input.media?.status ?? null,
        mediaStoragePath: input.media?.storagePath ?? null,
        mediaMime: input.media?.mime ?? null,
        mediaFilename: input.media?.filename ?? null,
      };
      messages.set(id, message);
      return message;
    },

    async updateMessageMedia(accountId, messageId, patch) {
      const m = messages.get(messageId);
      if (!m || m.accountId !== accountId) return;
      messages.set(messageId, {
        ...m,
        mediaStatus: patch.status,
        mediaStoragePath: patch.storagePath,
      });
    },

    async listStoredMediaOlderThan(cutoffIso) {
      return [...messages.values()]
        .filter(
          (m) =>
            m.mediaStatus === "stored" &&
            m.mediaStoragePath !== null &&
            m.sentAt < cutoffIso,
        )
        .map((m) => ({
          id: m.id,
          accountId: m.accountId,
          mediaStoragePath: m.mediaStoragePath as string,
        }));
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

    async linkConversationContact(accountId, conversationId, contactId) {
      const c = conversations.get(conversationId);
      if (!c || c.accountId !== accountId) return;
      conversations.set(conversationId, { ...c, contactId });
    },

    async markHistoryImported(accountId, conversationId, importedAtIso) {
      const c = conversations.get(conversationId);
      if (!c || c.accountId !== accountId) return;
      conversations.set(conversationId, { ...c, historyImportedAt: importedAtIso });
    },

    async getConnection(accountId) {
      return connections.get(accountId) ?? null;
    },

    async upsertConnectionStatus(accountId, status, connectedAt) {
      const existing = connections.get(accountId);
      const connection: WhatsappConnection = {
        accountId,
        provider: existing?.provider ?? "fake",
        status,
        connectedAt,
        qrCode: existing?.qrCode ?? null,
        config: existing?.config ?? null,
      };
      connections.set(accountId, connection);
      return connection;
    },

    async updateConnectionConfig(accountId, provider, config) {
      const existing = connections.get(accountId);
      const connection: WhatsappConnection = {
        accountId,
        provider,
        status: existing?.status ?? "disconnected",
        connectedAt: existing?.connectedAt ?? null,
        qrCode: existing?.qrCode ?? null,
        config,
      };
      connections.set(accountId, connection);
      return connection;
    },

    async updateConnectionQrCode(accountId, qrCode) {
      const existing = connections.get(accountId);
      const connection: WhatsappConnection = {
        accountId,
        provider: existing?.provider ?? "fake",
        status: existing?.status ?? "disconnected",
        connectedAt: existing?.connectedAt ?? null,
        qrCode,
        config: existing?.config ?? null,
      };
      connections.set(accountId, connection);
      return connection;
    },
  };
}
