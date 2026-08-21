import { PageHeader } from "@/components/layout/page-header";
import { BookingWizard } from "@/components/agendamento/booking-wizard";
import { listProceduresAction } from "@/app/(app)/agenda/actions";

export default async function AgendamentoPage() {
  const procedures = await listProceduresAction();

  return (
    <div>
      <PageHeader title="Marcar consulta" description="Escolha o procedimento, o dia e o horário." />
      <div className="px-6 pb-6">
        <BookingWizard procedures={procedures} />
      </div>
    </div>
  );
}
