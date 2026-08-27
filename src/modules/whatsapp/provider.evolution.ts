// DESATIVADO — este provider não está ligado ao app. Mantido no repositório
// para uso futuro. Para religar a Evolution API, veja
// docs/ops/whatsapp-provider-evolution.md.

import type { WhatsappRepository } from "./repository";
import type { WhatsappProvider } from "./provider";
import type { ConnectionStatus, WhatsappConnection } from "./types";

export interface EvolutionProvider extends WhatsappProvider {
  getQrCode(accountId: string): Promise<string | null>;
}

interface EvolutionConfig {
  baseUrl: string;
  instanceName: string;
  apiKey: string;
  webhookSecret: string;
}

function getConfig(connection: WhatsappConnection | null): EvolutionConfig {
  const config = connection?.config;
  if (!config?.baseUrl || !config?.instanceName || !config?.apiKey) {
    throw new Error("Configure a URL do servidor, o nome da instância e a API key da Evolution API antes de conectar");
  }
  return {
    baseUrl: config.baseUrl,
    instanceName: config.instanceName,
    apiKey: config.apiKey,
    webhookSecret: config.webhookSecret ?? "",
  };
}

function mapState(state: string): ConnectionStatus {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  return "disconnected";
}

export function createEvolutionProvider(repo: WhatsappRepository): EvolutionProvider {
  return {
    async connect(accountId) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);
      const headers = { "Content-Type": "application/json", apikey: config.apiKey };

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      await fetch(`${config.baseUrl}/webhook/set/${config.instanceName}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          webhook: {
            url: `${appUrl}/api/whatsapp/webhook/${accountId}?secret=${config.webhookSecret}`,
            events: ["MESSAGES_UPSERT"],
            webhook_by_events: false,
          },
        }),
      }).catch(() => {});

      const stateResponse = await fetch(`${config.baseUrl}/instance/connectionState/${config.instanceName}`, {
        method: "GET",
        headers,
      });

      let qrCode: string | null = null;
      if (!stateResponse.ok && stateResponse.status === 404) {
        const createResponse = await fetch(`${config.baseUrl}/instance/create`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            instanceName: config.instanceName,
            integration: "WHATSAPP-BAILEYS",
            qrcode: true,
          }),
        });
        if (!createResponse.ok) throw new Error("Falha ao criar a instância na Evolution API");
        const data = await createResponse.json();
        qrCode = data.qrcode?.base64 ?? data.qrcode ?? data.base64 ?? data.code ?? null;
      } else {
        const connectResponse = await fetch(`${config.baseUrl}/instance/connect/${config.instanceName}`, {
          method: "GET",
          headers,
        });
        if (!connectResponse.ok) throw new Error("Falha ao conectar com a Evolution API");
        const data = await connectResponse.json();
        qrCode = data.qrcode?.base64 ?? data.qrcode ?? data.base64 ?? data.code ?? null;
      }

      if (qrCode && !qrCode.startsWith("data:")) {
        qrCode = `data:image/png;base64,${qrCode}`;
      }

      await repo.upsertConnectionStatus(accountId, "connecting", null);
      await repo.updateConnectionQrCode(accountId, qrCode);
    },

    async disconnect(accountId) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      await fetch(`${config.baseUrl}/instance/logout/${config.instanceName}`, {
        method: "DELETE",
        headers: { apikey: config.apiKey },
      }).catch(() => {});

      await repo.upsertConnectionStatus(accountId, "disconnected", null);
      await repo.updateConnectionQrCode(accountId, null);
    },

    async getConnectionStatus(accountId) {
      const connection = await repo.getConnection(accountId);
      if (!connection?.config) return "disconnected";
      const config = getConfig(connection);

      const response = await fetch(`${config.baseUrl}/instance/connectionState/${config.instanceName}`, {
        method: "GET",
        headers: { apikey: config.apiKey },
      });
      if (!response.ok) return "disconnected";
      const data = await response.json();
      const mapped = mapState(data.instance?.state ?? "close");

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

      const response = await fetch(`${config.baseUrl}/message/sendText/${config.instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.apiKey },
        body: JSON.stringify({ number: toPhone, text: body }),
      });
      if (!response.ok) throw new Error("Falha ao enviar mensagem pela Evolution API");
      const data = await response.json();
      return { providerMessageId: data.key?.id ?? "" };
    },

    async getQrCode(accountId) {
      const connection = await repo.getConnection(accountId);
      return connection?.qrCode ?? null;
    },
  };
}
