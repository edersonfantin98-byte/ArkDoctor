"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { View } from "react-big-calendar";
import { CalendarView } from "./calendar-view";
import { AppointmentDialog } from "./appointment-dialog";
import { AvailabilityDialog } from "./availability-dialog";
import { ProcedureDialog } from "./procedure-dialog";
import type { AppointmentWithDetails } from "@/modules/scheduling/types";

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentWithDetails | null>(null);

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
        appointments={initialAppointments}
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
        onSaved={() => router.refresh()}
      />
    </>
  );
}
