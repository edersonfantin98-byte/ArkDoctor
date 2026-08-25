export interface OccupiedInterval {
  startsAt: string;
  endsAt: string;
}

export function isSlotBusy(
  date: string,
  slot: string,
  durationMinutes: number,
  occupiedIntervals: OccupiedInterval[],
): boolean {
  const slotStart = new Date(`${date}T${slot}:00`).getTime();
  const slotEnd = slotStart + durationMinutes * 60_000;

  return occupiedIntervals.some((interval) => {
    const intervalStart = new Date(interval.startsAt).getTime();
    const intervalEnd = new Date(interval.endsAt).getTime();
    return slotStart < intervalEnd && slotEnd > intervalStart;
  });
}

export function dayRangeIso(date: string): { from: string; to: string } {
  const from = new Date(`${date}T00:00:00`);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
