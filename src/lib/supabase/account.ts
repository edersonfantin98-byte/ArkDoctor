import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export async function getCurrentAccountId(
  supabase: SupabaseClient<Database>,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("account_users")
    .select("account_id")
    .eq("user_id", user.id)
    .single();
  if (error) throw error;

  return data.account_id;
}

export async function getCurrentAccountName(
  supabase: SupabaseClient<Database>,
  accountId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("accounts")
    .select("name")
    .eq("id", accountId)
    .single();
  if (error) throw error;

  return data.name;
}

export async function getAccountProfessionalIdentity(
  supabase: SupabaseClient<Database>,
  accountId: string,
): Promise<{ name: string; professionalName: string | null; councilId: string | null }> {
  const { data, error } = await supabase
    .from("accounts")
    .select("name, professional_name, professional_council_id")
    .eq("id", accountId)
    .single();
  if (error) throw error;
  return {
    name: data.name,
    professionalName: data.professional_name,
    councilId: data.professional_council_id,
  };
}
