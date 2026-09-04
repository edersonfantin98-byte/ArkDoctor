import type { MediaType } from "./types";
import { mediaTypeFromUazapi } from "./media";

export interface MappedUazapiMessage {
  fromMe: boolean;
  body: string;
  timestampMs: number | null;
  senderJid: string | null;
  senderName: string | null;
  media: {
    providerMessageId: string;
    type: MediaType;
    mime: string;
    filename: string | null;
    fileLength: number;
  } | null;
}

/**
 * Extrai os campos comuns de um objeto de mensagem da Uazapi. O mesmo shape
 * aparece tanto no `message` do webhook (`{EventType:"messages", message}`)
 * quanto em cada item de `/message/find` — validado ao vivo em
 * docs/ops/whatsapp-payloads-capturados-2026-09-03.md.
 *
 * Não decide direção de conversa nem valida `isGroup` — isso fica a cargo de
 * cada chamador (o webhook já filtra `isGroup`/`fromMe` antes de chamar; a
 * importação de histórico filtra grupo no nível do chat, não da mensagem).
 */
export function mapUazapiMessage(raw: unknown): MappedUazapiMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;

  const fromMe = data.fromMe === true;
  const senderJid =
    typeof data.sender_pn === "string"
      ? data.sender_pn
      : typeof data.sender === "string"
        ? data.sender
        : null;
  const senderName = typeof data.senderName === "string" ? data.senderName : null;
  const timestampMs = typeof data.messageTimestamp === "number" ? data.messageTimestamp : null;

  const content =
    typeof data.content === "object" && data.content !== null
      ? (data.content as Record<string, unknown>)
      : {};
  const mediaType =
    typeof data.messageType === "string" ? mediaTypeFromUazapi(data.messageType) : null;

  if (mediaType) {
    const mime =
      typeof content.mimetype === "string" ? content.mimetype : "application/octet-stream";
    const caption =
      typeof content.caption === "string"
        ? content.caption
        : typeof data.text === "string"
          ? data.text
          : "";
    const filename =
      mediaType === "document" && typeof content.fileName === "string" ? content.fileName : null;
    const providerMessageId = typeof data.messageid === "string" ? data.messageid : "";
    const fileLength = typeof content.fileLength === "number" ? content.fileLength : 0;
    return {
      fromMe,
      body: caption,
      timestampMs,
      senderJid,
      senderName,
      media: { providerMessageId, type: mediaType, mime, filename, fileLength },
    };
  }

  if (typeof data.text !== "string") return null;
  return { fromMe, body: data.text, timestampMs, senderJid, senderName, media: null };
}
