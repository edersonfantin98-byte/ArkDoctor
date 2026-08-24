import { getDashboardOverviewAction } from "./actions";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { ExportReportButton } from "@/components/dashboard/export-report-button";
import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId, getCurrentAccountName } from "@/lib/supabase/account";

export default async function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const overview = await getDashboardOverviewAction(today);

  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);
  const accountName = await getCurrentAccountName(supabase, accountId);

  return (
    <div>
      <PageHeader
        title="Visão geral"
        description="Desempenho da clínica no mês atual."
        action={<ExportReportButton />}
      />
      <DashboardClient overview={overview} todayIso={today} accountName={accountName} />
    </div>
  );
}
