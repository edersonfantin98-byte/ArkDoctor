import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId, getCurrentAccountName } from "@/lib/supabase/account";
import { Sidebar } from "@/components/layout/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountId = await getCurrentAccountId(supabase);
  const accountName = await getCurrentAccountName(supabase, accountId);

  return (
    <div className="flex h-screen">
      <Sidebar userEmail={user?.email ?? ""} accountName={accountName} />
      <main className="min-w-0 flex-1 overflow-y-auto bg-background">{children}</main>
    </div>
  );
}
