import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId, getCurrentAccountName } from "@/lib/supabase/account";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const accountId = await getCurrentAccountId(supabase);
  const accountName = await getCurrentAccountName(supabase, accountId);

  const userEmail = user?.email ?? "";

  return (
    <div className="flex h-dvh flex-col lg:flex-row print:h-auto">
      <Sidebar userEmail={userEmail} accountName={accountName} />
      <MobileNav userEmail={userEmail} accountName={accountName} />
      <main className="min-w-0 flex-1 overflow-y-auto bg-background print:overflow-visible">{children}</main>
    </div>
  );
}
