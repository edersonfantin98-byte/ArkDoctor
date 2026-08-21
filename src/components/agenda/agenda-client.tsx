"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { View } from "react-big-calendar";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { CalendarView, type BackgroundEvent } from "./calendar-view";
import { AppointmentDialog } from "./appointment-dialog";
import { AvailabilityDialog } from "./availability-dialog";
import { ProcedureDialog } from "./procedure-dialog";
import {
  listAppointmentsAction,
  listAvailabilityBlocksAction,
  listAvailabilityRulesAction,
} from "@/app/(app)/agenda/actions";
import type { AppointmentWithDetails, AvailabilityBlock, AvailabilityRule } from "@/modules/scheduling/types";

function visibleRange(date: Date, view: View): { from: Date; to: Date } {
  if (view === "month") {
    return { from: startOfWeek(startOfMonth(date)), to: endOfWeek(endOfMonth(date)) };
  }
  if (view === "week") {
    return { from: startOfWeek(date), to: endOfWeek(date) };
  }
  return { from: startOfDay(date), to: endOfDay(date) };
}

function materializeBackgroundEvents(
  blocks: AvailabilityBlock[],
  rules: AvailabilityRule[],
  range: { from: Date; to: Date },
): BackgroundEvent[] {
  const events: BackgroundEvent[] = blocks.map((block) => ({
    id: `block-${block.id}`,
    title: block.reason ?? "Bloqueado",
    start: new Date(block.startsAt),
    end: new Date(block.endsAt),
  }));

  for (const rule of rules) {
    const cursor = new Date(range.from);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= range.to) {
      if (cursor.getDay() === rule.dayOfWeek) {
        const [startHour, startMinute] = rule.startTime.split(":").map(Number);
        const [endHour, endMinute] = rule.endTime.split(":").map(Number);
        const start = new Date(cursor);
        start.setHours(startHour, startMinute, 0, 0);
        const end = new Date(cursor);
        end.setHours(endHour, endMinute, 0, 0);
        events.push({
          id: `rule-${rule.id}-${cursor.toISOString().slice(0, 10)}`,
          title: rule.reason ?? "Bloqueado",
          start,
          end,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return events;
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
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentWithDetails | null>(null);

  const refetch = useCallback(async () => {
    const { from, to } = visibleRange(date, view);
    const [nextAppointments, nextBlocks, nextRules] = await Promise.all([
      listAppointmentsAction(from.toISOString(), to.toISOString()),
      listAvailabilityBlocksAction(),
      listAvailabilityRulesAction(),
    ]);
    setAppointments(nextAppointments);
    setBlocks(nextBlocks);
    setRules(nextRules);
  }, [date, view]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const backgroundEvents = materializeBackgroundEvents(blocks, rules, visibleRange(date, view));

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
          <AvailabilityDialog onChanged={refetch} />
        </div>
      </div>
      <CalendarView
        appointments={appointments}
        backgroundEvents={backgroundEvents}
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
