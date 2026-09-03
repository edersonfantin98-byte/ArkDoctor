import type { MediaType } from "./types";

export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

const UAZAPI_MESSAGE_TYPE: Record<string, MediaType> = {
  ImageMessage: "image",
  AudioMessage: "audio",
  VideoMessage: "video",
  DocumentMessage: "document",
};

export function mediaTypeFromUazapi(messageType: string): MediaType | null {
  return UAZAPI_MESSAGE_TYPE[messageType] ?? null;
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

export function extFromMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (MIME_EXT[base]) return MIME_EXT[base];
  const afterSlash = base.split("/")[1];
  return afterSlash && /^[a-z0-9.+-]+$/.test(afterSlash) ? afterSlash : "bin";
}

export function safeContentType(type: MediaType, providerMime: string): string {
  const mime = providerMime.trim();
  switch (type) {
    case "image":
      return mime.startsWith("image/") ? mime : "application/octet-stream";
    case "audio":
      return mime.startsWith("audio/") ? mime : "application/octet-stream";
    case "video":
      return mime.startsWith("video/") ? mime : "application/octet-stream";
    case "document":
      return mime || "application/octet-stream";
  }
}

export function storagePathFor(
  accountId: string,
  conversationId: string,
  messageId: string,
  mime: string,
): string {
  return `${accountId}/${conversationId}/${messageId}.${extFromMime(mime)}`;
}

export function mediaTypeFromMime(mime: string): MediaType {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("audio/")) return "audio";
  if (base.startsWith("video/")) return "video";
  return "document";
}
