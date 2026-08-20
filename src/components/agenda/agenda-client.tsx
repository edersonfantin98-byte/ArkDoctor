"use client";

import { useState } from "react";
import type { View } from "react-big-calendar";
import { CalendarView } from "./calendar-view";
import type { AppointmentWithDetails } from "@/modules/scheduling/types";

export function AgendaClient({ initialAppointments }: { initialAppointments: AppointmentWithDetails[] }) {
  const [view, setView] = useState<View>("week");
  const [date, setDate] = useState(new Date());

  return (
    <CalendarView
      appointments={initialAppointments}
      view={view}
      onViewChange={setView}
      date={date}
      onNavigate={setDate}
      onSelectSlot={() => {}}
      onSelectEvent={() => {}}
    />
  );
}
