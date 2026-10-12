# Going live: setup checklist

About 15 minutes. Do the steps in order.

## 1. Create the database (Supabase, 2 min)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the whole of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and press **Run**.
3. You should see "Success. No rows returned". Under **Table Editor** you'll now see `profiles`, `goals`, `tasks` and the rest, each marked **RLS enabled**.

Run it once only. Future changes will come as new numbered files.

## 2. Put the app online (Vercel, 5 min)

1. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub and import **seunadegbola/dreamhub**.
2. Before pressing Deploy, open **Environment Variables** and add:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://aeptyhzdkvjuezxtfxbb.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your `sb_publishable_…` key |
| `NEXT_PUBLIC_LIVEKIT_URL` | `wss://dreamhub-s1jdh87h.livekit.cloud` |
| `LIVEKIT_API_KEY` | `APIFewcCxeuPQ8x` |
| `LIVEKIT_API_SECRET` | from LiveKit → Settings → Keys (**secret: only ever paste it here**) |
| `ANTHROPIC_API_KEY` | optional: turns on AI task breakdown. Without it, built-in templates are used |

3. Press **Deploy**. The live address is **https://joindreamhub.com** (custom domain connected in Vercel).

## 3. Tell Supabase where sign-in links should go (2 min)

Supabase → **Authentication** → **URL Configuration**:

- **Site URL**: `https://joindreamhub.com`
- **Redirect URLs**: `https://joindreamhub.com/auth/callback`, `https://www.joindreamhub.com/auth/callback`, `https://dreamhub-psi.vercel.app/auth/callback` (and `http://localhost:3000/auth/callback` if you run it locally)

Without this, email sign-in links won't bring people back to the app.

## 4. Test it

1. On your phone or laptop, open the Vercel address → **Start getting things done** → go through onboarding → **Email me a sign-in link**.
2. Open the email **on the same device and browser** and tap the link. Your plan is saved and you land on "Your first session is ready".
3. Video: **Focus → Host a session → Now**, copy the link, open it in a second browser (or send it to a friend), sign up there too, and join. You should see each other.
4. The Focus Hour opens daily at 6:30pm UK time.

## Before inviting real users

- **Email sending**: see "Email from joindreamhub.com" below. Supabase's built-in email only sends a few emails an hour.
- **Google sign-in** (optional): Supabase → **Authentication → Providers → Google**. You'll need a Google Cloud OAuth client; Supabase's page links to the steps. Until then, the Google button shows a friendly message and email works.
- **Moderation**: reports land in the `reports` table (Table Editor). Check it during Focus Hours until a proper admin screen exists.

## What runs where

- **Supabase**: accounts, all data, and the security rules (every table has row-level security; tested by `npm run test:db`).
- **LiveKit**: live audio and video only. Nothing is recorded.
- **Vercel**: the app, plus three small server routes: video passes (`/api/livekit/token`), host removals (`/api/livekit/remove`) and AI breakdown (`/api/breakdown`).

## Email from joindreamhub.com (Resend, 15 min)

1. Create a free account at [resend.com](https://resend.com) → **Domains → Add domain** → `joindreamhub.com`, region **Ireland (eu-west-1)**.
2. Resend shows a few DNS records (TXT and MX). Add them where you bought the domain, or in Vercel → **Domains → joindreamhub.com → DNS Records** if Vercel manages your DNS. Wait until Resend shows **Verified** (usually minutes).
3. Resend → **API Keys → Create** (permission: Sending access). Copy it.
4. Supabase → **Authentication → Emails → SMTP Settings** → enable custom SMTP:
   - Sender email: `hello@joindreamhub.com`, sender name: `DreamHub`
   - Host: `smtp.resend.com`, port: `465`
   - Username: `resend`, password: the Resend API key
5. Supabase → **Authentication → Rate Limits**: raise "emails sent per hour" (e.g. 100).
6. Supabase → **Authentication → Emails → Templates**:
   - **Confirm signup**: subject `Save your DreamHub plan`, body = contents of [`supabase/email-templates/confirm-signup.html`](supabase/email-templates/confirm-signup.html)
   - **Magic link**: subject `Your DreamHub sign-in link`, body = contents of [`supabase/email-templates/magic-link.html`](supabase/email-templates/magic-link.html)
7. Test: sign in from joindreamhub.com and check the email arrives from hello@joindreamhub.com.

## Reminders (web push, 10 min)

Reminders arrive as phone/computer notifications, even when DreamHub isn't open.
Rules live in `supabase/migrations/0002_reminders.sql` (`queue_reminders`).

1. **Keys.** Open `dreamhub-reminder-keys.html` (any browser) and add the three values in
   Vercel → Project → Settings → Environment Variables:
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secret), `VAPID_SUBJECT`.
   Then Deployments → ⋯ → Redeploy. Keep these keys forever; new keys mean everyone
   has to switch reminders on again.
2. **Database.** Supabase → SQL Editor: run `0002_reminders.sql`, then
   `0003_reminders_schedule.sql`. (If 0003 complains about extensions, switch on
   `pg_cron` and `pg_net` in Database → Extensions and run it again.)
3. **Try it.** Profile → Notifications → Turn on reminders → Send a test.

Checks (SQL Editor):
- `select * from cron.job_run_details order by start_time desc limit 5;` — job running?
- `select status_code, content from net._http_response order by created desc limit 5;` — 200 means sent;
  503 means the Vercel keys are missing.
- `select kind, title, sent_at from push_outbox order by id desc limit 20;`

iPhone/iPad: reminders only work after **Share → Add to Home Screen** (iOS 16.4+),
then opening DreamHub from the Home Screen icon.
