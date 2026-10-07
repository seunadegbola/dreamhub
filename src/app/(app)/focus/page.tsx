"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { useNow } from "@/lib/hooks";
import { Avatar, Box, Button, ButtonLink, Panel, Pill, SectionTitle, Segmented, inputClass } from "@/components/ui";
import { FocusHourBanner } from "@/components/focus-hour-banner";
import { CATEGORIES, type Category } from "@/lib/domain/breakdown";
import { sessionEnd, sessionPhase } from "@/lib/domain/session";
import { formatClock, formatShortDate, dreamDay, daysBetween } from "@/lib/domain/time";
import type { HostedSession } from "@/lib/types";

export default function FocusPage() {
  return (
    <Suspense>
      <Focus />
    </Suspense>
  );
}

function Focus() {
  const s = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const now = useNow(15_000);
  const openTasks = s.tasks.filter((t) => !t.completedAt);
  const [taskId, setTaskId] = useState(params.get("task") ?? openTasks[0]?.id ?? "");
  const [blocks, setBlocks] = useState(1);
  const [filter, setFilter] = useState<Category | "all">("all");

  const upcoming = s.sessions.filter((x) => sessionEnd(x.start, x.shape) > now).sort((a, b) => a.start - b.start);
  const invites = upcoming.filter((x) => x.invitedMe && !x.response);
  const mine = upcoming.filter((x) => x.isMine || x.response === "accepted");
  const publicSessions = upcoming.filter((x) => x.visibility === "public" && !x.isMine && x.response !== "accepted" && (filter === "all" || x.category === filter));
  const buddiesFocusing = s.buddies.filter((b) => b.status === "active" && b.focusingNow);
  const q = taskId ? `?task=${taskId}` : "";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Focus</h1>
        <p className="mt-1 text-lg text-muted">Join tonight’s Focus Hour, a friend’s session, or start on your own.</p>
      </div>

      {openTasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="task" className="text-sm font-semibold">
            Working on
          </label>
          <select id="task" className={clsx(inputClass, "h-11 max-w-md")} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            {openTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
            <option value="">Just focusing</option>
          </select>
        </div>
      )}

      <FocusHourBanner />

      <div className="grid gap-6 md:grid-cols-2">
        <Panel className="p-5">
          <h2 className="text-lg font-semibold">Start solo</h2>
          <p className="mt-1 text-muted">Same room, no video. You can pause. Counts fully for your streak.</p>
          <div className="mt-4">
            <Segmented
              value={blocks}
              onChange={setBlocks}
              options={[
                { value: 1, label: "25 min" },
                { value: 2, label: "2 × 25" },
                { value: 4, label: "4 × 25" },
              ]}
            />
          </div>
          <Button
            size="lg"
            className="mt-5"
            onClick={() => {
              s.startSolo({ kickoffMinutes: 0, blocks, blockMinutes: 25, breakMinutes: 5 });
              router.push(`/room/solo${q}`);
            }}
          >
            🚀 Start solo now
          </Button>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-lg font-semibold">Host a session</h2>
          <p className="mt-1 text-muted">Pick a time, invite friends or buddies, or make it public for anyone to join.</p>
          <ButtonLink href="/focus/new" size="lg" variant="secondary" className="mt-5">
            + Create a session
          </ButtonLink>
        </Panel>
      </div>

      {buddiesFocusing.length > 0 && (
        <Box className="flex items-center gap-3 p-4">
          <div className="flex -space-x-2">
            {buddiesFocusing.map((b) => (
              <Avatar key={b.id} name={b.name} hue={b.hue} size={32} />
            ))}
          </div>
          <p className="flex-1">
            <strong>{buddiesFocusing.map((b) => b.name).join(", ")}</strong> {buddiesFocusing.length === 1 ? "is" : "are"} focusing right now.
          </p>
          <ButtonLink href={`/room/focus-hour${q}`} size="sm" variant="secondary">
            Sit with them
          </ButtonLink>
        </Box>
      )}

      {invites.length > 0 && (
        <section>
          <SectionTitle>Invitations</SectionTitle>
          <ul className="grid gap-3 md:grid-cols-2">
            {invites.map((x) => (
              <li key={x.id}>
                <SessionCard session={x} now={now} tz={s.profile.timezone}>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => s.respondInvite(x.id, "accepted")}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => s.respondInvite(x.id, "declined")}>
                      Decline
                    </Button>
                  </div>
                </SessionCard>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mine.length > 0 && (
        <section>
          <SectionTitle>Your sessions</SectionTitle>
          <ul className="grid gap-3 md:grid-cols-2">
            {mine.map((x) => (
              <li key={x.id}>
                <SessionCard session={x} now={now} tz={s.profile.timezone}>
                  <ButtonLink href={`/room/${x.id}${q}`} size="sm" variant={x.start - now < 10 * 60_000 ? "primary" : "secondary"}>
                    {x.start <= now ? "Join now" : x.start - now < 10 * 60_000 ? "Join" : "Open"}
                  </ButtonLink>
                </SessionCard>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle>Public sessions</SectionTitle>
        <Segmented
          className="mb-4"
          value={filter}
          onChange={setFilter}
          options={[{ value: "all" as const, label: "All" }, ...CATEGORIES.filter((c) => c.id !== "other").map((c) => ({ value: c.id, label: c.label }))]}
        />
        {publicSessions.length === 0 ? (
          <p className="text-muted">No public sessions coming up{filter !== "all" ? " in this category" : ""}. Why not host one?</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {publicSessions.map((x) => (
              <li key={x.id}>
                <SessionCard session={x} now={now} tz={s.profile.timezone}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      s.respondInvite(x.id, "accepted");
                      s.showToast(`You’re in. We’ll remind you 5 minutes before.`);
                    }}
                  >
                    I’ll be there
                  </Button>
                </SessionCard>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SessionCard({ session: x, now, tz, children }: { session: HostedSession; now: number; tz: string; children: React.ReactNode }) {
  const phase = sessionPhase(now, x.start, x.shape);
  const day = dreamDay(x.start, tz);
  const today = dreamDay(now, tz);
  const d = daysBetween(today, day);
  const when = phase.phase === "live" ? "Live now" : `${d === 0 ? "Today" : d === 1 ? "Tomorrow" : formatShortDate(day)}, ${formatClock(x.start, tz)}`;
  const mins = x.shape.blocks * x.shape.blockMinutes;
  return (
    <div className="flex h-full flex-col justify-between gap-4 rounded-[var(--dh-radius)] border-2 border-ink bg-surface p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <p className={clsx("text-sm font-semibold", phase.phase === "live" ? "text-good" : "text-muted")}>{when}</p>
          <div className="flex gap-1.5">
            {x.mode === "quiet" && <Pill>Quiet</Pill>}
            <Pill>{x.visibility === "public" ? "Public" : "Invite-only"}</Pill>
          </div>
        </div>
        <p className="mt-1 text-lg font-semibold">{x.title}</p>
        <p className="text-sm text-muted">
          Hosted by {x.isMine ? "you" : x.hostName} · {x.shape.blocks} × {x.shape.blockMinutes} min ({mins} min) · {x.attendees.length + (x.response === "accepted" ? 1 : 0)}/{x.capacity}
        </p>
      </div>
      <div className="flex">{children}</div>
    </div>
  );
}
