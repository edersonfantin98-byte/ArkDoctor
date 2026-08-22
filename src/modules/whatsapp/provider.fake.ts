import type { WhatsappRepository } from "./repository";
import type { WhatsappProvider } from "./provider";

export function createFakeWhatsappProvider(repo: WhatsappRepository): WhatsappProvider {
  return {
    async connect(accountId) {
      await repo.upsertConnectionStatus(accountId, "connected", new Date().toISOString());
    },

    async disconnect(accountId) {
      await repo.upsertConnectionStatus(accountId, "disconnected", null);
    },

    async getConnectionStatus(accountId) {
      const connection = await repo.getConnection(accountId);
      return connection?.status ?? "disconnected";
    },

    async sendMessage(_accountId, _toPhone, _body) {
      return { providerMessageId: crypto.randomUUID() };
    },
  };
}
