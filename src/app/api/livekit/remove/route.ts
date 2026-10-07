import { NextResponse, type NextRequest } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import { supabaseServer } from "@/lib/supabase/server";
import { roomName } from "@/lib/video";

/** Host removes someone: marked removed in the database, then disconnected from video. */
export async function POST(request: NextRequest) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) return NextResponse.json({ error: "Video isn’t configured" }, { status: 503 });

  const { sessionId, userId } = (await request.json().catch(() => ({}))) as { sessionId?: string; userId?: string };
  if (!sessionId || !userId) return NextResponse.json({ error: "Missing details" }, { status: 400 });

  const supabase = await supabaseServer();
  // remove_participant checks the caller is the host.
  const { error } = await supabase.rpc("remove_participant", { p_session: sessionId, p_user: userId });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });

  const svc = new RoomServiceClient(url.replace(/^wss:/, "https:"), apiKey, apiSecret);
  await svc.removeParticipant(roomName("hosted", sessionId, 1), userId).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
