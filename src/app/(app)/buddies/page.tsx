"use client";

import { useState } from "react";
import clsx from "clsx";
import { useStore } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { Avatar, Box, Button, ButtonLink, DeadlineBadge, Panel, SectionTitle, inputClass } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { Modal } from "@/components/modal";
import { formatShortDate } from "@/lib/domain/time";
import { IconLink } from "@/components/icons";

const NUDGES = ["Saving you a seat tonight", "You’ve got this", "Today still counts", "Join me at 6:30?"];

export default function Buddies() {
  const s = useStore();
  const today = useToday();
  const [nudgeFor, setNudgeFor] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const active = s.buddies.filter((b) => b.status === "active");
  const incoming = s.buddies.filter((b) => b.status === "pending_in");
  const outgoing = s.buddies.filter((b) => b.status === "pending_out");
  const saveDays = active.filter((b) => b.missedYesterday && b.today !== "active");

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Focus buddies</h1>
          <p className="mt-1 text-lg text-muted">The people who notice when you show up, and when you don’t.</p>
        </div>
        <Button onClick={() => setInviting(true)} disabled={s.buddies.length >= 10}>
          + Invite a buddy
        </Button>
      </div>

      {saveDays.map((b) => (
        <Panel key={b.id} tone="save" className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={b.name} hue={b.hue} size={44} />
            <div>
              <p className="text-lg font-semibold">{b.name} missed yesterday. Today’s a save day.</p>
              <p className="text-[15px]">A quick nudge or an invite tonight could keep their {b.streak}-day streak alive.</p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => setNudgeFor(b.id)} disabled={s.nudged[b.id] === today}>
              {s.nudged[b.id] === today ? "Nudged" : "Nudge"}
            </Button>
            <ButtonLink href="/focus/new" variant="ghost">
              Invite tonight
            </ButtonLink>
          </div>
        </Panel>
      ))}

      {incoming.length > 0 && (
        <section>
          <SectionTitle>Requests</SectionTitle>
          <ul className="space-y-2">
            {incoming.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-[var(--dh-radius)] border-2 border-ink bg-surface p-4">
                <Avatar name={b.name} hue={b.hue} />
                <p className="flex-1">
                  <strong>{b.name}</strong> wants to be your focus buddy.
                </p>
                <Button size="sm" onClick={() => s.acceptBuddy(b.id)}>
                  Accept
                </Button>
                <Button size="sm" variant="ghost" onClick={() => s.removeBuddy(b.id)}>
                  Ignore
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length === 0 ? (
        <Panel className="flex flex-col items-center gap-3 p-10 text-center">
          <Mascot mood="waving" size={100} />
          <p className="text-2xl font-semibold">No buddies yet</p>
          <p className="max-w-md text-muted">Invite a friend, or add someone you focused well with after a session. Buddies see your streak and your committed deadlines.</p>
          <Button onClick={() => setInviting(true)} className="mt-2">
            + Invite a buddy
          </Button>
        </Panel>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {active.map((b) => (
            <li key={b.id}>
              <Box className="h-full p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={b.name} hue={b.hue} size={48} />
                  <div className="flex-1">
                    <p className="text-lg font-semibold">{b.name}</p>
                    <p className="text-sm text-muted">
                      🔥 {b.streak}-day streak ·{" "}
                      <span className={clsx(b.today === "active" && "font-semibold text-good")}>
                        {b.focusingNow ? "focusing now" : b.today === "active" ? "active today" : b.today === "rest" ? "rest day" : "not yet today"}
                      </span>
                    </p>
                  </div>
                  {b.focusingNow && <span className="live-dot size-3 rounded-full border-2 border-ink bg-[#5CFFB0]" aria-label="Focusing now" />}
                </div>
                {b.deadlines.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-hairline pt-4">
                    {b.deadlines.map((d) => (
                      <li key={d.title} className="flex items-center justify-between gap-3 text-[15px]">
                        <span>
                          {d.title} <span className="text-muted">· {d.dueOn === today ? "today" : formatShortDate(d.dueOn)}</span>
                        </span>
                        <DeadlineBadge state={d.state} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setNudgeFor(b.id)} disabled={s.nudged[b.id] === today}>
                    {s.nudged[b.id] === today ? "Nudged today" : "Nudge"}
                  </Button>
                  <ButtonLink href="/focus/new" size="sm" variant="ghost">
                    Invite to a session
                  </ButtonLink>
                  <Button size="sm" variant="ghost" className="ml-auto text-muted" onClick={() => confirm(`Remove ${b.name} as a buddy? They won’t be told.`) && s.removeBuddy(b.id)}>
                    Remove
                  </Button>
                </div>
              </Box>
            </li>
          ))}
        </ul>
      )}

      {outgoing.length > 0 && (
        <section>
          <SectionTitle>Waiting to accept</SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {outgoing.map((b) => (
              <li key={b.id} className="flex items-center gap-2 rounded-full border-[1.5px] border-hairline bg-surface py-1 pl-1 pr-3 text-sm">
                <Avatar name={b.name} hue={b.hue} size={26} /> {b.name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Box className="p-5">
        <SectionTitle>What your buddies can see</SectionTitle>
        <ul className="grid gap-2 text-[15px] sm:grid-cols-2">
          <li>✓ Your streak and whether today counts yet</li>
          <li>✓ Committed deadlines and if they’re on track</li>
          <li>✓ Your goal titles</li>
          <li className="text-muted">✗ Task details and session history</li>
        </ul>
      </Box>

      <Modal open={!!nudgeFor} onClose={() => setNudgeFor(null)} title={`Nudge ${s.buddies.find((b) => b.id === nudgeFor)?.name ?? ""}`}>
        <p className="mb-4 text-muted">One nudge per buddy per day. Pick a message:</p>
        <div className="grid gap-2">
          {NUDGES.map((n) => (
            <Button
              key={n}
              variant="secondary"
              className="justify-start"
              onClick={() => {
                if (nudgeFor) s.nudge(nudgeFor);
                setNudgeFor(null);
              }}
            >
              {n}
            </Button>
          ))}
        </div>
      </Modal>

      <InviteModal open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState("");
  const link = typeof window !== "undefined" ? `${window.location.origin}/start?buddy=${encodeURIComponent(s.profile.name)}` : "";
  return (
    <Modal open={open} onClose={onClose} title="Invite a buddy">
      <p className="text-muted">Send this link. When they join, you’ll be offered as each other’s buddy.</p>
      <div className="mt-3 flex gap-2">
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
      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          s.addBuddyRequest(name.trim());
          s.showToast(`Request sent to ${name.trim()}.`);
          setName("");
          onClose();
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Or send a request to someone on DreamHub</span>
          <div className="flex gap-2">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name or email" />
            <Button type="submit">Send</Button>
          </div>
        </label>
      </form>
    </Modal>
  );
}
