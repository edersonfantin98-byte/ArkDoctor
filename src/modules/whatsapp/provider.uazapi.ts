import type { WhatsappRepository } from "./repository";
import type { WhatsappProvider } from "./provider";
import type { ConnectionStatus, WhatsappConnection, MediaType } from "./types";

export interface UazapiChat {
  chatId: string;
  phone: string;
  name: string;
  isGroup: boolean;
  lastMessageTimestampMs: number;
}

export interface UazapiProvider extends WhatsappProvider {
  getQrCode(accountId: string): Promise<string | null>;
  downloadMedia(
    accountId: string,
    providerMessageId: string,
  ): Promise<{ bytes: Uint8Array; mime: string }>;
  sendMedia(
    accountId: string,
    toPhone: string,
    input: { type: MediaType; dataBase64: string; filename: string | null; caption: string },
  ): Promise<{ providerMessageId: string }>;
  findChats(accountId: string, limit: number): Promise<UazapiChat[]>;
  findMessages(accountId: string, chatId: string, limit: number): Promise<unknown[]>;
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

function mapUazapiStatus(rawStatus: string | undefined): ConnectionStatus {
  if (!rawStatus || rawStatus === "hibernated") return "disconnected";
  return rawStatus as ConnectionStatus;
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
          enabled: true,
        }),
      }).catch(() => {});

      const response = await fetch(`${baseUrl(config.subdomain)}/instance/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Falha ao conectar com a Uazapi (${response.status}) em ${response.url}: ${detail}`,
        );
      }
      const data = await response.json();

      const mapped = mapUazapiStatus(data.instance?.status);
      await repo.upsertConnectionStatus(
        accountId,
        mapped,
        mapped === "connected" ? new Date().toISOString() : null,
      );
      await repo.updateConnectionQrCode(
        accountId,
        mapped === "connected" ? null : data.instance?.qrcode || data.instance?.qrCode || null,
      );
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
      const mapped = mapUazapiStatus(data.instance?.status);

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

    async downloadMedia(accountId, providerMessageId) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      const meta = await fetch(`${baseUrl(config.subdomain)}/message/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({ id: providerMessageId }),
      });
      const metaJson = meta.ok ? await meta.json().catch(() => null) : null;
      const fileUrl = metaJson?.fileURL;
      if (typeof fileUrl !== "string" || !fileUrl) {
        throw new Error("Falha ao baixar mídia: a Uazapi não devolveu fileURL");
      }
      const mime =
        typeof metaJson?.mimetype === "string" ? metaJson.mimetype : "application/octet-stream";

      const file = await fetch(fileUrl);
      if (!file.ok) throw new Error(`Falha ao baixar mídia: arquivo (${file.status})`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { bytes, mime };
    },

    async sendMedia(accountId, toPhone, input) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      const body: Record<string, string> = {
        number: toPhone,
        type: input.type,
        file: input.dataBase64,
        text: input.caption,
      };
      if (input.type === "document" && input.filename) body.docName = input.filename;

      const response = await fetch(`${baseUrl(config.subdomain)}/send/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(
          detail && typeof detail.error === "string"
            ? `Falha ao enviar mídia pela Uazapi: ${detail.error}`
            : "Falha ao enviar mídia pela Uazapi",
        );
      }
      const data = await response.json();
      return { providerMessageId: data.messageid ?? data.id ?? "" };
    },

    async findChats(accountId, limit) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      const response = await fetch(`${baseUrl(config.subdomain)}/chat/find`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({ sort: "-wa_lastMsgTimestamp", limit, offset: 0, wa_isGroup: false }),
      });
      if (!response.ok) {
        throw new Error(`Falha ao listar conversas na Uazapi (${response.status})`);
      }
      const data = await response.json();
      const chats = Array.isArray(data?.chats) ? (data.chats as Record<string, unknown>[]) : [];

      return chats
        .filter((c) => c.wa_isGroup !== true && typeof c.wa_chatid === "string")
        .map((c) => {
          const chatId = c.wa_chatid as string;
          const name =
            (typeof c.wa_contactName === "string" && c.wa_contactName) ||
            (typeof c.wa_name === "string" && c.wa_name) ||
            (typeof c.name === "string" && c.name) ||
            normalizeWhatsappJid(chatId);
          return {
            chatId,
            phone: normalizeWhatsappJid(chatId),
            name,
            isGroup: false,
            lastMessageTimestampMs:
              typeof c.wa_lastMsgTimestamp === "number" ? c.wa_lastMsgTimestamp : 0,
          };
        });
    },

    async findMessages(accountId, chatId, limit) {
      const connection = await repo.getConnection(accountId);
      const config = getConfig(connection);

      const response = await fetch(`${baseUrl(config.subdomain)}/message/find`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: config.token },
        body: JSON.stringify({ chatid: chatId, limit }),
      });
      if (!response.ok) {
        throw new Error(`Falha ao listar mensagens na Uazapi (${response.status})`);
      }
      const data = await response.json();
      return Array.isArray(data?.messages) ? data.messages : [];
    },
  };
}
