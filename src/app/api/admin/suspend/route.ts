import { NextResponse, type NextRequest } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { supabaseServer } from "@/lib/supabase/server";
import { roomName } from "@/lib/video";

/**
 * Admin suspends a member. admin_suspend (which checks the caller is an admin) does the
 * work in the database and returns the rooms they were in; here we cut their video.
 */
export async function POST(request: NextRequest) {
  const { userId, message, reportId } = (await request.json().catch(() => ({}))) as { userId?: string; message?: string; reportId?: string };
  if (!userId || !message?.trim()) return NextResponse.json({ error: "Missing details" }, { status: 400 });

  const supabase = await supabaseServer();
  const { data: seats, error } = await supabase.rpc("admin_suspend", { p_user: userId, p_message: message.trim().slice(0, 1000), p_report: reportId ?? null });
  if (error) return NextResponse.json({ error: error.code === "42501" ? "Not allowed" : error.message }, { status: error.code === "42501" ? 403 : 400 });

  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  const rooms = (seats ?? []) as { session_id: string; session_type: "focus_hour" | "hosted"; table_no: number }[];
  if (url && key && secret && rooms.length) {
    const svc = new RoomServiceClient(url.replace(/^wss:/, "https:"), key, secret);
    await Promise.all(rooms.map((r) => svc.removeParticipant(roomName(r.session_type, r.session_id, r.table_no), userId).catch(() => undefined)));
  }
  return NextResponse.json({ ok: true, disconnected: rooms.length });
}
