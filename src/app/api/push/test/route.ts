import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { deliver, pushConfigured } from "@/lib/push-server";

/** Profile → "Send a test": one notification to the signed-in person's device(s). */
export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();

export async function POST(request: NextRequest) {
  if (!pushConfigured()) return NextResponse.json({ error: "Notifications aren’t set up on the server yet." }, { status: 503 });
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const now = Date.now();
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 3) return NextResponse.json({ error: "Give it a minute before sending another test." }, { status: 429 });
  hits.set(user.id, [...recent, now]);

  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  let query = supabase.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", user.id);
  if (endpoint) query = query.eq("endpoint", endpoint);
  const { data: devices, error } = await query;
  if (error) return NextResponse.json({ error: "Couldn’t load your devices." }, { status: 500 });
  if (!devices?.length) return NextResponse.json({ error: "Turn notifications on for this device first." }, { status: 404 });

  const result = await deliver(
    devices.map((d) => ({ ...d, title: "Reminders are on 🐙", body: "This is how DreamHub will nudge you. See you at Focus Hour.", url: "/profile", tag: "test" })),
  );
  if (result.gone.length) await supabase.rpc("remove_push_subscription", { p_endpoint: result.gone[0] });
  return NextResponse.json(result.sent ? { sent: result.sent } : { error: "The push service didn’t accept it. Try turning notifications off and on again." }, { status: result.sent ? 200 : 502 });
}
