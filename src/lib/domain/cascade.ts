/**
 * Deadline cascade and deadline states (PRD §11).
 */
import { addDays, daysBetween, weekday } from "./time";

export type Intensity = "gentle" | "standard" | "hardcore";

export const INTENSITY: Record<
  Intensity,
  { label: string; buffer: number; committedByDefault: boolean; extensions: number | "unlimited"; witnessed: boolean; blurb: string }
> = {
  gentle: { label: "Gentle", buffer: 0.25, committedByDefault: false, extensions: "unlimited", witnessed: false, blurb: "Plenty of buffer. Reminders the day before and on the day." },
  standard: { label: "Standard", buffer: 0.15, committedByDefault: true, extensions: 2, witnessed: true, blurb: "Shared with your buddies. 2 extensions, each approved by a buddy." },
  hardcore: { label: "Hardcore", buffer: 0.05, committedByDefault: true, extensions: 1, witnessed: true, blurb: "Tight buffer, daily countdown in the final week, 1 extension." },
};

export interface CascadeInput {
  start: string; // first day work can happen ("YYYY-MM-DD")
  deadline: string; // goal deadline
  tasks: { id: string; estimatedMinutes: number }[];
  restWeekdays?: number[]; // 0 = Sunday
  intensity?: Intensity;
}

/** Working days from start to deadline inclusive, skipping rest weekdays. */
export function workingDays(start: string, deadline: string, restWeekdays: number[] = []): string[] {
  const out: string[] = [];
  const n = daysBetween(start, deadline);
  for (let i = 0; i <= n; i++) {
    const d = addDays(start, i);
    if (!restWeekdays.includes(weekday(d))) out.push(d);
  }
  return out;
}

/**
 * Spread mini-deadlines across tasks in order, in proportion to their estimates,
 * holding back a buffer at the end. Never past the goal deadline.
 */
export function cascadeDeadlines(input: CascadeInput): Record<string, string> {
  const { start, deadline, tasks, restWeekdays = [], intensity = "standard" } = input;
  const result: Record<string, string> = {};
  if (tasks.length === 0) return result;

  let days = workingDays(start, deadline, restWeekdays);
  if (days.length === 0) days = [deadline];

  const usable = Math.max(1, Math.floor(days.length * (1 - INTENSITY[intensity].buffer)));
  const total = tasks.reduce((s, t) => s + Math.max(1, t.estimatedMinutes), 0);

  let cumulative = 0;
  for (const t of tasks) {
    cumulative += Math.max(1, t.estimatedMinutes);
    const idx = Math.min(usable, Math.max(1, Math.ceil((cumulative / total) * usable))) - 1;
    result[t.id] = days.at(idx) ?? deadline;
  }
  return result;
}

export type DeadlineState = "on_track" | "at_risk" | "due_today" | "missed" | "done";

export interface DeadlineStateInput {
  createdOn: string;
  dueOn: string;
  today: string;
  progress: number; // 0–1
  completed: boolean;
}

/** At risk = behind the even pace by more than 20 percentage points. */
export function deadlineState({ createdOn, dueOn, today, progress, completed }: DeadlineStateInput): DeadlineState {
  if (completed) return "done";
  const left = daysBetween(today, dueOn);
  if (left < 0) return "missed";
  if (left === 0) return "due_today";
  const span = Math.max(1, daysBetween(createdOn, dueOn));
  const elapsed = Math.min(1, Math.max(0, daysBetween(createdOn, today) / span));
  return elapsed - progress > 0.2 ? "at_risk" : "on_track";
}

/**
 * State of one task inside a cascade. A task's pace window starts at the previous
 * task's deadline (when work on it is expected to begin), not when it was created,
 * so tasks weeks away aren't flagged "at risk" just for not being started.
 */
export function cascadedTaskState(
  task: { createdOn: string; dueOn?: string; progress: number; completed: boolean },
  previousDue: string | undefined,
  today: string,
): DeadlineState {
  if (!task.dueOn) return task.completed ? "done" : "on_track";
  const windowStart = previousDue && previousDue > task.createdOn && previousDue < task.dueOn ? previousDue : task.createdOn;
  if (!task.completed && today < windowStart) return "on_track";
  return deadlineState({ createdOn: windowStart, dueOn: task.dueOn, today, progress: task.progress, completed: task.completed });
}

export const DEADLINE_LABEL: Record<DeadlineState, string> = {
  on_track: "On track",
  at_risk: "At risk",
  due_today: "Due today",
  missed: "Missed",
  done: "Done",
};
