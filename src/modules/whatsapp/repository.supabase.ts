import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WhatsappRepository } from "./repository";
import type { Conversation, Message, MessageDirection } from "./types";

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
  };
}
