"use client";

/**
 * App state. Two modes:
 *  - "demo": everything lives in this browser (Try the demo, or Supabase not configured).
 *  - "live": signed in with Supabase. The store still updates instantly; each action
 *    then saves through src/lib/remote.ts. On load, loadLive() fills the store.
 * Components only call these actions, so they work the same in both modes.
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
import { loadLive, remote, type WitnessRequest } from "./remote";

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export interface Draft {
  category?: Category;
  goal?: string;
  deadline?: string;
  intensity: Intensity;
  steps: SuggestedStep[];
  /** Collected before the magic link / Google redirect, applied after sign-in. */
  account?: { name: string; dateOfBirth: string };
  /** Where to go after onboarding (e.g. a session someone was invited to). */
  next?: string;
}

export type Mode = "demo" | "live";

interface State {
  mode: Mode;
  userId?: string;
  loaded: boolean;
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
  witnessRequests: WitnessRequest[];
  activeSolo?: ActiveSolo;
  draft: Draft;
  /** Minutes added to the device clock: server clock skew in live mode, demo time travel in demo mode. */
  clockOffsetMin: number;
  toast?: { id: string; text: string };

  // lifecycle
  setDraft: (d: Partial<Draft>) => void;
  completeOnboarding: (name: string, email: string) => void;
  startLive: (userId: string, email: string) => Promise<void>;
  finishLiveOnboarding: (userId: string, email: string) => Promise<void>;
  loadDemo: () => void;
  reset: () => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;

  // goals & tasks
  addGoal: (g: { title: string; category: Category; deadline?: string; intensity: Intensity; steps: SuggestedStep[] }) => string;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  setGoalCommitted: (id: string, committed: boolean) => void;
  deleteGoal: (id: string) => void;
  addTask: (goalId: string, title: string, estimatedMinutes?: number) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;
  addSubtasks: (taskId: string, steps: SuggestedStep[]) => void;
  toggleSubtask: (taskId: string, subId: string) => void;
  deleteSubtask: (taskId: string, subId: string) => void;
  recascade: (goalId: string) => void;
  requestExtension: (taskId: string, newDue: string, reason: string, witnessBuddyId?: string) => void;
  approveExtension: (id: string) => void;

  // sessions
  logSession: (log: Omit<SessionLog, "id" | "date" | "endedAt">, sessionId?: string) => void;
  createSession: (s: Omit<HostedSession, "id" | "isMine" | "hostName" | "attendees">) => string;
  respondInvite: (id: string, response: "accepted" | "declined") => void;
  inviteBuddyToSession: (sessionId: string, buddyId: string) => void;
  refreshSessions: () => Promise<void>;
  startSolo: (shape: SessionShape) => void;
  pauseSolo: () => void;
  resumeSolo: () => void;
  endSolo: () => void;

  // buddies & safety
  nudge: (buddyId: string, message: string) => void;
  acceptBuddy: (buddyId: string) => void;
  addBuddyRequest: (nameOrEmail: string, userId?: string) => void;
  removeBuddy: (buddyId: string) => void;
  refreshBuddies: () => Promise<void>;
  reportUser: (userId: string, reason: string, description?: string, sessionId?: string) => void;
  blockUser: (userId: string) => void;

  // profile
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
  mode: "demo" as Mode,
  userId: undefined as string | undefined,
  loaded: false,
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
  witnessRequests: [] as WitnessRequest[],
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
      const isLive = () => get().mode === "live" && !!get().userId;

      /** Save to Supabase in live mode; the screen has already updated. */
      const save = (what: string, fn: () => Promise<unknown>) => {
        if (!isLive()) return;
        fn().catch((e: Error) => {
          console.error(e);
          get().showToast(`Couldn’t save ${what}. Check your connection and try again.`);
        });
      };

      const award = (action: string, amount: number) => {
        const day = today();
        const earned = get().xpByDay[day] ?? 0;
        const gain = capDailyXp(earned, amount);
        if (gain <= 0) return;
        set((s) => ({ xp: s.xp + gain, xpByDay: { ...s.xpByDay, [day]: earned + gain } }));
        save("XP", () => remote.addXp(action, gain, day));
      };

      const unlock = (key: AchievementKey) => {
        if (get().achievements.includes(key)) return false;
        set((s) => ({ achievements: [...s.achievements, key] }));
        save("achievement", () => remote.saveProfile(get().userId!, { achievements: get().achievements }));
        return true;
      };

      /** Record activity for today; awards save-day XP and streak achievements. */
      const markActive = () => {
        const s = get();
        const day = today();
        if (s.activeDays.includes(day)) return;
        const before = selectStreak(s, day);
        set({ activeDays: [...s.activeDays, day] });
        save("today’s streak", () => remote.markDay(day, "active"));
        if (before.saveDay) {
          award("streak_saved", XP.streakSaved);
          unlock("saved-it");
        }
        if (before.lastBrokenOn && before.current === 0 && daysBetween(before.lastBrokenOn, day) <= 2) unlock("comeback");
        const after = selectStreak(get(), day);
        if (after.current >= 3) unlock("momentum-3");
      };

      return {
        ...initialData(),

        setDraft: (d) => set((s) => ({ draft: { ...s.draft, ...d } })),

        /* ---------- lifecycle ---------- */

        completeOnboarding: (name, email) => {
          const s = get();
          const day = today();
          const { draft } = s;
          set((st) => ({ mode: "demo", profile: { ...st.profile, name, email, onboarded: true, createdOn: st.profile.createdOn || day } }));
          if (draft.goal && draft.category) {
            get().addGoal({ title: draft.goal, category: draft.category, deadline: draft.deadline, intensity: draft.intensity, steps: draft.steps });
          }
          set({ draft: { intensity: "standard", steps: [] } });
        },

        startLive: async (userId, email) => {
          const data = await loadLive(userId, email);
          const keepSolo = get().userId === userId ? get().activeSolo : undefined;
          set({ ...data, mode: "live", userId, loaded: true, activeSolo: keepSolo });
          for (const n of data.incomingNudges) get().showToast(`${n.from}: ${n.message}`);
        },

        finishLiveOnboarding: async (userId, email) => {
          const { draft } = get();
          const tz = browserTz();
          const day = dreamDay(Date.now(), tz);
          // Start from a clean slate for this account, then write the plan made before sign-in.
          set({ ...initialData(), mode: "live", userId, draft, profile: { ...emptyProfile(), email } });
          const name = draft.account?.name ?? email.split("@")[0];
          await remote.saveProfile(userId, { name, timezone: tz, onboarded: true, createdOn: day });
          if (draft.account?.dateOfBirth) await remote.saveDateOfBirth(userId, draft.account.dateOfBirth);
          if (draft.goal && draft.category) {
            const id = uid();
            const committed = draft.deadline ? draft.intensity !== "gentle" : false;
            const goal: Goal = { id, title: draft.goal, category: draft.category, deadline: draft.deadline, intensity: draft.intensity, committed, createdOn: day };
            const tasks = buildTasks(id, draft.steps, day, draft.deadline, draft.intensity, [], committed);
            await remote.insertGoal(goal, tasks);
          }
          await get().startLive(userId, email);
          set((s) => ({ draft: { intensity: "standard", steps: [], next: s.draft.next } }));
        },

        signOut: async () => {
          if (get().mode === "live") {
            const { supabase } = await import("./supabase/client");
            await supabase().auth.signOut();
          }
          set({ ...initialData() });
        },

        deleteAccount: async () => {
          if (isLive()) await remote.deleteAccount();
          set({ ...initialData() });
        },

        reset: () => set({ ...initialData() }),
        loadDemo: () => set({ ...initialData(), ...demoData(), mode: "demo", loaded: true }),

        /* ---------- goals & tasks ---------- */

        addGoal: ({ title, category, deadline, intensity, steps }) => {
          const id = uid();
          const day = today();
          const committed = deadline ? intensity !== "gentle" : false;
          const goal: Goal = { id, title, category, deadline, intensity, committed, createdOn: day };
          const tasks = buildTasks(id, steps, day, deadline, intensity, get().profile.restWeekdays, committed);
          set((s) => ({ goals: [...s.goals, goal], tasks: [...s.tasks, ...tasks] }));
          save("your goal", () => remote.insertGoal(goal, tasks));
          return id;
        },

        updateGoal: (id, patch) => {
          set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
          save("your goal", () => remote.updateGoal(id, patch));
        },

        setGoalCommitted: (id, committed) => {
          set((s) => ({
            goals: s.goals.map((g) => (g.id === id ? { ...g, committed } : g)),
            tasks: s.tasks.map((t) => (t.goalId === id ? { ...t, committed } : t)),
          }));
          save("your goal", () => remote.setGoalCommitted(id, committed));
        },

        deleteGoal: (id) => {
          set((s) => ({ goals: s.goals.filter((g) => g.id !== id), tasks: s.tasks.filter((t) => t.goalId !== id) }));
          save("the deletion", () => remote.deleteGoal(id));
        },

        addTask: (goalId, title, estimatedMinutes = 60) => {
          const g = get().goals.find((x) => x.id === goalId);
          const task: Task = { id: uid(), goalId, title, estimatedMinutes, createdOn: today(), committed: g?.committed ?? false, subtasks: [], extensions: [], dueOn: g?.deadline };
          set((s) => ({ tasks: [...s.tasks, task] }));
          save("the task", () => remote.insertTasks([task]));
        },

        updateTask: (id, patch) => {
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
          save("the task", () => remote.updateTask(id, patch));
        },

        deleteTask: (id) => {
          set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
          save("the deletion", () => remote.deleteTask(id));
        },

        toggleTask: (id) => {
          const t = get().tasks.find((x) => x.id === id);
          if (!t) return;
          const completing = !t.completedAt;
          const completedAt = completing ? nowMs(get().clockOffsetMin) : undefined;
          set((s) => ({ tasks: s.tasks.map((x) => (x.id === id ? { ...x, completedAt } : x)) }));
          save("the task", () => remote.updateTask(id, { completedAt }));
          if (completing) {
            award("task", XP.task);
            if (t.dueOn && t.committed && daysBetween(today(), t.dueOn) >= 0) {
              award("deadline_hit", XP.deadlineHit);
              unlock("on-time");
            }
            markActive();
            get().showToast("✨ Task done. Nice.");
          }
        },

        addSubtasks: (taskId, steps) => {
          const subs = steps.map((st): Subtask => ({ id: uid(), title: st.title, estimatedMinutes: st.estimatedMinutes, done: false }));
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, subtasks: [...t.subtasks, ...subs] } : t)) }));
          save("the steps", () => remote.insertSubtasks(subs.map((x) => ({ ...x, taskId }))));
        },

        toggleSubtask: (taskId, subId) => {
          const t = get().tasks.find((x) => x.id === taskId);
          const sub = t?.subtasks.find((x) => x.id === subId);
          if (!t || !sub) return;
          const completing = !sub.done;
          const completedAt = completing ? (sub.completedAt ?? nowMs(get().clockOffsetMin)) : sub.completedAt;
          set((s) => ({
            tasks: s.tasks.map((x) => (x.id === taskId ? { ...x, subtasks: x.subtasks.map((y) => (y.id === subId ? { ...y, done: completing, completedAt } : y)) } : x)),
          }));
          save("the step", () => remote.updateSubtask(subId, completing, completedAt));
          // XP once per subtask, ever (no tick/untick farming)
          if (completing && !sub.completedAt) {
            award("subtask", XP.subtask);
            markActive();
          }
        },

        deleteSubtask: (taskId, subId) => {
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, subtasks: t.subtasks.filter((x) => x.id !== subId) } : t)) }));
          save("the deletion", () => remote.deleteSubtask(subId));
        },

        recascade: (goalId) => {
          const g = get().goals.find((x) => x.id === goalId);
          if (!g?.deadline) return;
          const open = get().tasks.filter((t) => t.goalId === goalId && !t.completedAt);
          const due = cascadeDeadlines({ start: today(), deadline: g.deadline, tasks: open, restWeekdays: get().profile.restWeekdays, intensity: g.intensity });
          set((s) => ({ tasks: s.tasks.map((t) => (due[t.id] ? { ...t, dueOn: due[t.id] } : t)) }));
          save("the new plan", () => remote.updateTaskDates(due));
        },

        requestExtension: (taskId, newDue, reason, witnessBuddyId) => {
          const t = get().tasks.find((x) => x.id === taskId);
          if (!t?.dueOn) return;
          const buddy = get().buddies.find((b) => b.id === witnessBuddyId);
          const witness = buddy?.name;
          const ext: Extension = { id: uid(), oldDue: t.dueOn, newDue, reason, witness, status: witness ? "pending" : "self_approved", createdAt: nowMs(get().clockOffsetMin) };
          set((s) => ({ tasks: s.tasks.map((x) => (x.id === taskId ? { ...x, extensions: [...x.extensions, ext], dueOn: witness ? x.dueOn : newDue } : x)) }));

          if (isLive()) {
            save("the extension", () => remote.requestExtension({ id: ext.id, taskId, witnessUserId: buddy?.userId, oldDue: t.dueOn!, newDue, reason }));
          } else if (witness) {
            // Demo: the buddy approves after a moment.
            setTimeout(() => {
              set((s) => ({
                tasks: s.tasks.map((x) => (x.id === taskId ? { ...x, dueOn: newDue, extensions: x.extensions.map((e) => (e.id === ext.id ? { ...e, status: "approved" } : e)) } : x)),
              }));
              get().showToast(`${witness} approved your extension.`);
            }, 4000);
          }
        },

        approveExtension: (id) => {
          const req = get().witnessRequests.find((w) => w.id === id);
          set((s) => ({ witnessRequests: s.witnessRequests.filter((w) => w.id !== id) }));
          save("your approval", () => remote.approveExtension(id));
          if (req) get().showToast(`Approved. ${req.fromName}’s deadline moved.`);
        },

        /* ---------- sessions ---------- */

        logSession: (log, sessionId) => {
          const s = get();
          const entry: SessionLog = { ...log, taskId: s.tasks.some((t) => t.id === log.taskId) ? log.taskId : undefined, id: uid(), date: today(), endedAt: nowMs(s.clockOffsetMin) };
          set((st) => ({ logs: [entry, ...st.logs] }));
          save("the session", () => remote.insertLog(entry, sessionId));
          if (log.blocks > 0) {
            award("focus_blocks", XP.focusBlock * log.blocks);
            if (log.type === "focus_hour" && log.blocks >= FOCUS_HOUR.shape.blocks) award("full_focus_hour", XP.fullFocusHour);
            unlock("first-session");
            if (log.type === "focus_hour") unlock("showed-up");
            if (log.type === "hosted" && (log.with?.length ?? 0) > 0 && s.sessions.find((x) => x.id === sessionId)?.isMine) {
              award("hosted", XP.hostedWithOthers);
              unlock("host");
            }
            const totalMin = get().logs.reduce((a, l) => a + l.minutes, 0);
            if (totalMin >= 600) unlock("ten-hours");
            markActive();
          }
        },

        createSession: (input) => {
          const id = uid();
          const session: HostedSession = { ...input, id, isMine: true, hostName: get().profile.name || "You", hostUserId: get().userId, attendees: [] };
          set((s) => ({ sessions: [...s.sessions, session] }));
          save("your session", () => remote.createSession(get().userId!, session));
          return id;
        },

        respondInvite: (id, response) => {
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, response } : x)) }));
          save("your reply", () => remote.respondInvite(get().userId!, id, response));
        },

        inviteBuddyToSession: (sessionId, buddyId) => {
          const b = get().buddies.find((x) => x.id === buddyId);
          if (!b) return;
          get().showToast(`${b.name} has been invited.`);
          if (b.userId) save("the invite", () => remote.inviteBuddy(get().userId!, sessionId, b.userId!));
        },

        refreshSessions: async () => {
          if (!isLive()) return;
          try {
            const sessions = await remote.refreshSessions();
            set({ sessions });
          } catch (e) {
            console.error(e);
          }
        },

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

        /* ---------- buddies & safety ---------- */

        nudge: (buddyId, message) => {
          const day = today();
          set((s) => ({ nudged: { ...s.nudged, [buddyId]: day } }));
          const b = get().buddies.find((x) => x.id === buddyId);
          get().showToast(`Nudge sent to ${b?.name ?? "your buddy"}.`);
          if (b?.userId) save("the nudge", () => remote.nudge(b.userId!, message, day));
        },

        acceptBuddy: (buddyId) => {
          set((s) => ({ buddies: s.buddies.map((b) => (b.id === buddyId ? { ...b, status: "active" } : b)) }));
          save("the buddy request", () => remote.acceptBuddy(buddyId).then(() => get().refreshBuddies()));
        },

        addBuddyRequest: (nameOrEmail, userId) => {
          if (!isLive()) {
            set((s) => ({
              buddies: [
                ...s.buddies,
                { id: uid(), name: nameOrEmail, hue: Math.floor(Math.random() * 360), streak: 0, today: "pending", missedYesterday: false, focusingNow: false, deadlines: [], status: "pending_out" },
              ],
            }));
            return;
          }
          remote
            .requestBuddy(userId ? { userId } : { email: nameOrEmail })
            .then((r) => {
              get().showToast(r === "accepted" ? "You’re now buddies." : userId ? "Buddy request sent." : `If ${nameOrEmail} is on DreamHub, they’ll get your request.`);
              return get().refreshBuddies();
            })
            .catch((e: Error) => get().showToast(e.message));
        },

        removeBuddy: (buddyId) => {
          set((s) => ({ buddies: s.buddies.filter((b) => b.id !== buddyId) }));
          save("the change", () => remote.removeBuddy(buddyId));
        },

        refreshBuddies: async () => {
          if (!isLive()) return;
          try {
            const buddies = await remote.refreshBuddies(nowMs(get().clockOffsetMin));
            set({ buddies });
          } catch (e) {
            console.error(e);
          }
        },

        reportUser: (userId, reason, description, sessionId) => {
          get().showToast("Thanks for letting us know.");
          save("the report", () => remote.report(userId, reason, description, sessionId));
        },

        blockUser: (userId) => {
          set((s) => ({ buddies: s.buddies.filter((b) => b.userId !== userId) }));
          get().showToast("Blocked. You won’t be seated together or see each other’s sessions.");
          save("the block", () => remote.block(userId));
        },

        /* ---------- profile ---------- */

        setRestWeekdays: (days) => {
          const restWeekdays = days.slice(0, 2);
          set((s) => ({ profile: { ...s.profile, restWeekdays } }));
          save("your rest days", () => remote.saveProfile(get().userId!, { restWeekdays }));
        },
        addRestDay: (date) => {
          set((s) => ({ restDays: [...new Set([...s.restDays, date])] }));
          save("your rest day", () => remote.markDay(date, "rest"));
        },
        setProfile: (patch) => {
          set((s) => ({ profile: { ...s.profile, ...patch } }));
          save("your profile", () => remote.saveProfile(get().userId!, patch));
        },
        setClockOffset: (min) => set({ clockOffsetMin: min }),
        showToast: (text) => {
          const id = uid();
          set({ toast: { id, text } });
          setTimeout(() => {
            if (get().toast?.id === id) set({ toast: undefined });
          }, 3600);
        },
      };
    },
    {
      name: "dreamhub-v1",
      // Live accounts keep only device-local bits here; their data is reloaded from Supabase.
      partialize: (s) =>
        s.mode === "live"
          ? { mode: s.mode, userId: s.userId, draft: s.draft, activeSolo: s.activeSolo, profile: s.profile }
          : { ...s, toast: undefined, witnessRequests: [], loaded: false },
    },
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
