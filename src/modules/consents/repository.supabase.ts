import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ConsentsRepository } from "./repository";
import type { ConsentKind, SignedVia } from "./schemas";
import type { SignedConsent } from "./types";

function throwDbError(error: PostgrestError): never {
  console.error("[consents/repository.supabase]", error);
  throw new Error("Erro ao acessar o banco de dados. Tente novamente.");
}

function toConsent(row: Database["public"]["Tables"]["signed_consents"]["Row"]): SignedConsent {
  return {
    id: row.id,
    accountId: row.account_id,
    contactId: row.contact_id,
    kind: row.kind as ConsentKind,
    storagePath: row.storage_path,
    signerName: row.signer_name,
    signedVia: row.signed_via as SignedVia,
    signedAt: row.signed_at,
    createdAt: row.created_at,
  };
}

export function createSupabaseConsentsRepository(
  supabase: SupabaseClient<Database>,
): ConsentsRepository {
  return {
    async insertConsent(accountId, input) {
      const { data, error } = await supabase
        .from("signed_consents")
        .insert({
          account_id: accountId,
          contact_id: input.contactId,
          kind: input.kind,
          storage_path: input.storagePath,
          signer_name: input.signerName,
          signed_via: input.signedVia,
        })
        .select("*")
        .single();
      if (error) throwDbError(error);
      return toConsent(data);
    },

    async listConsentsForContact(accountId, contactId) {
      const { data, error } = await supabase
        .from("signed_consents")
        .select("*")
        .eq("account_id", accountId)
        .eq("contact_id", contactId)
        .order("signed_at", { ascending: false });
      if (error) throwDbError(error);
      return data.map(toConsent);
    },

    async getConsent(accountId, id) {
      const { data, error } = await supabase
        .from("signed_consents")
        .select("*")
        .eq("account_id", accountId)
        .eq("id", id)
        .maybeSingle();
      if (error) throwDbError(error);
      return data ? toConsent(data) : null;
    },

    async deleteConsent(accountId, id) {
      const { error } = await supabase
        .from("signed_consents")
        .delete()
        .eq("account_id", accountId)
        .eq("id", id);
      if (error) throwDbError(error);
    },
  };
}
