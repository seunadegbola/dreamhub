"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { useStore, roundedNow } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { Avatar, Button, ButtonLink, Field, Panel, Segmented, inputClass } from "@/components/ui";
import { IconBack, IconLink } from "@/components/icons";
import { CATEGORIES, type Category } from "@/lib/domain/breakdown";
import { addDays, formatClock, formatShortDate, zonedTimeToInstant } from "@/lib/domain/time";
import { Mascot } from "@/components/brand";

export default function NewSession() {
  const s = useStore();
  const today = useToday();
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [date, setDate] = useState(addDays(today, 1));
  const [time, setTime] = useState("10:00");
  const [blocks, setBlocks] = useState(2);
  const [blockMinutes, setBlockMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [visibility, setVisibility] = useState<"invite_only" | "public">("invite_only");
  const [mode, setMode] = useState<"cameras" | "quiet">("cameras");
  const [capacity, setCapacity] = useState(8);
  const [category, setCategory] = useState<Category>(s.goals[0]?.category ?? "work");
  const [created, setCreated] = useState<string | null>(null);
  const [invited, setInvited] = useState<string[]>([]);
  const [email, setEmail] = useState("");

  const canPublic = s.logs.length >= 3;
  const buddies = s.buddies.filter((b) => b.status === "active");
  const session = s.sessions.find((x) => x.id === created);
  const link = typeof window !== "undefined" && created ? `${window.location.origin}/join/${created}` : "";

  if (session) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Session created 🎟️</h1>
            <p className="mt-1 text-lg text-muted">
              {session.title} · {when === "now" ? "starting now" : `${formatShortDate(date)} at ${formatClock(session.start, s.profile.timezone)}`}
            </p>
          </div>
          <Mascot mood="celebrating" size={84} className="hidden sm:block" />
        </div>

        <Panel className="space-y-5 p-5">
          <div>
            <p className="mb-1.5 text-sm font-semibold">Share link</p>
            <div className="flex gap-2">
              <input readOnly value={link} className={clsx(inputClass, "text-sm")} onFocus={(e) => e.target.select()} />
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(link);
                  s.showToast("Link copied.");
                }}
              >
                <IconLink width={18} height={18} /> Copy
              </Button>
            </div>
            <p className="mt-1.5 text-sm text-muted">Anyone with a DreamHub account can join with this link. New people sign up first, then land in your session.</p>
          </div>

          {buddies.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold">Invite buddies</p>
              <ul className="space-y-2">
                {buddies.map((b) => (
                  <li key={b.id} className="flex items-center gap-3">
                    <Avatar name={b.name} hue={b.hue} size={32} />
                    <span className="flex-1 font-medium">{b.name}</span>
                    <Button
                      size="sm"
                      variant={invited.includes(b.name) ? "ghost" : "secondary"}
                      disabled={invited.includes(b.name)}
                      onClick={() => {
                        setInvited([...invited, b.name]);
                        s.inviteBuddyToSession(session.id, b.id);
                      }}
                    >
                      {invited.includes(b.name) ? "Invited" : "Invite"}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!/\S+@\S+\.\S+/.test(email)) return;
              const when = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: s.profile.timezone }).format(session.start);
              const body = `Want to focus together? I’m hosting “${session.title}” on DreamHub, ${when}.\n\nJoin here: ${link}`;
              window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Focus with me: ${session.title}`)}&body=${encodeURIComponent(body)}`;
              setInvited([...invited, email]);
              setEmail("");
            }}
          >
            <Field label="Invite by email" hint="Opens your email app with the link filled in.">
              <div className="flex gap-2">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" className={inputClass} />
                <Button type="submit" variant="secondary">
                  Send
                </Button>
              </div>
            </Field>
          </form>
        </Panel>

        <div className="flex flex-wrap gap-3">
          {when === "now" ? (
            <ButtonLink href={`/room/${session.id}`} size="lg">
              🚀 Open the room
            </ButtonLink>
          ) : (
            <ButtonLink href="/focus" size="lg">
              Done
            </ButtonLink>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/focus" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <IconBack width={16} height={16} /> Focus
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Create a session</h1>
      <p className="mt-1 text-lg text-muted">Up to 8 people. Mics are muted while you focus.</p>

      <form
        className="mt-8 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          const start = when === "now" ? roundedNow(s.clockOffsetMin) : zonedTimeToInstant(date, time, s.profile.timezone);
          const id = s.createSession({
            title: title.trim() || `${s.profile.name || "My"}’s focus session`,
            start,
            shape: { kickoffMinutes: 0, blocks, blockMinutes, breakMinutes },
            visibility,
            mode,
            capacity,
            category,
          });
          setCreated(id);
        }}
      >
        <Field label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${s.profile.name || "My"}’s focus session`} />
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-semibold">When</p>
          <Segmented value={when} onChange={setWhen} options={[{ value: "now", label: "Now" }, { value: "later", label: "Pick a time" }]} />
          {when === "later" && (
            <div className="mt-3 flex flex-wrap gap-3">
              <input type="date" aria-label="Date" className={clsx(inputClass, "w-auto")} min={today} value={date} onChange={(e) => setDate(e.target.value)} />
              <input type="time" aria-label="Time" className={clsx(inputClass, "w-auto")} value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="mb-1.5 text-sm font-semibold">Blocks</p>
            <Segmented value={blocks} onChange={setBlocks} options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Block length</p>
            <select className={inputClass} value={blockMinutes} onChange={(e) => setBlockMinutes(Number(e.target.value))}>
              {[25, 30, 45, 50, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Breaks</p>
            <Segmented value={breakMinutes} onChange={setBreakMinutes} options={[5, 10, 15].map((n) => ({ value: n, label: `${n}m` }))} />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold">Who can join</p>
          <Segmented
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: "invite_only", label: "Invite-only" },
              { value: "public", label: "Public" },
            ]}
          />
          {visibility === "public" && !canPublic && (
            <p className="mt-2 rounded-[8px] bg-save-tint px-3 py-2 text-sm">Public sessions unlock after 3 completed sessions. You can still host invite-only sessions.</p>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm font-semibold">Cameras</p>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "cameras", label: "Cameras welcome" },
                { value: "quiet", label: "Quiet (off)" },
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Capacity</p>
            <select className={inputClass} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold">Category</p>
          <Segmented value={category} onChange={setCategory} options={CATEGORIES.filter((c) => c.id !== "other").map((c) => ({ value: c.id, label: c.label }))} />
        </div>

        <p className="text-sm text-muted">Repeating sessions (daily, weekdays, weekly) are coming soon.</p>

        <Button type="submit" size="lg" disabled={visibility === "public" && !canPublic}>
          Create session
        </Button>
      </form>
    </div>
  );
}
