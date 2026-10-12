import { supabase } from "./supabase/client";

/** Reminder types a person can switch off (stored in profiles_private.notify; missing = on). */
export const NOTIFY_KINDS = [
  { key: "focus_hour", label: "Focus Hour reminder", hint: "6:25pm UK time, except on rest days" },
  { key: "save_day", label: "Save-day reminder", hint: "6:15pm the day after a miss" },
  { key: "missed_day", label: "Missed-day message", hint: "9am the morning after a miss" },
  { key: "deadlines", label: "Deadline reminders", hint: "9am when steps are due, based on each goal’s intensity" },
  { key: "hosted", label: "Hosted sessions", hint: "Invites, and 5 minutes before sessions you’ve joined" },
  { key: "buddies", label: "Buddy nudges", hint: "When a buddy nudges you" },
] as const;

export type NotifyKey = (typeof NOTIFY_KINDS)[number]["key"];
export type NotifyPrefs = Record<NotifyKey, boolean>;
export const DEFAULT_PREFS = Object.fromEntries(NOTIFY_KINDS.map((k) => [k.key, true])) as NotifyPrefs;

/** What this browser can do right now. */
export type DeviceState = "on" | "off" | "denied" | "unsupported" | "needs-install" | "not-configured";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Checks that don't need to wait, so a click can go straight to the permission prompt. */
function blocker(): DeviceState | null {
  if (!VAPID) return "not-configured";
  if (!supported()) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return null;
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function deviceState(): Promise<DeviceState> {
  const b = blocker();
  if (b) return b;
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription()) ? "on" : "off";
}

function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

async function save(sub: PushSubscription) {
  const keys = sub.toJSON().keys ?? {};
  const { error } = await supabase().rpc("save_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: keys.p256dh ?? "", p_auth: keys.auth ?? "" });
  if (error) throw new Error(error.message);
}

/** Asks permission (call from a click), subscribes this browser and saves it for the signed-in person. */
export async function turnOnPush(): Promise<DeviceState> {
  const b = blocker();
  if (b) return b;
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const key = keyBytes(VAPID);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await save(sub);
  return "on";
}

/** Stops reminders on this browser (also used when signing out, so the next person doesn't get yours). */
export async function turnOffPush() {
  if (!supported()) return;
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase().rpc("remove_push_subscription", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

let synced = false;
/** Once per visit: re-save this browser's subscription in case the browser renewed it. */
export async function syncPush() {
  if (synced || blocker() || Notification.permission !== "granted") return;
  synced = true;
  const sub = await currentSubscription();
  if (sub) await save(sub).catch(() => {});
}

export async function sendTestPush() {
  const sub = supported() ? await currentSubscription() : null;
  const res = await fetch("/api/push/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub?.endpoint }) });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Couldn’t send a test.");
}

export async function loadPrefs(userId: string): Promise<NotifyPrefs> {
  const { data } = await supabase().from("profiles_private").select("notify").eq("id", userId).single();
  return { ...DEFAULT_PREFS, ...((data?.notify as Partial<NotifyPrefs>) ?? {}) };
}

export async function savePrefs(userId: string, prefs: NotifyPrefs) {
  const { error } = await supabase().from("profiles_private").update({ notify: prefs }).eq("id", userId);
  if (error) throw new Error(error.message);
}

/** Plain-English explanation when reminders can't be switched on. */
export function deviceMessage(state: DeviceState): string | null {
  switch (state) {
    case "denied":
      return "Notifications are blocked for DreamHub in this browser. Allow them in your browser’s site settings, then try again.";
    case "needs-install":
      return "On iPhone and iPad, add DreamHub to your Home Screen first: tap Share, then Add to Home Screen. Open it from there and turn reminders on.";
    case "unsupported":
      return "This browser can’t show notifications. Try Chrome, Edge, Firefox or Safari.";
    case "not-configured":
      return "Reminders aren’t switched on for DreamHub yet.";
    default:
      return null;
  }
}
