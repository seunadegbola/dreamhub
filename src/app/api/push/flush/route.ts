import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deliver, pushConfigured, type PushMessage } from "@/lib/push-server";

/**
 * Called every minute by the Supabase job (0003_reminders_schedule.sql) when reminders
 * are waiting. The bearer token is the job's shared secret; the database checks it.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Row = { id: number; endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string; kind: string };

export async function POST(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const secret = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (secret.length < 32) return NextResponse.json({ error: "not allowed" }, { status: 401 });
  // Leave reminders queued if keys aren't set yet.
  if (!pushConfigured()) return NextResponse.json({ error: "push keys not configured" }, { status: 503 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("take_push_outbox", { p_secret: secret });
  if (error) return NextResponse.json({ error: error.code === "42501" ? "not allowed" : "database error" }, { status: error.code === "42501" ? 401 : 500 });

  const messages: PushMessage[] = ((data ?? []) as Row[]).map((r) => ({
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
    title: r.title,
    body: r.body,
    url: r.url,
    // Same tag replaces an older notification; nudges and invites each get their own.
    tag: r.kind === "nudge" || r.kind === "invite" ? `${r.kind}-${r.id}` : r.kind,
  }));
  const result = await deliver(messages);
  if (result.gone.length) await db.rpc("drop_push_endpoints", { p_secret: secret, p_endpoints: result.gone });
  return NextResponse.json({ sent: result.sent, failed: result.failed, removed: result.gone.length });
}
