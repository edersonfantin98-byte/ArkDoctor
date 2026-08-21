"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getConversationMessagesAction,
  logMessageAction,
} from "@/app/(app)/whatsapp/actions";
import type { Conversation, Message } from "@/modules/whatsapp/types";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatRelativeTime(date: string | null) {
  if (!date) return "";
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
}

export function WhatsappClient({ initialConversations }: { initialConversations: Conversation[] }) {
  const [conversations] = useState(initialConversations);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    getConversationMessagesAction(selectedConversationId)
      .then((data) => {
        if (!cancelled) setMessages(data);
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedConversationId]);

  async function handleSend() {
    if (!selectedConversationId || !draft.trim() || sending) return;
    setSending(true);
    try {
      await logMessageAction(selectedConversationId, {
        direction: "outbound",
        body: draft.trim(),
      });
      setDraft("");
      const updated = await getConversationMessagesAction(selectedConversationId);
      setMessages(updated);
    } finally {
      setSending(false);
    }
  }

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId) ?? null;

  return (
    <div className="space-y-4 px-6 pb-6">
      <Badge className="bg-[#25D366]/10 text-[#188a44]">Conectado</Badge>

      <div className="grid grid-cols-1 overflow-hidden rounded-xl ring-1 ring-foreground/10 md:grid-cols-[320px_1fr]">
        <div className="flex flex-col border-b md:border-b-0 md:border-r">
          {conversations.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
          ) : (
            <ul className="divide-y overflow-y-auto">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50",
                      conversation.id === selectedConversationId && "bg-muted",
                    )}
                  >
                    <Avatar>
                      <AvatarFallback>{initials(conversation.contactName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{conversation.contactName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRelativeTime(conversation.lastMessageAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                          {conversation.lastMessagePreview}
                        </span>
                        {conversation.unreadCount > 0 && (
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-xs font-medium text-white">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col">
          {selectedConversation ? (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {messagesLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando mensagens...</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        message.direction === "outbound" ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm",
                          message.direction === "outbound" ? "bg-[#d9fdd3]" : "bg-white",
                        )}
                      >
                        {message.body}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2 border-t p-3">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSend();
                  }}
                  placeholder="Digite uma mensagem"
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={sending || !draft.trim()}>
                  Enviar
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-4">
              <p className="text-sm text-muted-foreground">Selecione uma conversa para ver as mensagens.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
