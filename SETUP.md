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

3. Press **Deploy**. Note your address, e.g. `https://dreamhub.vercel.app`.

## 3. Tell Supabase where sign-in links should go (2 min)

Supabase → **Authentication** → **URL Configuration**:

- **Site URL**: your Vercel address, e.g. `https://dreamhub.vercel.app`
- **Redirect URLs**: add `https://dreamhub.vercel.app/auth/callback` (and `http://localhost:3000/auth/callback` if you run it locally)

Without this, email sign-in links won't bring people back to the app.

## 4. Test it

1. On your phone or laptop, open the Vercel address → **Start getting things done** → go through onboarding → **Email me a sign-in link**.
2. Open the email **on the same device and browser** and tap the link. Your plan is saved and you land on "Your first session is ready".
3. Video: **Focus → Host a session → Now**, copy the link, open it in a second browser (or send it to a friend), sign up there too, and join. You should see each other.
4. The Focus Hour opens daily at 6:30pm UK time.

## Before inviting real users

- **Email sending**: Supabase's built-in email is for testing and only sends a few emails an hour. Connect a proper email service under **Authentication → Emails → SMTP** (Resend, Postmark or SendGrid all work). This is the first thing that will break with more than a handful of sign-ups.
- **Google sign-in** (optional): Supabase → **Authentication → Providers → Google**. You'll need a Google Cloud OAuth client; Supabase's page links to the steps. Until then, the Google button shows a friendly message and email works.
- **Moderation**: reports land in the `reports` table (Table Editor). Check it during Focus Hours until a proper admin screen exists.

## What runs where

- **Supabase**: accounts, all data, and the security rules (every table has row-level security; tested by `npm run test:db`).
- **LiveKit**: live audio and video only. Nothing is recorded.
- **Vercel**: the app, plus three small server routes: video passes (`/api/livekit/token`), host removals (`/api/livekit/remove`) and AI breakdown (`/api/breakdown`).
