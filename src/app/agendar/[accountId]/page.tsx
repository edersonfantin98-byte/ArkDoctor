import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { getCurrentAccountName } from "@/lib/supabase/account";
import { listPublicProceduresAction } from "@/app/agendar/actions";
import { PublicBookingWizard } from "@/components/agendamento/public-booking-wizard";

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const supabase = createServiceRoleSupabaseClient();

  let accountName: string;
  try {
    accountName = await getCurrentAccountName(supabase, accountId);
  } catch {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-center text-muted-foreground">Link inválido ou expirado.</p>
      </div>
    );
  }

  const procedures = await listPublicProceduresAction(accountId);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 space-y-1.5 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{accountName}</h1>
        <p className="text-sm text-muted-foreground">Escolha o procedimento, o dia e o horário.</p>
      </div>
      <PublicBookingWizard accountId={accountId} procedures={procedures} />
    </div>
  );
}
