"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  listConversationsAction,
  getConversationMessagesAction,
  logMessageAction,
  startConversationAction,
  getConnectionStatusAction,
  connectWhatsappAction,
  disconnectWhatsappAction,
  resetUnreadCountAction,
  saveUazapiConfigAction,
  getUazapiQrCodeAction,
  getWhatsappConnectionAction,
} from "@/app/(app)/whatsapp/actions";
import type { Conversation, Message } from "@/modules/whatsapp/types";

type WhatsappConnectionSummary = Awaited<ReturnType<typeof getWhatsappConnectionAction>>;

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

function NewConversationDialog({
  onCreated,
}: {
  onCreated: (conversation: Conversation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const conversation = await startConversationAction({
        contactId: null,
        contactName,
        contactPhone,
      });
      setContactName("");
      setContactPhone("");
      setOpen(false);
      onCreated(conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar conversa");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            Nova conversa
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-2">
          <Input
            placeholder="Nome do contato"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
          <Input
            placeholder="Telefone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
          <Button
            onClick={handleCreate}
            disabled={creating || !contactName.trim() || !contactPhone.trim()}
          >
            Criar conversa
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UazapiConfigDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await saveUazapiConfigAction(subdomain.trim(), token.trim());
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">Configurar WhatsApp</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar WhatsApp</DialogTitle>
        </DialogHeader>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-2">
          <Input
            placeholder="Subdomínio (ex: minhaclinica)"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
          />
          <Input
            placeholder="Token da instância"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button onClick={handleSave} disabled={saving || !subdomain.trim() || !token.trim()}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WhatsappClient({ initialConversations }: { initialConversations: Conversation[] }) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [connection, setConnection] = useState<WhatsappConnectionSummary>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [togglingConnection, setTogglingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const refreshConnection = useCallback(async () => {
    const conn = await getWhatsappConnectionAction();
    setConnection(conn);

    let status: string | null = null;
    try {
      status = await getConnectionStatusAction();
    } catch {
      // status check contacts the Uazapi API and may fail independently of the saved config
    }

    if (status === "connecting" && conn?.provider === "uazapi") {
      setQrCode(await getUazapiQrCodeAction());
    } else {
      setQrCode(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches connection status on mount, not deriving state from a prop
    refreshConnection();
  }, [refreshConnection]);

  useEffect(() => {
    const isRealProvider = connection?.provider === "uazapi";
    if (!isRealProvider || connection?.status !== "connecting") return;
    const interval = setInterval(refreshConnection, 3000);
    return () => clearInterval(interval);
  }, [connection?.provider, connection?.status, refreshConnection]);

  async function handleToggleConnection() {
    setTogglingConnection(true);
    setConnectionError(null);
    try {
      if (connection?.status === "connected") {
        await disconnectWhatsappAction();
      } else {
        const result = await connectWhatsappAction();
        if (result.error) {
          setConnectionError(result.error);
          return;
        }
      }
      await refreshConnection();
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : "Erro ao conectar com o WhatsApp");
    } finally {
      setTogglingConnection(false);
    }
  }

  const fetchMessages = useCallback(async (conversationId: string) => {
    const data = await getConversationMessagesAction(conversationId);
    setMessages(data);
    await resetUnreadCountAction(conversationId);
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
    );
  }, []);

  useEffect(() => {
    if (!selectedConversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale messages before fetching the new conversation
      setMessages([]);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    setMessagesError(null);
    (async () => {
      try {
        await fetchMessages(selectedConversationId);
      } catch (err) {
        if (!cancelled) {
          setMessagesError(err instanceof Error ? err.message : "Erro ao carregar mensagens");
        }
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedConversationId, fetchMessages]);

  useEffect(() => {
    if (!selectedConversationId) return;
    const interval = setInterval(() => {
      fetchMessages(selectedConversationId).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedConversationId, fetchMessages]);

  useEffect(() => {
    const interval = setInterval(() => {
      listConversationsAction()
        .then(setConversations)
        .catch(() => {});
      getWhatsappConnectionAction()
        .then(setConnection)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleSend() {
    if (!selectedConversationId || !draft.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const result = await logMessageAction(selectedConversationId, {
        direction: "outbound",
        body: draft.trim(),
      });
      if (!result.ok) {
        setSendError(result.error);
        return;
      }
      setDraft("");
      const updated = await getConversationMessagesAction(selectedConversationId);
      setMessages(updated);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  }

  function handleConversationCreated(conversation: Conversation) {
    setConversations((prev) => [conversation, ...prev]);
    setSelectedConversationId(conversation.id);
  }

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId) ?? null;
  const isConnected = connection?.status === "connected";

  return (
    <div className="space-y-4 px-6 pb-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            className={
              connection?.status === "connected"
                ? "bg-[#25D366]/10 text-[#188a44]"
                : "bg-muted text-muted-foreground"
            }
          >
            {connection?.status === "connected" ? "Conectado" : "Desconectado"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={togglingConnection || !connection?.isConfigured}
            title={!connection?.isConfigured ? "Configure o WhatsApp antes de conectar" : undefined}
            onClick={handleToggleConnection}
          >
            {connection?.status === "connected" ? "Desconectar" : "Conectar"}
          </Button>
          <UazapiConfigDialog onSaved={refreshConnection} />
        </div>
        <NewConversationDialog onCreated={handleConversationCreated} />
      </div>
      {connectionError && <p className="text-sm text-red-600">{connectionError}</p>}
      {qrCode && (
        <div className="flex flex-col items-center gap-2 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">
            Escaneie o QR code no WhatsApp do celular para conectar
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR code is a data: URL from the provider, not an optimizable static asset */}
          <img src={qrCode} alt="QR code de conexão do WhatsApp" className="size-48" />
        </div>
      )}

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
                ) : messagesError ? (
                  <p className="text-sm text-red-600">{messagesError}</p>
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
              {!isConnected && (
                <p className="px-3 pt-2 text-sm text-amber-700">
                  WhatsApp desconectado. Conecte para enviar mensagens.
                </p>
              )}
              {sendError && <p className="px-3 text-sm text-red-600">{sendError}</p>}
              <div className="flex items-center gap-2 border-t p-3">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSend();
                  }}
                  placeholder="Digite uma mensagem"
                  disabled={sending || !isConnected}
                />
                <Button onClick={handleSend} disabled={sending || !draft.trim() || !isConnected}>
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
