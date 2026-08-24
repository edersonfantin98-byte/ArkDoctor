import { PageHeader } from "@/components/layout/page-header";
import { BookingWizard } from "@/components/agendamento/booking-wizard";
import { CopyBookingLinkButton } from "@/components/agendamento/copy-booking-link-button";
import { listProceduresAction } from "@/app/(app)/agenda/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentAccountId } from "@/lib/supabase/account";

export default async function AgendamentoPage() {
  const procedures = await listProceduresAction();
  const supabase = await createServerSupabaseClient();
  const accountId = await getCurrentAccountId(supabase);

  return (
    <div>
      <PageHeader
        title="Marcar consulta"
        description="Escolha o procedimento, o dia e o horário."
        action={<CopyBookingLinkButton accountId={accountId} />}
      />
      <div className="px-6 pb-6">
        <BookingWizard procedures={procedures} />
      </div>
    </div>
  );
}
