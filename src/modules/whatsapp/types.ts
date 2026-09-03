export interface Conversation {
  id: string;
  accountId: string;
  contactId: string | null;
  contactName: string;
  contactPhone: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
  historyImportedAt: string | null;
}

export type MessageDirection = "inbound" | "outbound";

export type MediaType = "image" | "audio" | "video" | "document";
export type MediaStatus = "stored" | "too_large" | "expired";

export interface Message {
  id: string;
  conversationId: string;
  accountId: string;
  direction: MessageDirection;
  body: string;
  sentAt: string;
  mediaType: MediaType | null;
  mediaStatus: MediaStatus | null;
  mediaStoragePath: string | null;
  mediaMime: string | null;
  mediaFilename: string | null;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface WhatsappConnection {
  accountId: string;
  provider: string;
  status: ConnectionStatus;
  connectedAt: string | null;
  qrCode: string | null;
  config: Record<string, string> | null;
}
