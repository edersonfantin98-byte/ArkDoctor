import { startOfMonth, endOfMonth } from "date-fns";
import { listAppointmentsAction, listPendingStatusAppointmentsAction } from "./actions";
import { AgendaClient } from "@/components/agenda/agenda-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function AgendaPage() {
  const now = new Date();
  const from = startOfMonth(now).toISOString();
  const to = endOfMonth(now).toISOString();
  const [appointments, pendingStatusAppointments] = await Promise.all([
    listAppointmentsAction(from, to),
    listPendingStatusAppointmentsAction(),
  ]);

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Visualize e organize seus agendamentos."
      />
      <div className="flex flex-wrap gap-4 px-6 pb-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-700" />Confirmado</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-green-600" />Concluído</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-red-600" />Cancelado / não compareceu</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-600" />Agendado</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-gray-300" />Indisponibilidade</span>
      </div>
      <AgendaClient
        initialAppointments={appointments}
        pendingStatusCount={pendingStatusAppointments.length}
      />
    </div>
  );
}
