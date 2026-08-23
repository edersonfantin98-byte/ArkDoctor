"use client";

import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar";
import type { DateHeaderProps, EventProps, HeaderProps, ToolbarProps } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

type AgendaEvent = CalendarEvent | BackgroundEvent;

const messages = {
  date: "Data",
  time: "Hora",
  event: "Evento",
  allDay: "Dia inteiro",
  week: "Semana",
  work_week: "Semana útil",
  day: "Dia",
  month: "Mês",
  previous: "Anterior",
  next: "Próximo",
  yesterday: "Ontem",
  tomorrow: "Amanhã",
  today: "Hoje",
  agenda: "Agenda",
  noEventsInRange: "Não há agendamentos neste período.",
  showMore: (total: number) => `+${total} mais`,
};

const statusClassName: Record<AppointmentWithDetails["status"], string> = {
  agendado: "rbc-event-agendado",
  confirmado: "rbc-event-confirmado",
  concluido: "rbc-event-concluido",
  nao_compareceu: "rbc-event-cancelado",
  cancelado: "rbc-event-cancelado",
};

function CalendarToolbar({ label, view, views, localizer: toolbarLocalizer, onNavigate, onView }: ToolbarProps<AgendaEvent>) {
  const viewNames = (Array.isArray(views) ? views : (Object.keys(views) as View[])) as View[];
  const toolbarMessages = toolbarLocalizer.messages;

  return (
    <div className="rbc-toolbar">
      <div className="ark-toolbar-nav">
        <button type="button" className="ark-nav-btn" aria-label={String(toolbarMessages.previous)} onClick={() => onNavigate("PREV")}>
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" className="ark-nav-btn" aria-label={String(toolbarMessages.next)} onClick={() => onNavigate("NEXT")}>
          <ChevronRight className="size-4" />
        </button>
        <button type="button" className="ark-today-pill" onClick={() => onNavigate("TODAY")}>
          {toolbarMessages.today}
        </button>
      </div>
      <span className="rbc-toolbar-label">{label}</span>
      <div className="ark-view-switch">
        {viewNames.map((name) => (
          <button
            key={name}
            type="button"
            className={name === view ? "ark-view-btn ark-view-btn-active" : "ark-view-btn"}
            onClick={() => onView(name)}
          >
            {toolbarMessages[name]}
          </button>
        ))}
      </div>
    </div>
  );
}

function TimeGridDayHeader({ date }: HeaderProps) {
  const today = isSameDay(date, new Date());
  return (
    <div className="ark-day-header">
      <div className={today ? "ark-day-header-num ark-day-header-num-today" : "ark-day-header-num"}>
        {format(date, "d")}
      </div>
      <div className="ark-day-header-name">{format(date, "EEE", { locale: ptBR })}</div>
    </div>
  );
}

function MonthDateHeader({ date, label, drilldownView, onDrillDown }: DateHeaderProps) {
  const today = isSameDay(date, new Date());
  const pill = <span className={today ? "ark-date-pill ark-date-pill-today" : "ark-date-pill"}>{label}</span>;
  if (!drilldownView) return pill;
  return (
    <button type="button" className="rbc-button-link" onClick={onDrillDown}>
      {pill}
    </button>
  );
}

function AgendaEventContent({ event }: EventProps<AgendaEvent>) {
  if ("appointment" in event) {
    return (
      <div className="ark-event-content">
        <span className="ark-event-title">{event.appointment.contact.name}</span>
        <span className="ark-event-sub">{event.appointment.procedure.name}</span>
      </div>
    );
  }
  return (
    <div className="ark-event-content">
      <span className="ark-event-title">{event.title}</span>
    </div>
  );
}

function MonthEventContent({ event }: EventProps<AgendaEvent>) {
  const label = "appointment" in event ? event.appointment.contact.name : event.title;
  return <span className="ark-event-chip">{label}</span>;
}

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
  const events: AgendaEvent[] = [
    ...appointments.map((appointment) => ({
      id: appointment.id,
      title: `${appointment.contact.name} — ${appointment.procedure.name}`,
      start: new Date(appointment.startsAt),
      end: new Date(appointment.endsAt),
      appointment,
    })),
    ...backgroundEvents,
  ];

  return (
    <div className="h-[calc(100vh-140px)] px-6 pb-6">
      <Calendar
        localizer={localizer}
        culture="pt-BR"
        messages={messages}
        views={["month", "week", "day"] as View[]}
        events={events}
        startAccessor="start"
        endAccessor="end"
        view={view}
        onView={onViewChange}
        date={date}
        onNavigate={onNavigate}
        selectable
        onSelectSlot={onSelectSlot}
        onSelectEvent={(event: AgendaEvent) => {
          if ("appointment" in event) onSelectEvent(event.appointment);
        }}
        eventPropGetter={(event: AgendaEvent) => ({
          className:
            "appointment" in event ? statusClassName[event.appointment.status] : "rbc-event-blocked",
        })}
        components={{
          toolbar: CalendarToolbar,
          event: AgendaEventContent,
          week: { header: TimeGridDayHeader },
          day: { header: TimeGridDayHeader },
          month: { event: MonthEventContent, dateHeader: MonthDateHeader },
        }}
      />
    </div>
  );
}
