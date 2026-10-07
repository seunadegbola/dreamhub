/**
 * Streak engine — "never miss twice" (PRD §12).
 *
 * Rules:
 *  1. Streak = active days in the current run. Missed and rest days don't add.
 *  2. Two misses in a row break the streak. Rest days are skipped when checking "in a row".
 *  3. A third miss within any rolling 7 days breaks the streak, even if not consecutive.
 *
 * DailyActivity is the source of truth; the streak is always recalculated from it.
 */
import { daysBetween } from "./time";

export type DayState = "active" | "rest" | "missed";

export interface DayRecord {
  date: string; // local "YYYY-MM-DD" (DreamHub day, see time.dreamDay)
  state: DayState;
}

export type DayOutcome = DayState | "broken";

export interface StreakResult {
  current: number;
  longest: number;
  lifetimeActive: number;
  /** Per-day outcome, same order as input. A "broken" day is a miss that reset the streak. */
  outcomes: { date: string; outcome: DayOutcome; streakAfter: number }[];
  /** True when the most recent non-rest day was a miss that didn't break the streak. */
  saveDay: boolean;
  /** Date of the most recent break, if any. */
  lastBrokenOn?: string;
  /** Misses counted in the current rolling 7-day window (ending at the last record). */
  missesInWindow: number;
}

export const MAX_MISSES_PER_7_DAYS = 2;

export function computeStreak(days: DayRecord[]): StreakResult {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let current = 0;
  let longest = 0;
  let lifetimeActive = 0;
  let lastNonRestWasMiss = false;
  let runMisses: string[] = [];
  let lastBrokenOn: string | undefined;
  const outcomes: StreakResult["outcomes"] = [];

  for (const day of sorted) {
    if (day.state === "rest") {
      outcomes.push({ date: day.date, outcome: "rest", streakAfter: current });
      continue;
    }
    if (day.state === "active") {
      current += 1;
      lifetimeActive += 1;
      longest = Math.max(longest, current);
      lastNonRestWasMiss = false;
      outcomes.push({ date: day.date, outcome: "active", streakAfter: current });
      continue;
    }

    // Missed day
    if (current === 0) {
      // Nothing to protect yet.
      lastNonRestWasMiss = true;
      outcomes.push({ date: day.date, outcome: "missed", streakAfter: 0 });
      continue;
    }

    const windowMisses = runMisses.filter((d) => daysBetween(d, day.date) < 7).length + 1;
    const breaks = lastNonRestWasMiss || windowMisses > MAX_MISSES_PER_7_DAYS;
    if (breaks) {
      current = 0;
      runMisses = [];
      lastNonRestWasMiss = false;
      lastBrokenOn = day.date;
      outcomes.push({ date: day.date, outcome: "broken", streakAfter: 0 });
    } else {
      runMisses.push(day.date);
      lastNonRestWasMiss = true;
      outcomes.push({ date: day.date, outcome: "missed", streakAfter: current });
    }
  }

  const lastDate = sorted.at(-1)?.date;
  const missesInWindow = lastDate ? runMisses.filter((d) => daysBetween(d, lastDate) < 7).length : 0;

  return {
    current,
    longest,
    lifetimeActive,
    outcomes,
    saveDay: current > 0 && lastNonRestWasMiss,
    lastBrokenOn,
    missesInWindow,
  };
}

/** Active days ÷ non-rest days over the last `windowDays` records (default 30). 0–1. */
export function consistency(days: DayRecord[], windowDays = 30): number {
  const recent = [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(-windowDays);
  const counted = recent.filter((d) => d.state !== "rest");
  if (counted.length === 0) return 0;
  return counted.filter((d) => d.state === "active").length / counted.length;
}
