# DreamHub

Social accountability app: break goals into steps, set deadlines that stick, and focus together every evening (Focus Hour, 18:30–20:30 UK time).

Built from the PRD (v2):

- **Milestone 1, front end**: every screen, with a local demo mode (no account needed).
- **Milestone 2, backend**: Supabase accounts and data with row-level security, LiveKit video in the Focus Room, AI task breakdown.

**To go live, follow [SETUP.md](SETUP.md).** Without the environment variables, the app runs in demo mode only.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # domain logic tests (streaks, cascade, Focus Hour)
npm run test:db  # database security tests (runs the migration on an in-memory Postgres)
npm run build    # production build
```

On the landing page, **Try the demo** loads a demo account that is on a *save day* (missed yesterday, streak still alive). **Profile → Demo controls** moves a demo clock so you can see every Focus Hour state (starting soon, kick-off, end of block 1, after). In the room, the **Demo clock** button skips to the next segment so you can see breaks, check-ins and the finish without waiting.

## What's in here

| Area | Where |
| --- | --- |
| Streak engine: never miss twice, 2-per-7-days cap, rest days, 03:00 day boundary | `src/lib/domain/streak.ts`, `time.ts` |
| Deadline cascade, intensity, deadline states | `src/lib/domain/cascade.ts` |
| Focus Hour schedule and session timeline (kick-off, blocks, breaks) | `src/lib/domain/session.ts` |
| Task breakdown (templates now; AI provider in milestone 2, templates stay as the fallback) | `src/lib/domain/breakdown.ts` |
| XP values and achievements | `src/lib/domain/xp.ts` |
| Tests for all of the above | `src/lib/domain/domain.test.ts` |
| App state (local, persisted to localStorage) | `src/lib/store.ts` |
| Landing, onboarding | `src/app/page.tsx`, `src/app/start/` |
| Dashboard, Tasks, Goal + cascade, Focus, Create session, Buddies, Progress, Profile | `src/app/(app)/…` |
| Focus Room (Focus Hour tables, hosted, solo), check-ins, completion | `src/app/room/[id]/` |
| Brand: logo (extracted as vector from the brand guide), logomark, swirl pattern, octopus mascot | `public/brand/`, `src/components/brand.tsx` |

The `src/lib/domain` folder is pure TypeScript with no UI or storage, so the same code can run in Supabase Edge Functions / server routes in milestone 2.

## Brand

- **Logo**: `public/brand/logo.svg` (light backgrounds), `logo-on-blue.svg`, `logo-white.svg`, and `mark.svg`. Extracted directly from the brand guide; don't edit by hand.
- **Colours**: brand guide blues are tokens in `src/app/globals.css`. Status colours (good / save / missed) are proposals awaiting brand approval.
- **Font**: Wotfard is specified. Until the licensed font files are added, Outfit stands in. To switch, drop the `.woff2` files in `src/app/fonts/` and swap the `src` list in `src/app/fonts.ts`.
- **Mascot**: an SVG redraw of the supplied octopus with mood variants (happy, looking, celebrating, sleepy, waving, stretching, determined). Replace with the illustrator's final poses when available.

## Backend

| Area | Where |
| --- | --- |
| Database schema, security rules, server functions | `supabase/migrations/0001_init.sql` |
| Security rule tests (60 checks) | `supabase/tests/rls.test.mjs` |
| Loading and saving user data | `src/lib/remote.ts` (called from store actions in `src/lib/store.ts`) |
| Sign-in: email link and Google | `src/app/start/page.tsx`, `src/app/login`, `src/app/auth/callback`, `src/middleware.ts` |
| Who can see the app | `src/lib/session-gate.ts` |
| Video passes, host removal | `src/app/api/livekit/*`, `src/lib/video.ts`, `src/components/live-video.tsx` |
| AI breakdown with template fallback | `src/app/api/breakdown/route.ts`, `src/lib/breakdown-client.ts` |

Two modes share the same screens: **demo** (data stays in the browser) and **live** (signed in; every change saves to Supabase straight after the screen updates).

## Next

1. Scheduled jobs: save-day and Focus Hour reminders (needs web push), weekly summary email.
2. Proper email sending (SMTP) and Google sign-in configuration.
3. Moderation queue screen for reports.
4. Recurring hosted sessions, calendar invites.
