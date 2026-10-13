import { supabase } from "./supabase/client";

export type AdminReport = {
  id: string;
  created_at: string;
  reason: string;
  description: string | null;
  status: "open" | "upheld" | "dismissed";
  resolved_at: string | null;
  reporter_id: string | null;
  reporter_name: string | null;
  reported_id: string;
  reported_name: string;
  reported_email: string | null;
  reported_status: "active" | "suspended";
  reported_since: string;
  reports_90d: number;
  reporters_90d: number;
  warnings: number;
  session_id: string | null;
  session_title: string | null;
  session_type: "focus_hour" | "hosted" | null;
  session_start: string | null;
  last_action: string | null;
  last_action_at: string | null;
};
export type Suspended = { user_id: string; name: string; email: string | null; suspended_at: string | null; note: string | null };
export type HistoryItem = { at: string; kind: string; detail: string; by_name: string | null };

export const REASON_LABEL: Record<string, string> = {
  inappropriate: "Inappropriate behaviour",
  harassment: "Harassment",
  spam: "Spam or selling",
  content: "Inappropriate content",
  recording: "Recording others",
  no_show: "No-show",
  other: "Something else",
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const admin = {
  isAdmin: () => rpc<boolean>("is_admin").catch(() => false),
  reports: (open: boolean) => rpc<AdminReport[]>("admin_reports", { p_open: open }),
  suspended: () => rpc<Suspended[]>("admin_suspended"),
  history: (userId: string) => rpc<HistoryItem[]>("admin_history", { p_user: userId }),
  dismiss: (reportId: string) => rpc<void>("admin_dismiss_report", { p_report: reportId }),
  warn: (userId: string, message: string, reportId?: string) => rpc<void>("admin_warn", { p_user: userId, p_message: message, p_report: reportId ?? null }),
  unsuspend: (userId: string) => rpc<void>("admin_unsuspend", { p_user: userId }),
  /** Goes through the server so they're also disconnected from any live video. */
  async suspend(userId: string, message: string, reportId?: string) {
    const res = await fetch("/api/admin/suspend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, message, reportId }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? "Couldn’t suspend them.");
  },
};
