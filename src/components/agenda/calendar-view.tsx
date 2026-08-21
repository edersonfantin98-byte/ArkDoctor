"use client";

import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import type { AppointmentWithDetails } from "@/modules/scheduling/types";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: ptBR }),
  getDay,
  locales: { "pt-BR": ptBR },
});

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  appointment: AppointmentWithDetails;
}

export interface BackgroundEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
}

const statusClassName: Record<AppointmentWithDetails["status"], string> = {
  agendado: "rbc-event-agendado",
  confirmado: "rbc-event-confirmado",
  concluido: "rbc-event-concluido",
  nao_compareceu: "rbc-event-cancelado",
  cancelado: "rbc-event-cancelado",
};

export function CalendarView({
  appointments,
  backgroundEvents = [],
  view,
  onViewChange,
  date,
  onNavigate,
  onSelectSlot,
  onSelectEvent,
}: {
  appointments: AppointmentWithDetails[];
  backgroundEvents?: BackgroundEvent[];
  view: View;
  onViewChange: (view: View) => void;
  date: Date;
  onNavigate: (date: Date) => void;
  onSelectSlot: (slot: { start: Date; end: Date }) => void;
  onSelectEvent: (appointment: AppointmentWithDetails) => void;
}) {
  const events: CalendarEvent[] = appointments.map((appointment) => ({
    id: appointment.id,
    title: `${appointment.contact.name} — ${appointment.procedure.name}`,
    start: new Date(appointment.startsAt),
    end: new Date(appointment.endsAt),
    appointment,
  }));

  return (
    <div className="h-[calc(100vh-140px)] px-6 pb-6">
      <Calendar
        localizer={localizer}
        culture="pt-BR"
        events={events}
        backgroundEvents={backgroundEvents}
        startAccessor="start"
        endAccessor="end"
        view={view}
        onView={onViewChange}
        date={date}
        onNavigate={onNavigate}
        selectable
        onSelectSlot={onSelectSlot}
        onSelectEvent={(event: CalendarEvent | BackgroundEvent) => {
          if ("appointment" in event) onSelectEvent(event.appointment);
        }}
        eventPropGetter={(event: CalendarEvent | BackgroundEvent) => ({
          className:
            "appointment" in event ? statusClassName[event.appointment.status] : "rbc-event-blocked",
        })}
      />
    </div>
  );
}
