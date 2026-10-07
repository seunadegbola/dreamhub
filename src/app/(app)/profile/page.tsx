"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { useNow, useToday } from "@/lib/hooks";
import { Avatar, Box, Button, Field, Panel, SectionTitle, Segmented, inputClass } from "@/components/ui";
import { addDays, dreamDay, formatClock, formatShortDate, MINUTE, zonedTimeToInstant } from "@/lib/domain/time";
import { FOCUS_HOUR } from "@/lib/domain/session";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NOTIFS = [
  ["Focus Hour reminder", "5 minutes before, on non-rest days"],
  ["Save-day reminder", "6:15pm on a save day"],
  ["Missed-day message", "9am the morning after a miss"],
  ["Hosted sessions", "Invites and 5-minute reminders"],
  ["Buddy nudges and save-day prompts", ""],
  ["Deadline reminders", "Based on each goal’s intensity"],
  ["Weekly summary email", "Sundays at 6pm"],
] as const;

export default function Profile() {
  const s = useStore();
  const router = useRouter();
  const today = useToday();
  const now = useNow(1000);
  const [name, setName] = useState(s.profile.name);
  const [notifs, setNotifs] = useState<Record<string, boolean>>(() => Object.fromEntries(NOTIFS.map(([n]) => [n, n !== "Weekly summary email"])));
  const tomorrow = addDays(today, 1);

  const jumpTo = (time: string) => {
    // Stay on the current DreamHub day so demo jumps never create missed days.
    const target = zonedTimeToInstant(dreamDay(Date.now(), FOCUS_HOUR.timezone), time, FOCUS_HOUR.timezone);
    s.setClockOffset((target - Date.now()) / MINUTE);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Avatar name={s.profile.name || "You"} hue={225} size={64} />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{s.profile.name || "Your profile"}</h1>
          <p className="text-muted">{s.profile.email}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Box className="space-y-5 p-5">
          <SectionTitle>Details</SectionTitle>
          <Field label="First name">
            <div className="flex gap-2">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="secondary" onClick={() => s.setProfile({ name: name.trim() })} disabled={name.trim() === s.profile.name}>
                Save
              </Button>
            </div>
          </Field>
          <Field label="Timezone" hint="Days end at 3am in this timezone, so late-night work counts for the evening it started.">
            <select className={inputClass} value={s.profile.timezone} onChange={(e) => s.setProfile({ timezone: e.target.value })}>
              {Array.from(new Set([s.profile.timezone, "Europe/London", "Europe/Dublin", "Europe/Paris", "America/New_York", "America/Los_Angeles", "Africa/Lagos", "Asia/Dubai", "Australia/Sydney"])).map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </select>
          </Field>
        </Box>

        <Box className="space-y-5 p-5">
          <SectionTitle>Rest days</SectionTitle>
          <p className="-mt-2 text-muted">Up to 2 a week. Rest days never count as misses.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Recurring rest days">
            {DAYS.map((d, i) => {
              const on = s.profile.restWeekdays.includes(i);
              return (
                <button
                  key={d}
                  aria-pressed={on}
                  onClick={() => {
                    const next = on ? s.profile.restWeekdays.filter((x) => x !== i) : [...s.profile.restWeekdays, i];
                    if (next.length > 2) return s.showToast("You can pick up to 2 rest days a week.");
                    s.setRestWeekdays(next);
                  }}
                  className={clsx("h-10 w-14 rounded-[10px] border-2 border-ink text-sm font-semibold", on ? "bg-ink text-white" : "bg-surface hover:bg-haze/50")}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
            <p className="flex-1 text-[15px]">Need tomorrow off? Declare it before the day starts.</p>
            <Button
              variant="secondary"
              size="sm"
              disabled={s.restDays.includes(tomorrow)}
              onClick={() => {
                s.addRestDay(tomorrow);
                s.showToast(`${formatShortDate(tomorrow)} is a rest day.`);
              }}
            >
              {s.restDays.includes(tomorrow) ? "Tomorrow is a rest day" : "Make tomorrow a rest day"}
            </Button>
          </div>
        </Box>

        <Box className="p-5">
          <SectionTitle>Notifications</SectionTitle>
          <p className="-mt-2 mb-4 text-muted">At most 3 a day, and none between 10pm and 8am.</p>
          <ul className="space-y-3">
            {NOTIFS.map(([n, hint]) => (
              <li key={n} className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{n}</p>
                  {hint && <p className="text-sm text-muted">{hint}</p>}
                </div>
                <button
                  role="switch"
                  aria-checked={notifs[n]}
                  aria-label={n}
                  onClick={() => setNotifs({ ...notifs, [n]: !notifs[n] })}
                  className={clsx("relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors", notifs[n] ? "bg-blue" : "bg-surface")}
                >
                  <span className={clsx("absolute top-0.5 size-5 rounded-full border-2 border-ink bg-white transition-all", notifs[n] ? "left-[22px]" : "left-0.5")} />
                </button>
              </li>
            ))}
          </ul>
        </Box>

        <Box className="space-y-5 p-5">
          <SectionTitle>Celebrations</SectionTitle>
          <Segmented
            value={s.profile.celebrations ? "on" : "off"}
            onChange={(v) => {
              s.setProfile({ celebrations: v === "on" });
              document.documentElement.dataset.motion = v === "on" ? "" : "off";
            }}
            options={[
              { value: "on", label: "Confetti and animations" },
              { value: "off", label: "Keep it calm" },
            ]}
          />
          <p className="text-sm text-muted">We also follow your device’s reduced-motion setting.</p>
          <div className="border-t border-hairline pt-5">
            <SectionTitle>Your data</SectionTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(useStore.getState(), null, 2)], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "dreamhub-data.json";
                  a.click();
                }}
              >
                Export my data
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (confirm("Delete your account and all your data? This can’t be undone.")) {
                    s.reset();
                    router.push("/");
                  }
                }}
              >
                Delete account
              </Button>
            </div>
          </div>
        </Box>
      </div>

      <Panel tone="haze" className="p-5">
        <SectionTitle>Demo controls</SectionTitle>
        <p className="-mt-2 mb-4 max-w-2xl">
          This prototype runs on a demo clock so you can try every state. It reads <strong>{formatClock(now, s.profile.timezone)}</strong>
          {s.clockOffsetMin !== 0 ? " (shifted)" : " (real time)"}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => jumpTo("18:22")}>
            Focus Hour starting soon
          </Button>
          <Button variant="secondary" size="sm" onClick={() => jumpTo("18:31")}>
            Focus Hour kick-off
          </Button>
          <Button variant="secondary" size="sm" onClick={() => jumpTo("18:58")}>
            End of block 1
          </Button>
          <Button variant="secondary" size="sm" onClick={() => jumpTo("21:00")}>
            After Focus Hour
          </Button>
          <Button size="sm" onClick={() => s.setClockOffset(0)}>
            Real time
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t-2 border-ink/10 pt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              s.loadDemo();
              s.showToast("Demo data loaded: you’re on a save day.");
              router.push("/home");
            }}
          >
            Load demo data
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              s.reset();
              router.push("/start");
            }}
          >
            Start fresh (onboarding)
          </Button>
        </div>
      </Panel>
    </div>
  );
}
