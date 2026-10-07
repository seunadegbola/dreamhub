# DreamHub

Social accountability app: break goals into steps, set deadlines that stick, and focus together every evening (Focus Hour, 18:30–20:30 UK time).

This is **milestone 1: the front end**, built from the PRD (v2). Everything runs in the browser with local demo data so the whole product can be clicked through. The backend (Supabase) and live video (LiveKit) are milestone 2.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # domain logic tests (streaks, cascade, Focus Hour)
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

## Milestone 2: backend and video

1. **Supabase**: auth (Google + email magic link), Postgres tables per PRD §19, Row Level Security, realtime presence for rooms. Replace store actions in `src/lib/store.ts` with Supabase calls; components already go through those actions.
2. **Server clock and scheduler**: a scheduled job creates Focus Hour instances and closes each user's day at 03:00 local (writes `DailyActivity`, updates streaks, sends save-day prompts).
3. **LiveKit**: replace the placeholder video tiles with LiveKit rooms behind a `VideoProvider` interface (PRD §18). Up to 8 per table, mics auto-muted at block start.
4. **AI breakdown**: API route calling the AI provider with a 5s timeout, falling back to the templates.
5. **Notifications**: web push with the daily cap and quiet hours.
6. **Moderation**: report queue and admin tools.
