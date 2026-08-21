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
}

export type MessageDirection = "inbound" | "outbound";

export interface Message {
  id: string;
  conversationId: string;
  accountId: string;
  direction: MessageDirection;
  body: string;
  sentAt: string;
}
