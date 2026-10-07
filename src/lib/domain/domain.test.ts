import { describe, expect, it } from "vitest";
import { computeStreak, consistency, type DayRecord } from "./streak";
import { cascadeDeadlines, cascadedTaskState, deadlineState, workingDays } from "./cascade";
import { buildSegments, focusHourBanner, FOCUS_HOUR, sessionEnd } from "./session";
import { dreamDay, zonedTimeToInstant, MINUTE } from "./time";
import { breakdownSteps } from "./breakdown";

const d = (date: string, state: DayRecord["state"]): DayRecord => ({ date, state });

describe("streak: never miss twice", () => {
  it("matches the PRD example table", () => {
    // Mon 5 Oct 2026 … Mon 12 Oct 2026
    const r = computeStreak([
      d("2026-10-05", "active"),
      d("2026-10-06", "active"),
      d("2026-10-07", "missed"),
      d("2026-10-08", "active"),
      d("2026-10-09", "active"),
      d("2026-10-10", "rest"),
      d("2026-10-11", "missed"),
      d("2026-10-12", "missed"),
    ]);
    expect(r.outcomes.map((o) => o.streakAfter)).toEqual([1, 2, 2, 3, 4, 4, 4, 0]);
    expect(r.outcomes.at(-1)?.outcome).toBe("broken");
    expect(r.current).toBe(0);
    expect(r.longest).toBe(4);
  });

  it("one miss keeps the streak and makes today a save day", () => {
    const r = computeStreak([d("2026-10-01", "active"), d("2026-10-02", "active"), d("2026-10-03", "missed")]);
    expect(r.current).toBe(2);
    expect(r.saveDay).toBe(true);
  });

  it("rest days are skipped when checking 'in a row'", () => {
    const r = computeStreak([d("2026-10-01", "active"), d("2026-10-02", "missed"), d("2026-10-03", "rest"), d("2026-10-04", "missed")]);
    expect(r.current).toBe(0);
    expect(r.lastBrokenOn).toBe("2026-10-04");
  });

  it("closes the every-other-day loophole with the 2-per-7-days cap", () => {
    const r = computeStreak([
      d("2026-10-01", "active"),
      d("2026-10-02", "missed"),
      d("2026-10-03", "active"),
      d("2026-10-04", "missed"),
      d("2026-10-05", "active"),
      d("2026-10-06", "missed"),
    ]);
    expect(r.outcomes.at(-1)?.outcome).toBe("broken");
    expect(r.current).toBe(0);
  });

  it("misses older than 7 days fall out of the window", () => {
    const r = computeStreak([
      d("2026-10-01", "active"),
      d("2026-10-02", "missed"),
      d("2026-10-03", "active"),
      d("2026-10-04", "missed"),
      d("2026-10-05", "active"),
      d("2026-10-06", "active"),
      d("2026-10-07", "active"),
      d("2026-10-08", "active"),
      d("2026-10-09", "active"),
      d("2026-10-10", "missed"), // 2 Oct is now 8 days back
    ]);
    expect(r.current).toBe(7);
    expect(r.saveDay).toBe(true);
  });

  it("consistency ignores rest days", () => {
    expect(consistency([d("2026-10-01", "active"), d("2026-10-02", "rest"), d("2026-10-03", "missed")])).toBe(0.5);
  });
});

describe("days end at 03:00 local", () => {
  it("counts 01:30 on Thursday as Wednesday", () => {
    const t = zonedTimeToInstant("2026-10-08", "01:30", "Europe/London");
    expect(dreamDay(t, "Europe/London")).toBe("2026-10-07");
  });
  it("counts 03:01 as the new day", () => {
    const t = zonedTimeToInstant("2026-10-08", "03:01", "Europe/London");
    expect(dreamDay(t, "Europe/London")).toBe("2026-10-08");
  });
});

describe("deadline cascade", () => {
  it("spreads tasks in order, keeps a buffer, never passes the deadline", () => {
    const out = cascadeDeadlines({
      start: "2026-10-07",
      deadline: "2026-11-30",
      tasks: [
        { id: "a", estimatedMinutes: 90 },
        { id: "b", estimatedMinutes: 300 },
        { id: "c", estimatedMinutes: 240 },
        { id: "d", estimatedMinutes: 120 },
        { id: "e", estimatedMinutes: 60 },
      ],
      intensity: "standard",
    });
    const dates = ["a", "b", "c", "d", "e"].map((k) => out[k]);
    expect([...dates].sort()).toEqual(dates);
    expect(dates.at(-1)! < "2026-11-30").toBe(true);
  });

  it("skips rest weekdays", () => {
    const days = workingDays("2026-10-05", "2026-10-11", [0, 6]);
    expect(days).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
  });

  it("doesn't flag future cascade tasks as at risk before their window opens", () => {
    const t = { createdOn: "2026-09-12", dueOn: "2026-10-22", progress: 0, completed: false };
    expect(cascadedTaskState(t, "2026-10-15", "2026-10-07")).toBe("on_track");
    expect(cascadedTaskState(t, "2026-10-15", "2026-10-20")).toBe("at_risk");
  });

  it("flags at-risk when more than 20 points behind pace", () => {
    expect(deadlineState({ createdOn: "2026-10-01", dueOn: "2026-10-11", today: "2026-10-06", progress: 0.2, completed: false })).toBe("at_risk");
    expect(deadlineState({ createdOn: "2026-10-01", dueOn: "2026-10-11", today: "2026-10-06", progress: 0.4, completed: false })).toBe("on_track");
    expect(deadlineState({ createdOn: "2026-10-01", dueOn: "2026-10-11", today: "2026-10-11", progress: 0.4, completed: false })).toBe("due_today");
    expect(deadlineState({ createdOn: "2026-10-01", dueOn: "2026-10-11", today: "2026-10-12", progress: 0.4, completed: false })).toBe("missed");
  });
});

describe("Focus Hour", () => {
  it("runs 18:30–20:30 as kick-off + 4 blocks + 3 breaks", () => {
    const start = zonedTimeToInstant("2026-10-07", "18:30", "Europe/London");
    const segs = buildSegments(start, FOCUS_HOUR.shape);
    expect(segs.map((s) => s.kind)).toEqual(["kickoff", "focus", "break", "focus", "break", "focus", "break", "focus"]);
    expect(sessionEnd(start, FOCUS_HOUR.shape) - start).toBe(120 * MINUTE);
  });

  it("banner states across the evening", () => {
    const at = (t: string) => zonedTimeToInstant("2026-10-07", t, "Europe/London");
    expect(focusHourBanner(at("17:00")).state).toBe("later");
    expect(focusHourBanner(at("18:22")).state).toBe("soon");
    const live = focusHourBanner(at("19:02"));
    expect(live.state).toBe("live");
    if (live.state === "live") expect(live.segment.kind).toBe("break");
    expect(focusHourBanner(at("20:31")).state).toBe("done");
  });
});

describe("breakdown", () => {
  it("uses keyword templates and splits for more detail", () => {
    expect(breakdownSteps("Finish my dissertation", "school")[0].title).toBe("Find remaining sources");
    expect(breakdownSteps("Finish my dissertation", "school", "more")).toHaveLength(10);
    expect(breakdownSteps("Sort the garage", "personal", "less")).toHaveLength(3);
  });
});
