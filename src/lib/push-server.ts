import webpush from "web-push";

/** Browser push services we deliver to (matches the check in save_push_subscription). */
export const PUSH_SERVICE = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)\//;

export type PushMessage = { endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string; tag: string };

export const pushConfigured = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let ready = false;
function configure() {
  if (ready) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@joindreamhub.com", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
}

/** Sends each message; returns devices the push service says no longer exist. */
export async function deliver(messages: PushMessage[]) {
  configure();
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  for (let i = 0; i < messages.length; i += 25) {
    const batch = messages.slice(i, i + 25);
    const results = await Promise.allSettled(
      batch.map((m) => {
        if (!PUSH_SERVICE.test(m.endpoint)) return Promise.reject(new Error("unsupported push service"));
        return webpush.sendNotification(
          { endpoint: m.endpoint, keys: { p256dh: m.p256dh, auth: m.auth } },
          JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag }),
          { TTL: 30 * 60, urgency: "high", timeout: 8000 },
        );
      }),
    );
    results.forEach((r, j) => {
      if (r.status === "fulfilled") return void sent++;
      failed++;
      const code = (r.reason as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) gone.push(batch[j].endpoint);
      else console.error("push failed", code ?? "", (r.reason as Error)?.message);
    });
  }
  return { sent, failed, gone };
}
