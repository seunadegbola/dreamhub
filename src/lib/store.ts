"use client";

/**
 * Front-end state. Persisted to localStorage for the prototype.
 * In the backend milestone each slice is replaced by Supabase queries/mutations;
 * component code talks to these actions, not to storage, so the swap is contained.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ActiveSolo, Buddy, CheckInType, Extension, Goal, HostedSession, Profile, SessionLog, Subtask, Task } from "./types";
import type { Category, SuggestedStep } from "./domain/breakdown";
import { cascadeDeadlines, type Intensity } from "./domain/cascade";
import { computeStreak, consistency, type DayRecord } from "./domain/streak";
import { addDays, daysBetween, dreamDay, weekday, zonedTimeToInstant, MINUTE } from "./domain/time";
import { XP, capDailyXp, type AchievementKey } from "./domain/xp";
import { FOCUS_HOUR, type SessionShape } from "./domain/session";

export const uid = () => Math.random().toString(36).slice(2, 10);

export interface Draft {
  category?: Category;
  goal?: string;
  deadline?: string;
  intensity: Intensity;
  steps: SuggestedStep[];
}

interface State {
  profile: Profile;
  goals: Goal[];
  tasks: Task[];
  activeDays: string[];
  restDays: string[]; // one-off rest days
  xp: number;
  xpByDay: Record<string, number>;
  achievements: AchievementKey[];
  sessions: HostedSession[];
  logs: SessionLog[];
  buddies: Buddy[];
  nudged: Record<string, string>; // buddyId -> day
  activeSolo?: ActiveSolo;
  draft: Draft;
  /** Demo control: minutes added to the real clock. */
  clockOffsetMin: number;
  toast?: { id: string; text: string };

  // actions
  setDraft: (d: Partial<Draft>) => void;
  completeOnboarding: (name: string, email: string) => void;
  loadDemo: () => void;
  reset: () => void;
  addGoal: (g: { title: string; category: Category; deadline?: string; intensity: Intensity; steps: SuggestedStep[] }) => string;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  addTask: (goalId: string, title: string, estimatedMinutes?: number) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;
  addSubtasks: (taskId: string, steps: SuggestedStep[]) => void;
  toggleSubtask: (taskId: string, subId: string) => void;
  deleteSubtask: (taskId: string, subId: string) => void;
  recascade: (goalId: string) => void;
  requestExtension: (taskId: string, newDue: string, reason: string, witness?: string) => void;
  logSession: (log: Omit<SessionLog, "id" | "date" | "endedAt">) => void;
  createSession: (s: Omit<HostedSession, "id" | "isMine" | "hostName" | "attendees">) => string;
  respondInvite: (id: string, response: "accepted" | "declined") => void;
  startSolo: (shape: SessionShape) => void;
  pauseSolo: () => void;
  resumeSolo: () => void;
  endSolo: () => void;
  nudge: (buddyId: string) => void;
  acceptBuddy: (buddyId: string) => void;
  addBuddyRequest: (name: string) => void;
  removeBuddy: (buddyId: string) => void;
  setRestWeekdays: (days: number[]) => void;
  addRestDay: (date: string) => void;
  setProfile: (patch: Partial<Profile>) => void;
  setClockOffset: (min: number) => void;
  showToast: (text: string) => void;
}

const LONDON = "Europe/London";
const browserTz = () => (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : LONDON);

export const nowMs = (offsetMin: number) => Date.now() + offsetMin * MINUTE;

function emptyProfile(): Profile {
  const tz = browserTz();
  return {
    name: "",
    email: "",
    timezone: tz,
    restWeekdays: [],
    onboarded: false,
    createdOn: dreamDay(Date.now(), tz),
    celebrations: true,
  };
}

const initialData = () => ({
  profile: emptyProfile(),
  goals: [] as Goal[],
  tasks: [] as Task[],
  activeDays: [] as string[],
  restDays: [] as string[],
  xp: 0,
  xpByDay: {} as Record<string, number>,
  achievements: [] as AchievementKey[],
  sessions: [] as HostedSession[],
  logs: [] as SessionLog[],
  buddies: [] as Buddy[],
  nudged: {} as Record<string, string>,
  activeSolo: undefined as ActiveSolo | undefined,
  draft: { intensity: "standard" as Intensity, steps: [] as SuggestedStep[] },
  clockOffsetMin: 0,
  toast: undefined as State["toast"],
});

function buildTasks(goalId: string, steps: SuggestedStep[], today: string, deadline: string | undefined, intensity: Intensity, rest: number[], committed: boolean): Task[] {
  const tasks: Task[] = steps.map((s) => ({
    id: uid(),
    goalId,
    title: s.title,
    estimatedMinutes: s.estimatedMinutes,
    createdOn: today,
    committed,
    subtasks: [],
    extensions: [],
  }));
  if (deadline) {
    const due = cascadeDeadlines({ start: today, deadline, tasks, restWeekdays: rest, intensity });
    tasks.forEach((t) => (t.dueOn = due[t.id]));
  }
  return tasks;
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const today = () => dreamDay(nowMs(get().clockOffsetMin), get().profile.timezone);

      const award = (amount: number) => {
        const day = today();
        const earned = get().xpByDay[day] ?? 0;
        const gain = capDailyXp(earned, amount);
        if (gain <= 0) return;
        set((s) => ({ xp: s.xp + gain, xpByDay: { ...s.xpByDay, [day]: earned + gain } }));
      };

      const unlock = (key: AchievementKey) => {
        if (get().achievements.includes(key)) return false;
        set((s) => ({ achievements: [...s.achievements, key] }));
        return true;
      };

      /** Record activity for today; awards save-day XP and streak achievements. */
      const markActive = () => {
        const s = get();
        const day = today();
        if (s.activeDays.includes(day)) return;
        const before = selectStreak(s, day);
        set({ activeDays: [...s.activeDays, day] });
        if (before.saveDay) {
          award(XP.streakSaved);
          unlock("saved-it");
        }
        if (before.lastBrokenOn && before.current === 0 && daysBetween(before.lastBrokenOn, day) <= 2) unlock("comeback");
        const after = selectStreak(get(), day);
        if (after.current >= 3) unlock("momentum-3");
      };

      return {
        ...initialData(),

        setDraft: (d) => set((s) => ({ draft: { ...s.draft, ...d } })),

        completeOnboarding: (name, email) => {
          const s = get();
          const day = today();
          const { draft } = s;
          set((st) => ({ profile: { ...st.profile, name, email, onboarded: true, createdOn: st.profile.createdOn || day } }));
          if (draft.goal && draft.category) {
            get().addGoal({ title: draft.goal, category: draft.category, deadline: draft.deadline, intensity: draft.intensity, steps: draft.steps });
          }
          set({ draft: { intensity: "standard", steps: [] } });
        },

        addGoal: ({ title, category, deadline, intensity, steps }) => {
          const id = uid();
          const day = today();
          const committed = deadline ? intensity !== "gentle" : false;
          const goal: Goal = { id, title, category, deadline, intensity, committed, createdOn: day };
          const tasks = buildTasks(id, steps, day, deadline, intensity, get().profile.restWeekdays, committed);
          set((s) => ({ goals: [...s.goals, goal], tasks: [...s.tasks, ...tasks] }));
          return id;
        },

        updateGoal: (id, patch) => set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),

        addTask: (goalId, title, estimatedMinutes = 60) => {
          const g = get().goals.find((x) => x.id === goalId);
          set((s) => ({
            tasks: [
              ...s.tasks,
              { id: uid(), goalId, title, estimatedMinutes, createdOn: today(), committed: g?.committed ?? false, subtasks: [], extensions: [], dueOn: g?.deadline },
            ],
          }));
        },

        updateTask: (id, patch) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

        deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

        toggleTask: (id) => {
          const t = get().tasks.find((x) => x.id === id);
          if (!t) return;
          const completing = !t.completedAt;
          set((s) => ({ tasks: s.tasks.map((x) => (x.id === id ? { ...x, completedAt: completing ? nowMs(s.clockOffsetMin) : undefined } : x)) }));
          if (completing) {
            award(XP.task);
            if (t.dueOn && t.committed && daysBetween(today(), t.dueOn) >= 0) {
              award(XP.deadlineHit);
              unlock("on-time");
            }
            markActive();
            get().showToast("✨ Task done. Nice.");
          }
        },

        addSubtasks: (taskId, steps) =>
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === taskId
                ? { ...t, subtasks: [...t.subtasks, ...steps.map((st): Subtask => ({ id: uid(), title: st.title, estimatedMinutes: st.estimatedMinutes, done: false }))] }
                : t,
            ),
          })),

        toggleSubtask: (taskId, subId) => {
          const t = get().tasks.find((x) => x.id === taskId);
          const sub = t?.subtasks.find((x) => x.id === subId);
          if (!t || !sub) return;
          const completing = !sub.done;
          set((s) => ({
            tasks: s.tasks.map((x) =>
              x.id === taskId
                ? { ...x, subtasks: x.subtasks.map((y) => (y.id === subId ? { ...y, done: completing, completedAt: completing ? (y.completedAt ?? nowMs(s.clockOffsetMin)) : y.completedAt } : y)) }
                : x,
            ),
          }));
          // XP once per subtask, ever (no tick/untick farming)
          if (completing && !sub.completedAt) {
            award(XP.subtask);
            markActive();
          }
        },

        deleteSubtask: (taskId, subId) =>
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, subtasks: t.subtasks.filter((x) => x.id !== subId) } : t)) })),

        recascade: (goalId) => {
          const g = get().goals.find((x) => x.id === goalId);
          if (!g?.deadline) return;
          const open = get().tasks.filter((t) => t.goalId === goalId && !t.completedAt);
          const due = cascadeDeadlines({ start: today(), deadline: g.deadline, tasks: open, restWeekdays: get().profile.restWeekdays, intensity: g.intensity });
          set((s) => ({ tasks: s.tasks.map((t) => (due[t.id] ? { ...t, dueOn: due[t.id] } : t)) }));
        },

        requestExtension: (taskId, newDue, reason, witness) => {
          const t = get().tasks.find((x) => x.id === taskId);
          if (!t?.dueOn) return;
          const ext: Extension = {
            id: uid(),
            oldDue: t.dueOn,
            newDue,
            reason,
            witness,
            status: witness ? "pending" : "self_approved",
            createdAt: nowMs(get().clockOffsetMin),
          };
          set((s) => ({ tasks: s.tasks.map((x) => (x.id === taskId ? { ...x, extensions: [...x.extensions, ext], dueOn: witness ? x.dueOn : newDue } : x)) }));
          if (witness) {
            // Prototype: the buddy approves after a moment.
            setTimeout(() => {
              set((s) => ({
                tasks: s.tasks.map((x) =>
                  x.id === taskId ? { ...x, dueOn: newDue, extensions: x.extensions.map((e) => (e.id === ext.id ? { ...e, status: "approved" } : e)) } : x,
                ),
              }));
              get().showToast(`${witness} approved your extension.`);
            }, 4000);
          }
        },

        logSession: (log) => {
          const s = get();
          const entry: SessionLog = { ...log, id: uid(), date: today(), endedAt: nowMs(s.clockOffsetMin) };
          set((st) => ({ logs: [entry, ...st.logs] }));
          if (log.blocks > 0) {
            award(XP.focusBlock * log.blocks);
            if (log.type === "focus_hour" && log.blocks >= FOCUS_HOUR.shape.blocks) award(XP.fullFocusHour);
            unlock("first-session");
            if (log.type === "focus_hour") unlock("showed-up");
            const totalMin = get().logs.reduce((a, l) => a + l.minutes, 0);
            if (totalMin >= 600) unlock("ten-hours");
            markActive();
          }
        },

        createSession: (input) => {
          const id = uid();
          const session: HostedSession = { ...input, id, isMine: true, hostName: get().profile.name || "You", attendees: [] };
          set((s) => ({ sessions: [...s.sessions, session] }));
          return id;
        },

        respondInvite: (id, response) => set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, response } : x)) })),

        startSolo: (shape) => set((s) => ({ activeSolo: { start: nowMs(s.clockOffsetMin), shape, pausedTotal: 0 } })),
        pauseSolo: () => set((s) => (s.activeSolo && !s.activeSolo.pausedAt ? { activeSolo: { ...s.activeSolo, pausedAt: nowMs(s.clockOffsetMin) } } : {})),
        resumeSolo: () =>
          set((s) => {
            const a = s.activeSolo;
            if (!a?.pausedAt) return {};
            const paused = nowMs(s.clockOffsetMin) - a.pausedAt;
            return { activeSolo: { ...a, pausedAt: undefined, pausedTotal: a.pausedTotal + paused } };
          }),
        endSolo: () => set({ activeSolo: undefined }),

        nudge: (buddyId) => {
          set((s) => ({ nudged: { ...s.nudged, [buddyId]: today() } }));
          const b = get().buddies.find((x) => x.id === buddyId);
          get().showToast(`Nudge sent to ${b?.name ?? "your buddy"}.`);
        },
        acceptBuddy: (buddyId) => set((s) => ({ buddies: s.buddies.map((b) => (b.id === buddyId ? { ...b, status: "active" } : b)) })),
        addBuddyRequest: (name) =>
          set((s) => ({
            buddies: [
              ...s.buddies,
              { id: uid(), name, hue: Math.floor(Math.random() * 360), streak: 0, today: "pending", missedYesterday: false, focusingNow: false, deadlines: [], status: "pending_out" },
            ],
          })),
        removeBuddy: (buddyId) => set((s) => ({ buddies: s.buddies.filter((b) => b.id !== buddyId) })),

        setRestWeekdays: (days) => set((s) => ({ profile: { ...s.profile, restWeekdays: days.slice(0, 2) } })),
        addRestDay: (date) => set((s) => ({ restDays: [...new Set([...s.restDays, date])] })),
        setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
        setClockOffset: (min) => set({ clockOffsetMin: min }),
        showToast: (text) => {
          const id = uid();
          set({ toast: { id, text } });
          setTimeout(() => {
            if (get().toast?.id === id) set({ toast: undefined });
          }, 3200);
        },

        reset: () => set({ ...initialData() }),
        loadDemo: () => set({ ...initialData(), ...demoData() }),
      };
    },
    { name: "dreamhub-v1", partialize: (s) => ({ ...s, toast: undefined }) },
  ),
);

/* ---------------- Selectors ---------------- */

/** Day records from the user's first day up to yesterday (closed days) plus today if already active. */
export function selectDays(s: Pick<State, "profile" | "activeDays" | "restDays">, today: string): DayRecord[] {
  const start = s.profile.createdOn || today;
  const n = Math.max(0, daysBetween(start, today));
  const records: DayRecord[] = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(start, i);
    const state = s.activeDays.includes(date)
      ? "active"
      : s.restDays.includes(date) || s.profile.restWeekdays.includes(weekday(date))
        ? "rest"
        : "missed";
    records.push({ date, state });
  }
  if (s.activeDays.includes(today)) records.push({ date: today, state: "active" });
  else if (s.restDays.includes(today) || s.profile.restWeekdays.includes(weekday(today))) records.push({ date: today, state: "rest" });
  return records;
}

export function selectStreak(s: Pick<State, "profile" | "activeDays" | "restDays">, today: string) {
  const days = selectDays(s, today);
  return { ...computeStreak(days), consistency: consistency(days), days };
}

export function taskProgress(t: Task): number {
  if (t.completedAt) return 1;
  if (t.subtasks.length === 0) return 0;
  return t.subtasks.filter((x) => x.done).length / t.subtasks.length;
}

/* ---------------- Demo data ---------------- */

function demoData(): Partial<State> {
  const tz = browserTz();
  const now = Date.now();
  const today = dreamDay(now, tz);
  const start = addDays(today, -24);

  // 24 days of history: mostly active, a couple of rests, yesterday missed → today is a save day.
  const activeDays: string[] = [];
  for (let i = 0; i < 24; i++) {
    const d = addDays(start, i);
    const isYesterday = i === 23;
    const skip = i === 6 || i === 15 || isYesterday; // misses
    if (!skip && weekday(d) !== 0) activeDays.push(d);
  }

  const goalId = "goal-diss";
  const tasks: Task[] = [
    { id: "t1", goalId, title: "Find remaining sources", estimatedMinutes: 90, dueOn: addDays(today, -3), createdOn: start, committed: true, completedAt: now - 4 * 86400000, subtasks: [], extensions: [] },
    {
      id: "t2",
      goalId,
      title: "Finish literature review",
      estimatedMinutes: 300,
      dueOn: addDays(today, 2),
      createdOn: start,
      committed: true,
      subtasks: [
        { id: "s1", title: "Read methodology notes", estimatedMinutes: 25, done: true, completedAt: now - 2 * 86400000 },
        { id: "s2", title: "Summarise Smith (2021)", estimatedMinutes: 25, done: true, completedAt: now - 86400000 * 2 },
        { id: "s3", title: "Find two more sources on body doubling", estimatedMinutes: 25, done: false },
        { id: "s4", title: "Write the themes section", estimatedMinutes: 50, done: false },
        { id: "s5", title: "Tidy citations", estimatedMinutes: 25, done: false },
      ],
      extensions: [],
    },
    { id: "t3", goalId, title: "Write methodology", estimatedMinutes: 240, dueOn: addDays(today, 9), createdOn: start, committed: true, subtasks: [], extensions: [] },
    { id: "t4", goalId, title: "Edit introduction", estimatedMinutes: 120, dueOn: addDays(today, 16), createdOn: start, committed: true, subtasks: [], extensions: [] },
    { id: "t5", goalId, title: "Check references", estimatedMinutes: 60, dueOn: addDays(today, 21), createdOn: start, committed: true, subtasks: [], extensions: [] },
    { id: "t6", goalId: "goal-site", title: "Write homepage copy", estimatedMinutes: 120, dueOn: addDays(today, 1), createdOn: addDays(today, -6), committed: false, subtasks: [{ id: "s6", title: "Write hero headline", estimatedMinutes: 15, done: false }], extensions: [] },
    { id: "t7", goalId: "goal-site", title: "Gather images and logo", estimatedMinutes: 60, dueOn: addDays(today, 4), createdOn: addDays(today, -1), committed: false, subtasks: [], extensions: [] },
  ];

  const tomorrow10 = zonedTimeToInstant(addDays(today, 1), "10:00", tz);
  const in3days = zonedTimeToInstant(addDays(today, 3), "07:30", tz);

  return {
    profile: { name: "Alex", email: "alex@example.com", timezone: tz, restWeekdays: [0], onboarded: true, createdOn: start, celebrations: true },
    goals: [
      { id: goalId, title: "Finish the first draft of my dissertation", category: "school", deadline: addDays(today, 28), intensity: "standard", committed: true, createdOn: start },
      { id: "goal-site", title: "Launch my portfolio website", category: "creative", deadline: addDays(today, 10), intensity: "gentle", committed: false, createdOn: addDays(today, -6) },
    ],
    tasks,
    activeDays,
    xp: 1840,
    achievements: ["first-session", "showed-up", "momentum-3", "saved-it", "on-time"],
    logs: [
      { id: "l1", type: "focus_hour", title: "Focus Hour", date: addDays(today, -2), endedAt: now - 2 * 86400000, blocks: 4, minutes: 100, taskId: "t2", planned: "Summarise Smith (2021)", outcome: "finished" },
      { id: "l2", type: "hosted", title: "Dissertation grind", date: addDays(today, -3), endedAt: now - 3 * 86400000, blocks: 2, minutes: 50, taskId: "t2", planned: "Read methodology notes", outcome: "good", with: ["Priya", "Sam"] },
      { id: "l3", type: "solo", title: "Solo session", date: addDays(today, -4), endedAt: now - 4 * 86400000, blocks: 1, minutes: 25, taskId: "t1", planned: "Find 3 sources", outcome: "distracted" },
      { id: "l4", type: "focus_hour", title: "Focus Hour", date: addDays(today, -5), endedAt: now - 5 * 86400000, blocks: 3, minutes: 75, taskId: "t1", planned: "Library search", outcome: "good" },
    ],
    sessions: [
      { id: "h1", title: "Dissertation grind", hostName: "Priya", isMine: false, start: tomorrow10, shape: { kickoffMinutes: 0, blocks: 2, blockMinutes: 50, breakMinutes: 10 }, visibility: "invite_only", mode: "cameras", capacity: 6, category: "school", attendees: ["Priya", "Sam"], invitedMe: true },
      { id: "h2", title: "Early birds: founders' sprint", hostName: "Jordan", isMine: false, start: in3days, shape: { kickoffMinutes: 0, blocks: 2, blockMinutes: 25, breakMinutes: 5 }, visibility: "public", mode: "cameras", capacity: 8, category: "business", attendees: ["Jordan", "Mei", "Tom"] },
      { id: "h3", title: "Quiet writing hour", hostName: "Ruth", isMine: false, start: zonedTimeToInstant(addDays(today, 2), "14:00", tz), shape: { kickoffMinutes: 0, blocks: 2, blockMinutes: 30, breakMinutes: 5 }, visibility: "public", mode: "quiet", capacity: 8, category: "creative", attendees: ["Ruth"] },
    ],
    buddies: [
      { id: "b1", name: "Priya", hue: 330, streak: 12, today: "active", missedYesterday: false, focusingNow: true, status: "active", deadlines: [{ title: "Stats coursework", dueOn: addDays(today, 3), state: "on_track" }] },
      { id: "b2", name: "Sam", hue: 160, streak: 4, today: "pending", missedYesterday: true, focusingNow: false, status: "active", deadlines: [{ title: "Invoice backlog", dueOn: today, state: "due_today" }] },
      { id: "b3", name: "Jordan", hue: 40, streak: 0, today: "pending", missedYesterday: false, focusingNow: false, status: "pending_in", deadlines: [] },
    ],
  };
}

/** Start instant for hosted sessions "now" rounded to the minute. */
export const roundedNow = (offsetMin: number) => Math.ceil(nowMs(offsetMin) / MINUTE) * MINUTE;

export type { State as StoreState, CheckInType };
