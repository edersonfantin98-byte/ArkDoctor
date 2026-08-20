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
