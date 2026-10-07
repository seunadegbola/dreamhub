/**
 * Front-end models. These mirror the PRD data model (§19) closely so the
 * Supabase milestone can map tables onto them with minimal change.
 */
import type { Category } from "./domain/breakdown";
import type { Intensity } from "./domain/cascade";
import type { SessionShape } from "./domain/session";

export interface Profile {
  name: string;
  email: string;
  timezone: string;
  restWeekdays: number[]; // 0 = Sunday
  onboarded: boolean;
  createdOn: string; // first DreamHub day
  celebrations: boolean;
}

export interface Subtask {
  id: string;
  title: string;
  estimatedMinutes: number;
  done: boolean;
  completedAt?: number;
}

export interface Extension {
  id: string;
  oldDue: string;
  newDue: string;
  reason: string;
  witness?: string; // buddy name
  status: "pending" | "approved" | "self_approved";
  createdAt: number;
}

export interface Task {
  id: string;
  goalId: string;
  title: string;
  estimatedMinutes: number;
  dueOn?: string;
  createdOn: string;
  committed: boolean;
  completedAt?: number;
  subtasks: Subtask[];
  extensions: Extension[];
}

export interface Goal {
  id: string;
  title: string;
  category: Category;
  deadline?: string;
  intensity: Intensity;
  committed: boolean;
  createdOn: string;
  completedAt?: number;
}

export type SessionType = "focus_hour" | "hosted" | "solo";

export interface HostedSession {
  id: string;
  title: string;
  hostName: string;
  hostUserId?: string;
  isMine: boolean;
  start: number;
  shape: SessionShape;
  visibility: "public" | "invite_only";
  mode: "cameras" | "quiet";
  capacity: number;
  category: Category;
  attendees: string[]; // names
  invitedMe?: boolean;
  response?: "accepted" | "declined";
}

export type CheckInType = "good" | "finished" | "distracted" | "more_time";

export interface SessionLog {
  id: string;
  type: SessionType;
  title: string;
  date: string; // DreamHub day
  endedAt: number;
  blocks: number;
  minutes: number;
  taskId?: string;
  planned?: string;
  outcome: CheckInType;
  with?: string[];
}

export interface Buddy {
  /** Relationship id (live) or a local id (demo). */
  id: string;
  /** The buddy's account id (live mode only). */
  userId?: string;
  name: string;
  hue: number;
  streak: number;
  today: "active" | "missed" | "rest" | "pending";
  missedYesterday: boolean;
  focusingNow: boolean;
  deadlines: { title: string; dueOn: string; state: "on_track" | "at_risk" | "due_today" | "done" }[];
  status: "active" | "pending_in" | "pending_out";
}

export interface ActiveSolo {
  start: number;
  shape: SessionShape;
  pausedAt?: number;
  pausedTotal: number;
}
