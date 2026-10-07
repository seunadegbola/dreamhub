import { NextResponse, type NextRequest } from "next/server";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { supabaseServer } from "@/lib/supabase/server";
import { roomName } from "@/lib/video";

/**
 * Issues a LiveKit pass for a room the signed-in user has actually joined
 * (via join_focus_hour / join_session). The database decides who may enter;
 * this route only converts that into a video token.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) return NextResponse.json({ error: "Video isn’t configured" }, { status: 503 });

  const { sessionId } = (await request.json().catch(() => ({}))) as { sessionId?: string };
  if (!sessionId) return NextResponse.json({ error: "Missing session" }, { status: 400 });

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // RLS: users can only read their own participation rows.
  const { data: seat } = await supabase
    .from("session_participants")
    .select("table_no, session:sessions(id, type, mode, host_user_id)")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .is("left_at", null)
    .maybeSingle();
  const session = (Array.isArray(seat?.session) ? seat?.session[0] : seat?.session) as
    | { id: string; type: "focus_hour" | "hosted"; mode: "cameras" | "quiet"; host_user_id: string | null }
    | undefined;
  if (!seat || !session) return NextResponse.json({ error: "Join the session first" }, { status: 403 });

  const { data: profile } = await supabase.from("profiles").select("name, hue").eq("id", user.id).single();

  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: profile?.name || "DreamHub member",
    ttl: "4h",
    metadata: JSON.stringify({ hue: profile?.hue ?? 225, host: session.host_user_id === user.id }),
  });
  token.addGrant({
    room: roomName(session.type, session.id, seat.table_no),
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
    // Quiet sessions: microphone only, no cameras (PRD §8).
    canPublishSources: session.mode === "quiet" ? [TrackSource.MICROPHONE] : [TrackSource.CAMERA, TrackSource.MICROPHONE],
  });

  return NextResponse.json({ token: await token.toJwt(), url: process.env.NEXT_PUBLIC_LIVEKIT_URL, tableNo: seat.table_no });
}
