import type { WhatsappRepository } from "./repository";
import type { WhatsappProvider } from "./provider";
import type { ConnectionStatus, WhatsappConnection } from "./types";

export interface UazapiProvider extends WhatsappProvider {
  getQrCode(accountId: string): Promise<string | null>;
}

export function normalizeWhatsappJid(jid: string): string {
  return jid.split("@")[0];
}

interface UazapiConfig {
  subdomain: string;
  token: string;
  webhookSecret: string;
}

function getConfig(connection: WhatsappConnection | null): UazapiConfig {
  const config = connection?.config;
  if (!config?.subdomain || !config?.token) {
    throw new Error("Configure o subdomínio e o token da Uazapi antes de conectar");
  }
  return {
    subdomain: config.subdomain,
    token: config.token,
    webhookSecret: config.webhookSecret ?? "",
  };
}

function baseUrl(subdomain: string): string {
  return `https://${subdomain}.uazapi.com`;
}

export function createUazapiProvider(repo: WhatsappRepository): UazapiProvider {
  return {
    async connect(accountId) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      await fetch(`${baseUrl(config.subdomain)}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({
          url: `${appUrl}/api/whatsapp/webhook/${accountId}?secret=${config.webhookSecret}`,
          events: ["messages"],
          excludeMessages: ["wasSentByApi"],
        }),
      });

      const response = await fetch(`${baseUrl(config.subdomain)}/instance/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("Falha ao conectar com a Uazapi");
      const data = await response.json();

      await repo.upsertConnectionStatus(accountId, "connecting", null);
      await repo.updateConnectionQrCode(accountId, data.qrcode ?? data.qrCode ?? null);
    },

    async disconnect(accountId) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      await fetch(`${baseUrl(config.subdomain)}/instance/disconnect`, {
        method: "POST",
        headers: { token: config.token },
      });

      await repo.upsertConnectionStatus(accountId, "disconnected", null);
      await repo.updateConnectionQrCode(accountId, null);
    },

    async getConnectionStatus(accountId) {
      const connection = await repo.getConnection(accountId);
      if (!connection?.config) return "disconnected";
      const config = getConfig(connection);

      const response = await fetch(`${baseUrl(config.subdomain)}/instance/status`, {
        method: "GET",
        headers: { token: config.token },
      });
      if (!response.ok) return "disconnected";
      const data = await response.json();
      const rawStatus: string = data.status ?? "disconnected";
      const mapped: ConnectionStatus = rawStatus === "hibernated" ? "disconnected" : (rawStatus as ConnectionStatus);

      await repo.upsertConnectionStatus(
        accountId,
        mapped,
        mapped === "connected" ? new Date().toISOString() : null,
      );
      if (mapped === "connected") await repo.updateConnectionQrCode(accountId, null);
      return mapped;
    },

    async sendMessage(accountId, toPhone, body) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      const response = await fetch(`${baseUrl(config.subdomain)}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({ number: toPhone, text: body }),
      });
      if (!response.ok) throw new Error("Falha ao enviar mensagem pela Uazapi");
      const data = await response.json();
      return { providerMessageId: data.id ?? data.messageid ?? "" };
    },

    async getQrCode(accountId) {
      const connection = await repo.getConnection(accountId);
      return connection?.qrCode ?? null;
    },
  };
}
