import { describe, it, expect } from "vitest";
import { isSlotBusy, dayRangeIso } from "./slot-availability";

describe("isSlotBusy", () => {
  const occupied = [{ startsAt: "2026-09-01T13:00:00.000Z", endsAt: "2026-09-01T13:30:00.000Z" }];

  it("is not busy for a slot fully before the occupied interval", () => {
    expect(isSlotBusy("2026-09-01", "12:30", 30, occupied)).toBe(false);
  });

  it("is not busy for a slot fully after the occupied interval", () => {
    expect(isSlotBusy("2026-09-01", "13:30", 30, occupied)).toBe(false);
  });

  it("is busy when the slot exactly matches the occupied interval", () => {
    expect(isSlotBusy("2026-09-01", "13:00", 30, occupied)).toBe(true);
  });

  it("is busy when the slot overlaps only the start of the occupied interval", () => {
    expect(isSlotBusy("2026-09-01", "12:45", 30, occupied)).toBe(true);
  });

  it("is busy when the slot overlaps only the end of the occupied interval", () => {
    expect(isSlotBusy("2026-09-01", "13:15", 30, occupied)).toBe(true);
  });

  it("is busy when a longer procedure duration extends into the occupied interval", () => {
    expect(isSlotBusy("2026-09-01", "12:30", 60, occupied)).toBe(true);
  });

  it("returns false for an empty list of occupied intervals", () => {
    expect(isSlotBusy("2026-09-01", "13:00", 30, [])).toBe(false);
  });
});

describe("dayRangeIso", () => {
  it("returns a range spanning exactly the given local day", () => {
    const { from, to } = dayRangeIso("2026-09-01");
    const fromDate = new Date(from);
    const toDate = new Date(to);
    expect(fromDate.getFullYear()).toBe(2026);
    expect(fromDate.getMonth()).toBe(8);
    expect(fromDate.getDate()).toBe(1);
    expect(fromDate.getHours()).toBe(0);
    expect(toDate.getTime() - fromDate.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
