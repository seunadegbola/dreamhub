"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { useNow, useToday } from "@/lib/hooks";
import { Avatar, Box, Button, ButtonLink, Field, Panel, SectionTitle, Segmented, inputClass } from "@/components/ui";
import { addDays, dreamDay, formatClock, formatShortDate, MINUTE, zonedTimeToInstant } from "@/lib/domain/time";
import { FOCUS_HOUR } from "@/lib/domain/session";
import { NotificationSettings } from "@/components/reminders";
import { admin } from "@/lib/admin";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Profile() {
  const s = useStore();
  const router = useRouter();
  const today = useToday();
  const now = useNow(1000);
  const [name, setName] = useState(s.profile.name);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (s.mode === "live") admin.isAdmin().then(setIsAdmin);
  }, [s.mode]);
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
        {isAdmin && (
          <ButtonLink href="/admin" variant="secondary" size="sm" className="ml-auto">
            Moderation
          </ButtonLink>
        )}
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

        <NotificationSettings />

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
                onClick={async () => {
                  if (!confirm("Delete your account and all your data? This can’t be undone.")) return;
                  try {
                    await s.deleteAccount();
                    router.push("/");
                  } catch {
                    s.showToast("We couldn’t delete your account. Try again.");
                  }
                }}
              >
                Delete account
              </Button>
              {s.mode === "live" && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await s.signOut();
                    router.push("/");
                  }}
                >
                  Sign out
                </Button>
              )}
            </div>
          </div>
        </Box>
      </div>

      {s.mode === "demo" && (
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
      )}
    </div>
  );
}
