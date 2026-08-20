import { startOfMonth, endOfMonth } from "date-fns";
import { listAppointmentsAction } from "./actions";
import { AgendaClient } from "@/components/agenda/agenda-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function AgendaPage() {
  const now = new Date();
  const from = startOfMonth(now).toISOString();
  const to = endOfMonth(now).toISOString();
  const appointments = await listAppointmentsAction(from, to);

  return (
    <div>
      <PageHeader
        eyebrow="Agenda"
        title="Agenda"
        description="Visualize e organize seus agendamentos."
      />
      <AgendaClient initialAppointments={appointments} />
    </div>
  );
}
