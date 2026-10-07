/**
 * Session timeline and the daily Focus Hour (PRD §6, §8, §18).
 * The server owns the clock in production; these functions are pure so the
 * same logic runs on server and client.
 */
import { MINUTE, addDays, dreamDay, localDate, zonedTimeToInstant } from "./time";

export type SegmentKind = "kickoff" | "focus" | "break";

export interface Segment {
  kind: SegmentKind;
  block: number; // 1-based block number this segment belongs to (break n follows block n)
  start: number;
  end: number;
}

export interface SessionShape {
  kickoffMinutes: number;
  blocks: number;
  blockMinutes: number;
  breakMinutes: number;
}

export function buildSegments(start: number, shape: SessionShape): Segment[] {
  const segs: Segment[] = [];
  let t = start;
  if (shape.kickoffMinutes > 0) {
    segs.push({ kind: "kickoff", block: 0, start: t, end: t + shape.kickoffMinutes * MINUTE });
    t += shape.kickoffMinutes * MINUTE;
  }
  for (let b = 1; b <= shape.blocks; b++) {
    segs.push({ kind: "focus", block: b, start: t, end: t + shape.blockMinutes * MINUTE });
    t += shape.blockMinutes * MINUTE;
    if (b < shape.blocks && shape.breakMinutes > 0) {
      segs.push({ kind: "break", block: b, start: t, end: t + shape.breakMinutes * MINUTE });
      t += shape.breakMinutes * MINUTE;
    }
  }
  return segs;
}

export function sessionEnd(start: number, shape: SessionShape): number {
  return buildSegments(start, shape).at(-1)?.end ?? start;
}

export type SessionPhase =
  | { phase: "upcoming"; startsAt: number }
  | { phase: "live"; segment: Segment; index: number; segments: Segment[] }
  | { phase: "ended"; endedAt: number };

export function sessionPhase(now: number, start: number, shape: SessionShape): SessionPhase {
  const segments = buildSegments(start, shape);
  if (now < start) return { phase: "upcoming", startsAt: start };
  const index = segments.findIndex((s) => now >= s.start && now < s.end);
  if (index === -1) return { phase: "ended", endedAt: segments.at(-1)?.end ?? start };
  return { phase: "live", segment: segments[index], index, segments };
}

/* ---------------- Focus Hour ---------------- */

export interface FocusHourSchedule {
  timezone: string;
  startTime: string; // "HH:mm" in timezone
  shape: SessionShape;
}

export const FOCUS_HOUR: FocusHourSchedule = {
  timezone: "Europe/London",
  startTime: "18:30",
  shape: { kickoffMinutes: 5, blocks: 4, blockMinutes: 25, breakMinutes: 5 },
};

export type FocusHourBanner =
  | { state: "later"; startsAt: number } // more than 10 minutes away
  | { state: "soon"; startsAt: number } // within 10 minutes
  | { state: "live"; segment: Segment; endsAt: number }
  | { state: "done"; nextStartsAt: number }; // after today's ended

/** Start instant of the Focus Hour on the schedule's local date containing `now`. */
export function focusHourStart(now: number, schedule = FOCUS_HOUR): number {
  const today = localDate(now, schedule.timezone);
  return zonedTimeToInstant(today, schedule.startTime, schedule.timezone);
}

/** Focus Hour start for the DreamHub day containing `now` (days end at 03:00, see time.dreamDay). */
export function focusHourStartForDreamDay(now: number, schedule = FOCUS_HOUR): number {
  return zonedTimeToInstant(dreamDay(now, schedule.timezone), schedule.startTime, schedule.timezone);
}

export function focusHourBanner(now: number, schedule = FOCUS_HOUR): FocusHourBanner {
  const start = focusHourStart(now, schedule);
  const end = sessionEnd(start, schedule.shape);
  if (now < start - 10 * MINUTE) return { state: "later", startsAt: start };
  if (now < start) return { state: "soon", startsAt: start };
  if (now < end) {
    const p = sessionPhase(now, start, schedule.shape);
    if (p.phase === "live") return { state: "live", segment: p.segment, endsAt: end };
  }
  const tomorrow = addDays(localDate(now, schedule.timezone), 1);
  return { state: "done", nextStartsAt: zonedTimeToInstant(tomorrow, schedule.startTime, schedule.timezone) };
}

/** Joining after at least one full block counts as a completed session (PRD §6). */
export function countsAsCompleted(blocksCompleted: number): boolean {
  return blocksCompleted >= 1;
}
