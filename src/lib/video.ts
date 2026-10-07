/**
 * Video provider boundary (PRD §18). Everything LiveKit-specific about naming and
 * configuration lives here and in components/live-video.tsx, so the provider can be
 * swapped without touching the Focus Room's session logic.
 */

export const videoConfigured = Boolean(process.env.NEXT_PUBLIC_LIVEKIT_URL);

/** One LiveKit room per Focus Hour table, one per hosted session. */
export function roomName(type: "focus_hour" | "hosted", sessionId: string, tableNo: number) {
  return type === "focus_hour" ? `fh_${sessionId}_t${tableNo}` : `hs_${sessionId}`;
}

export async function fetchVideoToken(sessionId: string): Promise<{ token: string; url: string; tableNo: number }> {
  const res = await fetch("/api/livekit/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Couldn’t connect to video");
  return body;
}
