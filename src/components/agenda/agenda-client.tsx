"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { View } from "react-big-calendar";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { CalendarView } from "./calendar-view";
import { AppointmentDialog } from "./appointment-dialog";
import { AvailabilityDialog } from "./availability-dialog";
import { ProcedureDialog } from "./procedure-dialog";
import { listAppointmentsAction } from "@/app/(app)/agenda/actions";
import type { AppointmentWithDetails } from "@/modules/scheduling/types";

function visibleRange(date: Date, view: View): { from: Date; to: Date } {
  if (view === "month") {
    return { from: startOfWeek(startOfMonth(date)), to: endOfWeek(endOfMonth(date)) };
  }
  if (view === "week") {
    return { from: startOfWeek(date), to: endOfWeek(date) };
  }
  return { from: startOfDay(date), to: endOfDay(date) };
}

export function AgendaClient({
  initialAppointments,
  pendingStatusCount,
}: {
  initialAppointments: AppointmentWithDetails[];
  pendingStatusCount: number;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("week");
  const [date, setDate] = useState(new Date());
  const [appointments, setAppointments] = useState(initialAppointments);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentWithDetails | null>(null);

  const refetch = useCallback(async () => {
    const { from, to } = visibleRange(date, view);
    setAppointments(await listAppointmentsAction(from.toISOString(), to.toISOString()));
  }, [date, view]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  function handleSelectSlot(newSlot: { start: Date; end: Date }) {
    setEditingAppointment(null);
    setSlot(newSlot);
    setDialogOpen(true);
  }

  function handleSelectEvent(appointment: AppointmentWithDetails) {
    setEditingAppointment(appointment);
    setSlot(null);
    setDialogOpen(true);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 pb-2">
        {pendingStatusCount > 0 && (
          <p className="px-6 text-sm text-amber-700">
            {pendingStatusCount} agendamento(s) sem status definido após o horário previsto
          </p>
        )}
        <div className="flex justify-end gap-2 px-6">
          <ProcedureDialog onChanged={() => router.refresh()} />
          <AvailabilityDialog onChanged={() => router.refresh()} />
        </div>
      </div>
      <CalendarView
        appointments={appointments}
        view={view}
        onViewChange={setView}
        date={date}
        onNavigate={setDate}
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
      />
      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        slot={slot}
        editingAppointment={editingAppointment}
        onSaved={refetch}
      />
    </>
  );
}
