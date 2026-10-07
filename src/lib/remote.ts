"use client";

/**
 * Supabase data layer. The store stays the single source of truth for the UI:
 * it updates instantly, then these functions save the change. Loading maps
 * database rows into the same shapes the demo uses, so every screen works
 * unchanged in both modes.
 */
import { supabase } from "./supabase/client";
import type { Buddy, Extension, Goal, HostedSession, Profile, SessionLog, Subtask, Task } from "./types";
import type { AchievementKey } from "./domain/xp";
import { computeStreak, type DayRecord } from "./domain/streak";
import { addDays, daysBetween, dreamDay, weekday, MINUTE } from "./domain/time";
import { deadlineState } from "./domain/cascade";

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

export interface WitnessRequest {
  id: string;
  fromName: string;
  taskTitle: string;
  oldDue: string;
  newDue: string;
  reason: string;
}

export interface LiveData {
  profile: Profile;
  goals: Goal[];
  tasks: Task[];
  activeDays: string[];
  restDays: string[];
  xp: number;
  xpByDay: Record<string, number>;
  achievements: AchievementKey[];
  sessions: HostedSession[];
  logs: SessionLog[];
  buddies: Buddy[];
  nudged: Record<string, string>;
  witnessRequests: WitnessRequest[];
  incomingNudges: { from: string; message: string }[];
  clockOffsetMin: number;
}

const must = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
};

export async function loadLive(userId: string, email: string): Promise<LiveData> {
  const db = supabase();
  // Auto-approve any extensions nobody answered in 24 hours before reading tasks.
  await db.rpc("settle_my_extensions");

  const [profileR, goalsR, tasksR, subsR, extR, daysR, xpR, logsR, sessionsR, buddiesR, witnessR, nudgesR, sentR, nowR] = await Promise.all([
    db.from("profiles").select("*").eq("id", userId).single(),
    db.from("goals").select("*").eq("user_id", userId).order("created_at"),
    db.from("tasks").select("*").eq("user_id", userId).order("sort_order").order("created_at"),
    db.from("subtasks").select("*").eq("user_id", userId).order("sort_order").order("created_at"),
    db.from("deadline_extensions").select("*, witness:profiles!deadline_extensions_witness_user_id_fkey(name)").eq("user_id", userId).order("created_at"),
    db.from("daily_activity").select("local_date, state").eq("user_id", userId),
    db.from("xp_events").select("amount, local_date").eq("user_id", userId),
    db.from("session_logs").select("*").eq("user_id", userId).order("ended_at", { ascending: false }).limit(100),
    db.rpc("list_sessions"),
    db.rpc("buddy_overview"),
    db
      .from("deadline_extensions")
      .select("id, old_due, new_due, reason, owner:profiles!deadline_extensions_user_id_fkey(name), task:tasks(title)")
      .eq("witness_user_id", userId)
      .eq("status", "pending"),
    db.from("nudges").select("id, message, sender:profiles!nudges_from_user_id_fkey(name)").eq("to_user_id", userId).eq("seen", false),
    db.from("nudges").select("to_user_id, local_date").eq("from_user_id", userId).gte("local_date", addDays(new Date().toISOString().slice(0, 10), -2)),
    db.rpc("server_now"),
  ]);

  const p = must(profileR, "profile");
  const profile: Profile = {
    name: p.name,
    email,
    timezone: p.timezone,
    restWeekdays: p.rest_weekdays ?? [],
    onboarded: p.onboarded,
    createdOn: p.created_on,
    celebrations: p.celebrations,
  };

  const subs = must(subsR, "steps") as Row[];
  const exts = must(extR, "extensions") as Row[];
  const tasks: Task[] = (must(tasksR, "tasks") as Row[]).map((t) => ({
    id: t.id,
    goalId: t.goal_id,
    title: t.title,
    estimatedMinutes: t.estimated_minutes,
    dueOn: t.due_on ?? undefined,
    createdOn: t.created_on,
    committed: t.committed,
    completedAt: t.completed_at ? Date.parse(t.completed_at) : undefined,
    subtasks: subs
      .filter((s) => s.task_id === t.id)
      .map((s): Subtask => ({ id: s.id, title: s.title, estimatedMinutes: s.estimated_minutes, done: s.done, completedAt: s.completed_at ? Date.parse(s.completed_at) : undefined })),
    extensions: exts
      .filter((e) => e.task_id === t.id)
      .map(
        (e): Extension => ({
          id: e.id,
          oldDue: e.old_due,
          newDue: e.new_due,
          reason: e.reason,
          witness: e.witness?.name ?? undefined,
          status: e.status === "pending" ? "pending" : e.status === "self_approved" ? "self_approved" : "approved",
          createdAt: Date.parse(e.created_at),
        }),
      ),
  }));

  const goals: Goal[] = (must(goalsR, "goals") as Row[]).map((g) => ({
    id: g.id,
    title: g.title,
    category: g.category,
    deadline: g.deadline ?? undefined,
    intensity: g.intensity,
    committed: g.committed,
    createdOn: g.created_on,
    completedAt: g.completed_at ? Date.parse(g.completed_at) : undefined,
  }));

  const days = must(daysR, "days") as Row[];
  const xpRows = must(xpR, "xp") as Row[];
  const xpByDay: Record<string, number> = {};
  for (const x of xpRows) xpByDay[x.local_date] = (xpByDay[x.local_date] ?? 0) + x.amount;

  const logs: SessionLog[] = (must(logsR, "logs") as Row[]).map((l) => ({
    id: l.id,
    type: l.type,
    title: l.title,
    date: l.local_date,
    endedAt: Date.parse(l.ended_at),
    blocks: l.blocks,
    minutes: l.minutes,
    taskId: l.task_id ?? undefined,
    planned: l.planned ?? undefined,
    outcome: l.outcome,
    with: l.with_names ?? [],
  }));

  const sessions: HostedSession[] = ((must(sessionsR, "sessions") as Row[]) ?? []).map(mapSession);

  const serverNow = Date.parse(must(nowR, "clock") as string);
  const clockOffsetMin = Number.isFinite(serverNow) ? Math.round(((serverNow - Date.now()) / MINUTE) * 100) / 100 : 0;
  const now = Date.now() + clockOffsetMin * MINUTE;

  const buddies: Buddy[] = ((must(buddiesR, "buddies") as Row[]) ?? []).map((b) => mapBuddy(b, now));

  const nudged: Record<string, string> = {};
  const sent = (must(sentR, "nudges sent") as Row[]) ?? [];
  for (const b of buddies) {
    const n = sent.find((x) => x.to_user_id === b.userId);
    if (n) nudged[b.id] = n.local_date;
  }

  const witnessRequests: WitnessRequest[] = ((must(witnessR, "extension requests") as Row[]) ?? []).map((w) => ({
    id: w.id,
    fromName: w.owner?.name ?? "A buddy",
    taskTitle: w.task?.title ?? "a task",
    oldDue: w.old_due,
    newDue: w.new_due,
    reason: w.reason,
  }));

  const incoming = (must(nudgesR, "nudges") as Row[]) ?? [];
  if (incoming.length) await db.from("nudges").update({ seen: true }).in("id", incoming.map((n) => n.id));

  return {
    profile,
    goals,
    tasks,
    activeDays: days.filter((d) => d.state === "active").map((d) => d.local_date),
    restDays: days.filter((d) => d.state === "rest").map((d) => d.local_date),
    xp: xpRows.reduce((a, x) => a + x.amount, 0),
    xpByDay,
    achievements: p.achievements ?? [],
    sessions,
    logs,
    buddies,
    nudged,
    witnessRequests,
    incomingNudges: incoming.map((n) => ({ from: n.sender?.name ?? "A buddy", message: n.message })),
    clockOffsetMin,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export function mapSession(s: Row): HostedSession {
  return {
    id: s.id,
    title: s.title,
    hostName: s.host_name ?? "",
    hostUserId: s.host_user_id,
    isMine: !!s.is_mine,
    start: Date.parse(s.scheduled_start),
    shape: { kickoffMinutes: s.kickoff_minutes, blocks: s.block_count, blockMinutes: s.block_minutes, breakMinutes: s.break_minutes },
    visibility: s.visibility,
    mode: s.mode,
    capacity: s.capacity,
    category: s.category,
    attendees: (s.attendees ?? []).filter((n: string, i: number) => !(i === 0 && n === s.host_name)),
    invitedMe: !!s.invited_me,
    response: s.my_response === "accepted" || s.my_response === "declined" ? s.my_response : undefined,
  };
}

function mapBuddy(b: Row, now: number): Buddy {
  const tz: string = b.timezone || "Europe/London";
  const today = dreamDay(now, tz);
  const active = new Set<string>(b.active_days ?? []);
  const rest = new Set<string>(b.rest_days ?? []);
  const restWeekdays: number[] = b.rest_weekdays ?? [];
  const start: string = b.created_on ?? today;
  const records: DayRecord[] = [];
  for (let i = 0; i < Math.max(0, daysBetween(start, today)); i++) {
    const d = addDays(start, i);
    records.push({ date: d, state: active.has(d) ? "active" : rest.has(d) || restWeekdays.includes(weekday(d)) ? "rest" : "missed" });
  }
  if (active.has(today)) records.push({ date: today, state: "active" });
  const streak = computeStreak(records);
  const yesterday = addDays(today, -1);
  const isRestDay = (d: string) => rest.has(d) || restWeekdays.includes(weekday(d));
  const focusing = b.focusing_until ? Date.parse(b.focusing_until) > now : false;

  return {
    id: b.relation_id,
    userId: b.user_id,
    name: b.name || "Someone",
    hue: b.hue ?? 230,
    streak: streak.current,
    today: active.has(today) ? "active" : isRestDay(today) ? "rest" : "pending",
    missedYesterday: start <= yesterday && !active.has(yesterday) && !isRestDay(yesterday) && streak.current > 0,
    focusingNow: focusing,
    status: b.status === "active" ? "active" : b.incoming ? "pending_in" : "pending_out",
    deadlines: ((b.deadlines ?? []) as Row[]).map((d) => ({
      title: d.title,
      dueOn: d.dueOn,
      state: d.done ? "done" : (deadlineState({ createdOn: d.createdOn, dueOn: d.dueOn, today, progress: 0, completed: false }) as "on_track"),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

const isoOrNull = (ms?: number) => (ms ? new Date(ms).toISOString() : null);

async function run(what: string, p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
}

export const remote = {
  async saveProfile(userId: string, patch: Partial<Profile> & { achievements?: string[] }) {
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.timezone !== undefined) row.timezone = patch.timezone;
    if (patch.restWeekdays !== undefined) row.rest_weekdays = patch.restWeekdays;
    if (patch.onboarded !== undefined) row.onboarded = patch.onboarded;
    if (patch.createdOn !== undefined) row.created_on = patch.createdOn;
    if (patch.celebrations !== undefined) row.celebrations = patch.celebrations;
    if (patch.achievements !== undefined) row.achievements = patch.achievements;
    if (Object.keys(row).length) await run("profile", supabase().from("profiles").update(row).eq("id", userId));
  },

  async saveDateOfBirth(userId: string, dob: string) {
    await run("date of birth", supabase().from("profiles_private").update({ date_of_birth: dob }).eq("id", userId));
  },

  async insertGoal(g: Goal, tasks: Task[]) {
    await run(
      "goal",
      supabase().from("goals").insert({ id: g.id, title: g.title, category: g.category, deadline: g.deadline ?? null, intensity: g.intensity, committed: g.committed, created_on: g.createdOn }),
    );
    if (tasks.length) await remote.insertTasks(tasks);
  },

  async updateGoal(id: string, patch: Partial<Goal>) {
    const row: Row = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.intensity !== undefined) row.intensity = patch.intensity;
    if (patch.committed !== undefined) row.committed = patch.committed;
    if (patch.deadline !== undefined) row.deadline = patch.deadline;
    if ("completedAt" in patch) row.completed_at = isoOrNull(patch.completedAt);
    if (Object.keys(row).length) await run("goal", supabase().from("goals").update(row).eq("id", id));
  },

  async deleteGoal(id: string) {
    await run("goal", supabase().from("goals").delete().eq("id", id));
  },

  async insertTasks(tasks: Task[]) {
    await run(
      "tasks",
      supabase()
        .from("tasks")
        .insert(
          tasks.map((t, i) => ({
            id: t.id,
            goal_id: t.goalId,
            title: t.title,
            estimated_minutes: t.estimatedMinutes,
            due_on: t.dueOn ?? null,
            created_on: t.createdOn,
            committed: t.committed,
            sort_order: i,
          })),
        ),
    );
    const subs = tasks.flatMap((t) => t.subtasks.map((s) => ({ ...s, taskId: t.id })));
    if (subs.length) await remote.insertSubtasks(subs);
  },

  async updateTask(id: string, patch: Partial<Task>) {
    const row: Row = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.dueOn !== undefined) row.due_on = patch.dueOn;
    if (patch.committed !== undefined) row.committed = patch.committed;
    if (patch.estimatedMinutes !== undefined) row.estimated_minutes = patch.estimatedMinutes;
    if ("completedAt" in patch) row.completed_at = isoOrNull(patch.completedAt);
    if (Object.keys(row).length) await run("task", supabase().from("tasks").update(row).eq("id", id));
  },

  async updateTaskDates(dates: Record<string, string>) {
    await Promise.all(Object.entries(dates).map(([id, due]) => run("task date", supabase().from("tasks").update({ due_on: due }).eq("id", id))));
  },

  async setGoalCommitted(goalId: string, committed: boolean) {
    await run("goal", supabase().from("goals").update({ committed }).eq("id", goalId));
    await run("tasks", supabase().from("tasks").update({ committed }).eq("goal_id", goalId));
  },

  async deleteTask(id: string) {
    await run("task", supabase().from("tasks").delete().eq("id", id));
  },

  async insertSubtasks(subs: (Subtask & { taskId: string })[]) {
    await run(
      "steps",
      supabase()
        .from("subtasks")
        .insert(subs.map((s, i) => ({ id: s.id, task_id: s.taskId, title: s.title, estimated_minutes: s.estimatedMinutes, done: s.done, sort_order: i }))),
    );
  },

  async updateSubtask(id: string, done: boolean, completedAt?: number) {
    await run("step", supabase().from("subtasks").update({ done, completed_at: isoOrNull(completedAt) }).eq("id", id));
  },

  async deleteSubtask(id: string) {
    await run("step", supabase().from("subtasks").delete().eq("id", id));
  },

  async requestExtension(e: { id: string; taskId: string; witnessUserId?: string; oldDue: string; newDue: string; reason: string }) {
    await run(
      "extension",
      supabase()
        .from("deadline_extensions")
        .insert({ id: e.id, task_id: e.taskId, witness_user_id: e.witnessUserId ?? null, old_due: e.oldDue, new_due: e.newDue, reason: e.reason, status: e.witnessUserId ? "pending" : "self_approved" }),
    );
    if (!e.witnessUserId) await run("extension", supabase().rpc("apply_self_extension", { p_extension: e.id }));
  },

  async approveExtension(id: string) {
    await run("approve", supabase().rpc("approve_extension", { p_extension: id }));
  },

  async markDay(localDate: string, state: "active" | "rest") {
    await run("streak day", supabase().from("daily_activity").upsert({ local_date: localDate, state }, { onConflict: "user_id,local_date" }));
  },

  async addXp(action: string, amount: number, localDate: string) {
    await run("xp", supabase().from("xp_events").insert({ action, amount, local_date: localDate }));
  },

  async insertLog(l: SessionLog, sessionId?: string) {
    await run(
      "session log",
      supabase()
        .from("session_logs")
        .insert({
          id: l.id,
          session_id: sessionId ?? null,
          type: l.type,
          title: l.title,
          local_date: l.date,
          ended_at: new Date(l.endedAt).toISOString(),
          blocks: l.blocks,
          minutes: l.minutes,
          task_id: l.taskId ?? null,
          planned: l.planned ?? null,
          outcome: l.outcome,
          with_names: l.with ?? [],
        }),
    );
  },

  async createSession(userId: string, s: HostedSession) {
    await run(
      "session",
      supabase().from("sessions").insert({
        id: s.id,
        type: "hosted",
        host_user_id: userId,
        title: s.title,
        category: s.category,
        visibility: s.visibility,
        mode: s.mode,
        capacity: s.capacity,
        kickoff_minutes: s.shape.kickoffMinutes,
        block_count: s.shape.blocks,
        block_minutes: s.shape.blockMinutes,
        break_minutes: s.shape.breakMinutes,
        scheduled_start: new Date(s.start).toISOString(),
      }),
    );
  },

  async respondInvite(userId: string, sessionId: string, status: "accepted" | "declined") {
    const db = supabase();
    const { data, error } = await db.from("session_invites").update({ status }).eq("session_id", sessionId).eq("invitee_user_id", userId).select("id");
    if (error) throw new Error(`invite: ${error.message}`);
    if (!data?.length) await run("invite", db.from("session_invites").insert({ session_id: sessionId, inviter_id: userId, invitee_user_id: userId, status }));
  },

  async inviteBuddy(userId: string, sessionId: string, buddyUserId: string) {
    await run("invite", supabase().from("session_invites").insert({ session_id: sessionId, inviter_id: userId, invitee_user_id: buddyUserId }));
  },

  async nudge(toUserId: string, message: string, localDate: string) {
    await run("nudge", supabase().from("nudges").insert({ to_user_id: toUserId, message, local_date: localDate }));
  },

  async requestBuddy(opts: { email?: string; userId?: string }) {
    const { data, error } = await supabase().rpc("request_buddy", { p_email: opts.email ?? null, p_user: opts.userId ?? null });
    if (error) throw new Error(error.message.includes("limit") ? "You can have up to 10 buddies." : `buddy: ${error.message}`);
    return data as "sent" | "accepted";
  },

  async acceptBuddy(relationId: string) {
    await run("buddy", supabase().from("buddies").update({ status: "active" }).eq("id", relationId));
  },

  async removeBuddy(relationId: string) {
    await run("buddy", supabase().from("buddies").delete().eq("id", relationId));
  },

  async report(userId: string, reason: string, description?: string, sessionId?: string) {
    // No .select(): reports are deliberately unreadable by users.
    await run("report", supabase().from("reports").insert({ reported_user_id: userId, reason, description: description ?? null, session_id: sessionId ?? null }));
  },

  async block(userId: string) {
    await run("block", supabase().rpc("block_user", { p_user: userId }));
  },

  async checkIn(sessionId: string, block: number, type: string, message?: string) {
    await run("check-in", supabase().from("check_ins").insert({ session_id: sessionId, block, type, message: message || null }));
  },

  async deleteAccount() {
    await run("delete account", supabase().rpc("delete_my_account"));
    await supabase().auth.signOut();
  },

  async refreshBuddies(now: number): Promise<Buddy[]> {
    const r = await supabase().rpc("buddy_overview");
    return ((must(r, "buddies") as Row[]) ?? []).map((b) => mapBuddy(b, now));
  },

  async refreshSessions(): Promise<HostedSession[]> {
    const r = await supabase().rpc("list_sessions");
    return ((must(r, "sessions") as Row[]) ?? []).map(mapSession);
  },
};
