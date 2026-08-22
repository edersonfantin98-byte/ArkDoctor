import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WhatsappRepository } from "./repository";
import type { Conversation, Message, MessageDirection, WhatsappConnection, ConnectionStatus } from "./types";

function throwDbError(error: PostgrestError): never {
  console.error("[whatsapp/repository.supabase]", error);
  throw new Error("Erro ao acessar o banco de dados. Tente novamente.");
}

function toConversation(
  row: Database["public"]["Tables"]["whatsapp_conversations"]["Row"],
): Conversation {
  return {
    id: row.id,
    accountId: row.account_id,
    contactId: row.contact_id,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    createdAt: row.created_at,
  };
}

function toMessage(
  row: Database["public"]["Tables"]["whatsapp_messages"]["Row"],
): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    accountId: row.account_id,
    direction: row.direction as MessageDirection,
    body: row.body,
    sentAt: row.sent_at,
  };
}

function toConnection(
  row: Database["public"]["Tables"]["whatsapp_connections"]["Row"],
): WhatsappConnection {
  return {
    accountId: row.account_id,
    provider: row.provider,
    status: row.status as ConnectionStatus,
    connectedAt: row.connected_at,
  };
}

export function createSupabaseWhatsappRepository(
  supabase: SupabaseClient<Database>,
): WhatsappRepository {
  return {
    async listConversations(accountId) {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("account_id", accountId)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throwDbError(error);
      return data.map(toConversation);
    },

    async getConversation(accountId, conversationId) {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toConversation(data) : null;
    },

    async insertConversation(accountId, input) {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .insert({
          account_id: accountId,
          contact_id: input.contactId,
          contact_name: input.contactName,
          contact_phone: input.contactPhone,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toConversation(data);
    },

    async getConversationByPhone(accountId, phone) {
      // contact_phone has no unique constraint, so pick the oldest row
      // deterministically instead of using .maybeSingle() directly (which
      // throws on duplicates).
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_phone", phone)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toConversation(data) : null;
    },

    async listMessages(accountId, conversationId) {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("account_id", accountId)
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: true });
      if (error) throwDbError(error);
      return data.map(toMessage);
    },

    async insertMessage(accountId, conversationId, input) {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .insert({
          account_id: accountId,
          conversation_id: conversationId,
          direction: input.direction,
          body: input.body,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toMessage(data);
    },

    async touchConversation(accountId, conversationId, lastMessagePreview, lastMessageAt) {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({
          last_message_preview: lastMessagePreview,
          last_message_at: lastMessageAt,
        })
        .eq("account_id", accountId)
        .eq("id", conversationId);
      if (error) throwDbError(error);
    },

    async incrementUnreadCount(accountId, conversationId) {
      const { data: current, error: fetchError } = await supabase
        .from("whatsapp_conversations")
        .select("unread_count")
        .eq("account_id", accountId)
        .eq("id", conversationId)
        .maybeSingle();
      if (fetchError) throwDbError(fetchError);
      if (!current) return;
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ unread_count: current.unread_count + 1 })
        .eq("account_id", accountId)
        .eq("id", conversationId);
      if (error) throwDbError(error);
    },

    async resetUnreadCount(accountId, conversationId) {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ unread_count: 0 })
        .eq("account_id", accountId)
        .eq("id", conversationId);
      if (error) throwDbError(error);
    },

    async linkConversationContact(accountId, conversationId, contactId) {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ contact_id: contactId })
        .eq("account_id", accountId)
        .eq("id", conversationId);
      if (error) throwDbError(error);
    },

    async getConnection(accountId) {
      const { data, error } = await supabase
        .from("whatsapp_connections")
        .select("*")
        .eq("account_id", accountId)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toConnection(data) : null;
    },

    async upsertConnectionStatus(accountId, status, connectedAt) {
      const { data, error } = await supabase
        .from("whatsapp_connections")
        .upsert(
          { account_id: accountId, status, connected_at: connectedAt },
          { onConflict: "account_id" },
        )
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toConnection(data);
    },
  };
}
