"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { useStore, nowMs, selectStreak, taskProgress } from "@/lib/store";
import { useHydrated, useNow } from "@/lib/hooks";
import { FOCUS_HOUR, buildSegments, focusHourStart, focusHourStartForDreamDay, sessionPhase, type SessionShape } from "@/lib/domain/session";
import { dreamDay, formatClock, formatCountdown, MINUTE } from "@/lib/domain/time";
import { CHECKIN_UPDATES, TABLE_PEOPLE, type Person } from "@/lib/people";
import { Avatar, Button, ButtonLink, Checkbox, Progress, inputClass } from "@/components/ui";
import { Logo, Mascot } from "@/components/brand";
import { Confetti, Toast } from "@/components/feedback";
import { IconCam, IconCamOff, IconChat, IconClose, IconLeave, IconMic, IconMicOff, IconPause, IconPlay } from "@/components/icons";
import type { CheckInType, SessionType } from "@/lib/types";
import { XP } from "@/lib/domain/xp";

export default function RoomPage() {
  return (
    <Suspense>
      <RoomGate />
    </Suspense>
  );
}

function RoomGate() {
  const hydrated = useHydrated();
  const onboarded = useStore((s) => s.profile.onboarded);
  const router = useRouter();
  useEffect(() => {
    if (hydrated && !onboarded) router.replace("/start");
  }, [hydrated, onboarded, router]);
  if (!hydrated || !onboarded) return null;
  return <Room />;
}

interface RoomConfig {
  type: SessionType;
  title: string;
  start: number;
  shape: SessionShape;
  people: Person[];
  quiet: boolean;
}

const CHECKINS: { value: CheckInType; label: string }[] = [
  { value: "good", label: "✅ I made good progress" },
  { value: "finished", label: "🎉 I finished what I planned" },
  { value: "distracted", label: "😅 I got distracted" },
  { value: "more_time", label: "🔄 I need more time" },
];

function Room() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const s = useStore();
  const now = useNow(250);

  /* ---------- session config ---------- */
  const config = useMemo<RoomConfig | null>(() => {
    if (id === "focus-hour") {
      return { type: "focus_hour", title: "Focus Hour", start: focusHourStart(nowMs(s.clockOffsetMin)), shape: FOCUS_HOUR.shape, people: TABLE_PEOPLE.slice(0, 5), quiet: false };
    }
    if (id === "solo") {
      const a = s.activeSolo;
      if (!a) return null;
      return { type: "solo", title: "Solo session", start: a.start, shape: a.shape, people: [], quiet: true };
    }
    const h = s.sessions.find((x) => x.id === id);
    if (!h) return null;
    const people = h.attendees
      .filter((n) => n !== s.profile.name)
      .map((n, i) => TABLE_PEOPLE.find((p) => p.name === n) ?? { id: `a${i}`, name: n, hue: (i * 67) % 360, goal: "Focusing", camera: true, category: h.category });
    return { type: "hosted", title: h.title, start: h.start, shape: h.shape, people, quiet: h.mode === "quiet" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, s.activeSolo?.start, s.sessions.length, s.clockOffsetMin]);

  // Start a default solo block if someone lands on /room/solo directly.
  useEffect(() => {
    if (id === "solo" && !s.activeSolo) s.startSolo({ kickoffMinutes: 0, blocks: 1, blockMinutes: 25, breakMinutes: 5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ---------- clock (solo can pause) ---------- */
  const solo = s.activeSolo;
  const effectiveNow = config?.type === "solo" && solo ? now - solo.pausedTotal - (solo.pausedAt ? now - solo.pausedAt : 0) : now;
  const phase = config ? sessionPhase(effectiveNow, config.start, config.shape) : null;
  const segments = useMemo(() => (config ? buildSegments(config.start, config.shape) : []), [config]);

  /* ---------- user state ---------- */
  const joinedAt = useRef(now);
  const openTasks = s.tasks.filter((t) => !t.completedAt);
  const [taskId, setTaskId] = useState(params.get("task") ?? openTasks[0]?.id ?? "");
  const task = s.tasks.find((t) => t.id === taskId);
  const [goal, setGoal] = useState<string>("");
  const [goalSet, setGoalSet] = useState(false);
  const [mic, setMic] = useState(false);
  const [cam, setCam] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [checkins, setCheckins] = useState<Record<number, { type: CheckInType; note: string }>>({});
  const [finished, setFinished] = useState<null | { blocks: number; minutes: number; outcome: CheckInType; xpBefore: number }>(null);
  const [reaction, setReaction] = useState<{ id: number; emoji: string } | null>(null);
  const [presentIds, setPresentIds] = useState<string[]>(() => config?.people.map((p) => p.id) ?? []);
  const loggedRef = useRef(false);

  useEffect(() => {
    setPresentIds(config?.people.map((p) => p.id) ?? []);
  }, [config]);

  const seg = phase?.phase === "live" ? phase.segment : null;
  const segKey = seg ? `${seg.kind}-${seg.block}` : phase?.phase ?? "none";

  // Mics auto-mute when a focus block starts (PRD §8).
  const prevKind = useRef<string | null>(null);
  useEffect(() => {
    if (seg?.kind === "focus" && prevKind.current !== "focus") setMic(false);
    prevKind.current = seg?.kind ?? null;
  }, [segKey, seg?.kind]);

  const blocksCompleted = segments.filter((g) => g.kind === "focus" && g.end <= effectiveNow && g.end - Math.max(g.start, joinedAt.current) >= 0.6 * (g.end - g.start)).length;

  const finish = (outcome?: CheckInType) => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    const last = Object.entries(checkins).sort((a, b) => Number(b[0]) - Number(a[0]))[0]?.[1];
    const out = outcome ?? last?.type ?? "good";
    const minutes = blocksCompleted * (config?.shape.blockMinutes ?? 25);
    const xpBefore = s.xp;
    if (config && blocksCompleted > 0) {
      s.logSession({ type: config.type, title: config.title, blocks: blocksCompleted, minutes, taskId: task?.id, planned: goal || task?.title, outcome: out, with: config.people.filter((p) => presentIds.includes(p.id)).map((p) => p.name) });
    }
    if (config?.type === "solo") s.endSolo();
    setFinished({ blocks: blocksCompleted, minutes, outcome: out, xpBefore });
  };

  // Session ended on its own
  useEffect(() => {
    if (phase?.phase === "ended" && !finished && goalSet) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase?.phase]);

  /* ---------- demo controls ---------- */
  const skipToNext = () => {
    const next = segments.find((g) => g.start > effectiveNow) ?? null;
    const target = next ? next.start : (segments.at(-1)?.end ?? effectiveNow);
    const delta = target - effectiveNow - 3000;
    s.setClockOffset(s.clockOffsetMin + delta / MINUTE);
  };
  const jumpToFocusHour = () => {
    const target = focusHourStartForDreamDay(Date.now()) + 1 * MINUTE;
    s.setClockOffset((target - Date.now()) / MINUTE);
  };

  /* ---------- render ---------- */
  if (!config) {
    return (
      <Shell title="Session">
        <div className="mx-auto max-w-md py-24 text-center">
          <Mascot mood="looking" size={96} className="mx-auto" />
          <p className="mt-4 text-2xl font-semibold">We couldn’t find that session.</p>
          <p className="mt-1 text-muted">It may have ended or the link is wrong.</p>
          <ButtonLink href="/focus" className="mt-6">
            Back to Focus
          </ButtonLink>
        </div>
      </Shell>
    );
  }

  if (finished) {
    return <Completion data={finished} goal={goal || task?.title} taskId={task?.id} people={config.people.filter((p) => presentIds.includes(p.id))} onAgain={() => {
      s.startSolo({ kickoffMinutes: 0, blocks: 1, blockMinutes: 25, breakMinutes: 5 });
      router.push(`/room/solo${task ? `?task=${task.id}` : ""}`);
      setFinished(null);
      loggedRef.current = false;
      setGoalSet(false);
    }} />;
  }

  const notLiveFocusHour = config.type === "focus_hour" && phase?.phase !== "live";
  if (notLiveFocusHour) {
    const upcoming = phase?.phase === "upcoming";
    return (
      <Shell title="Focus Hour" onLeave={() => router.push("/home")}>
        <div className="mx-auto max-w-lg py-16 text-center">
          <Mascot mood={upcoming ? "looking" : "sleepy"} size={110} className="mx-auto" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            {upcoming ? `Focus Hour starts at ${formatClock(config.start, s.profile.timezone)}` : "Tonight’s Focus Hour has wrapped up"}
          </h1>
          <p className="mt-2 text-lg text-muted">
            {upcoming ? `That’s in ${formatCountdown(config.start - now)}. You can focus solo until then.` : "Back tomorrow at 6:30pm. You can still focus on your own."}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              onClick={() => {
                s.startSolo({ kickoffMinutes: 0, blocks: 1, blockMinutes: 25, breakMinutes: 5 });
                router.push(`/room/solo${task ? `?task=${task.id}` : ""}`);
              }}
            >
              🚀 Start solo now
            </Button>
            <Button size="lg" variant="secondary" onClick={jumpToFocusHour}>
              Preview the Focus Hour
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted">Preview moves the demo clock to 6:31pm so you can try the room.</p>
        </div>
      </Shell>
    );
  }

  if (phase?.phase === "upcoming") {
    return (
      <Shell title={config.title} onLeave={() => router.push("/focus")}>
        <div className="mx-auto max-w-lg py-16 text-center">
          <Mascot mood="waving" size={110} className="mx-auto" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{config.title}</h1>
          <p className="mt-2 text-lg text-muted">
            Starts at {formatClock(config.start, s.profile.timezone)}, in {formatCountdown(config.start - now)}.
          </p>
          <Button size="lg" variant="secondary" className="mt-8" onClick={skipToNext}>
            Skip to the start (demo)
          </Button>
        </div>
      </Shell>
    );
  }

  /* ---------- goal setting on entry ---------- */
  if (!goalSet) {
    const next = task?.subtasks.find((x) => !x.done);
    return (
      <Shell title={config.title} onLeave={() => router.push("/home")}>
        <div className="mx-auto max-w-xl py-10 md:py-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-semibold text-muted">{seg?.kind === "focus" ? `Block ${seg.block} is running. You’ll join quietly.` : config.type === "focus_hour" ? "Kick-off" : "Before you start"}</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">What will you finish by the end of this block?</h1>
            </div>
            <Mascot mood="determined" size={84} className="hidden sm:block" />
          </div>
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              joinedAt.current = now;
              setGoalSet(true);
            }}
          >
            {openTasks.length > 0 && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">Task</span>
                <select className={inputClass} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  {openTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                  <option value="">Just focusing</option>
                </select>
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">My goal for this block</span>
              <input autoFocus className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={next?.title ?? "Write 500 words"} />
            </label>
            {next && !goal && (
              <button type="button" className="text-sm font-semibold text-sky underline underline-offset-4" onClick={() => setGoal(next.title)}>
                Use the next step: “{next.title}”
              </button>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-4">
              <Button type="submit" size="lg">
                🔥 Let’s make some progress
              </Button>
              {!config.quiet && (
                <span className="text-sm text-muted">Your mic starts muted. Camera is optional.</span>
              )}
            </div>
          </form>
        </div>
      </Shell>
    );
  }

  /* ---------- live room ---------- */
  const isBreak = seg?.kind === "break";
  const breakBlock = isBreak ? seg!.block : null;
  const needsCheckin = isBreak && breakBlock !== null && !checkins[breakBlock];
  const focusSegs = segments.filter((g) => g.kind === "focus");
  const segEnd = seg?.end ?? effectiveNow;
  const remaining = segEnd - effectiveNow;
  const nextFocus = segments.find((g) => g.kind === "focus" && g.start >= segEnd);
  const present = config.people.filter((p) => presentIds.includes(p.id));

  return (
    <Shell
      title={config.title}
      onLeave={() => {
        if (blocksCompleted > 0) finish();
        else if (confirm("Leave now? You haven’t finished a block yet, so this won’t count towards your streak.")) {
          if (config.type === "solo") s.endSolo();
          router.push("/home");
        }
      }}
      right={
        <span className="hidden text-sm font-semibold text-muted sm:inline">
          {config.type === "focus_hour" ? "Table 12 · " : ""}
          {present.length + 1} here
        </span>
      }
    >
      <div className={clsx("grid gap-5 py-5 lg:grid-cols-[1fr_340px]", chatOpen && "lg:grid-cols-[1fr_340px]")}>
        <div className="space-y-5">
          {/* timer */}
          <div className={clsx("flex flex-wrap items-end justify-between gap-4 rounded-[var(--dh-radius)] border-2 border-ink p-5 shadow-brut", isBreak ? "bg-haze" : seg?.kind === "kickoff" ? "bg-surface" : "bg-blue text-white")}>
            <div>
              <p className={clsx("font-semibold", isBreak || seg?.kind === "kickoff" ? "text-muted" : "text-white/80")}>
                {seg?.kind === "kickoff" ? "Kick-off · set your goal and say hi" : isBreak ? `Break · back to work at ${nextFocus ? formatClock(nextFocus.start, s.profile.timezone) : "soon"}` : `Block ${seg?.block} of ${config.shape.blocks}`}
                {solo?.pausedAt && config.type === "solo" ? " · paused" : ""}
              </p>
              <p className="text-6xl font-bold tabular-nums tracking-tight md:text-7xl" aria-live="off">
                {formatCountdown(remaining)}
              </p>
            </div>
            <ol className="flex gap-1.5" aria-label="Blocks">
              {focusSegs.map((g) => (
                <li
                  key={g.block}
                  className={clsx(
                    "h-3 w-8 rounded-full border-2",
                    isBreak || seg?.kind === "kickoff" ? "border-ink" : "border-white",
                    g.end <= effectiveNow ? (isBreak || seg?.kind === "kickoff" ? "bg-ink" : "bg-white") : seg === g ? "bg-sky" : "bg-transparent",
                  )}
                  aria-label={`Block ${g.block}${g.end <= effectiveNow ? " done" : ""}`}
                />
              ))}
            </ol>
          </div>

          {isBreak && !needsCheckin && (
            <div className="rise flex flex-col gap-3 rounded-[var(--dh-radius)] border-2 border-ink bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold">🧘 You’ve earned a break.</p>
                <p className="text-muted">Grab some water. Stretch. See how the table got on.</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button size="sm" onClick={skipToNext}>
                  🚀 Continue
                </Button>
                <Button size="sm" variant="secondary" onClick={() => finish()}>
                  I’m done for today
                </Button>
              </div>
            </div>
          )}

          {/* video grid */}
          {!config.quiet || config.type !== "solo" ? (
            <ul className={clsx("grid gap-3", present.length + 1 <= 2 ? "grid-cols-2" : present.length + 1 <= 4 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
              <SelfTile cam={cam && !config.quiet} name={s.profile.name || "You"} goal={goal || task?.title || "Focusing"} reaction={reaction} mic={mic} />
              {present.map((p) => (
                <PersonTile key={p.id} person={p} quiet={config.quiet} update={isBreak && breakBlock !== null && checkins[breakBlock] ? CHECKIN_UPDATES[p.id] : undefined} />
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-4 rounded-[var(--dh-radius)] border-[1.5px] border-hairline bg-surface p-5">
              <Mascot mood={isBreak ? "stretching" : "determined"} size={72} />
              <div>
                <p className="text-lg font-semibold">{isBreak ? "🧘 You’ve earned a break." : "Just you and the work."}</p>
                <p className="text-muted">{isBreak ? "Grab some water. Stretch. Look away from the screen." : "Notifications are quiet. Tick off steps as you go."}</p>
              </div>
            </div>
          )}
        </div>

        {/* side panel: goal + task */}
        <aside className="space-y-5">
          <div className="rounded-[var(--dh-radius)] border-2 border-ink bg-surface p-5">
            <p className="text-sm font-semibold text-muted">My goal this block</p>
            <p className="mt-1 text-xl font-semibold">{goal || task?.title || "Focusing"}</p>
            {task && (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={taskProgress(task)} />
                  <span className="text-sm font-semibold tabular-nums">{Math.round(taskProgress(task) * 100)}%</span>
                </div>
                <ul className="mt-4 space-y-2">
                  {task.subtasks.map((st) => (
                    <li key={st.id} className="flex items-center gap-3">
                      <Checkbox checked={st.done} onChange={() => s.toggleSubtask(task.id, st.id)} label={st.title} />
                      <span className={clsx("text-[15px]", st.done && "text-muted line-through")}>{st.title}</span>
                    </li>
                  ))}
                </ul>
                {task.dueOn && <p className="mt-3 text-sm text-muted">Due {task.dueOn === dreamDay(now, s.profile.timezone) ? "today" : new Date(task.dueOn + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</p>}
              </>
            )}
          </div>
          {present.length > 0 && (
            <div className="rounded-[var(--dh-radius)] border-[1.5px] border-hairline bg-surface p-5">
              <p className="mb-3 text-sm font-semibold text-muted">Different goals. Same mission.</p>
              <ul className="space-y-2.5">
                {present.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 text-[15px]">
                    <Avatar name={p.name} hue={p.hue} size={26} />
                    <span className="font-semibold">{p.name}</span>
                    <span className="truncate text-muted">{p.goal}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* controls */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-surface px-4 py-3 md:px-6">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          {!config.quiet && (
            <>
              <ControlButton label={mic ? "Mute microphone" : "Unmute microphone"} active={mic} onClick={() => setMic((m) => !m)} disabled={seg?.kind === "focus"} hint={seg?.kind === "focus" ? "Mics are muted while focusing" : undefined}>
                {mic ? <IconMic /> : <IconMicOff />}
              </ControlButton>
              <ControlButton label={cam ? "Turn camera off" : "Turn camera on"} active={cam} onClick={() => setCam((c) => !c)}>
                {cam ? <IconCam /> : <IconCamOff />}
              </ControlButton>
            </>
          )}
          {config.type === "solo" && (
            <ControlButton label={solo?.pausedAt ? "Resume" : "Pause"} active={!!solo?.pausedAt} onClick={() => (solo?.pausedAt ? s.resumeSolo() : s.pauseSolo())}>
              {solo?.pausedAt ? <IconPlay /> : <IconPause />}
            </ControlButton>
          )}
          {config.type !== "solo" && (
            <>
              <ControlButton label="Chat" active={chatOpen} onClick={() => setChatOpen((c) => !c)}>
                <IconChat />
              </ControlButton>
              {["👋", "👍", "🔥"].map((e) => (
                <button
                  key={e}
                  onClick={() => setReaction({ id: Date.now(), emoji: e })}
                  className="hidden size-12 place-items-center rounded-full border-2 border-ink bg-surface text-xl hover:bg-haze/50 sm:grid"
                  aria-label={`React ${e}`}
                >
                  {e}
                </button>
              ))}
            </>
          )}
          <button
            onClick={() => {
              if (blocksCompleted > 0) finish();
              else if (confirm("Leave now? You haven’t finished a block yet, so this won’t count towards your streak.")) {
                if (config.type === "solo") s.endSolo();
                router.push("/home");
              }
            }}
            className="ml-2 inline-flex h-12 items-center gap-2 rounded-full border-2 border-ink bg-missed px-5 font-semibold text-white"
          >
            <IconLeave width={20} height={20} /> Leave
          </button>
        </div>
      </div>

      {chatOpen && <ChatDrawer onClose={() => setChatOpen(false)} people={present} />}

      {needsCheckin && breakBlock !== null && (
        <CheckIn
          block={breakBlock}
          goal={goal || task?.title}
          onSubmit={(type, note) => {
            setCheckins((c) => ({ ...c, [breakBlock]: { type, note } }));
            // Someone wraps up at the first break, so the table changes over time.
            if (breakBlock === 1 && present.length > 3) setPresentIds((ids) => ids.slice(0, -1));
          }}
        />
      )}

      <DemoClock onSkip={skipToNext} />
      <Toast />
    </Shell>
  );
}

/* ---------------- Pieces ---------------- */

function Shell({ title, children, onLeave, right }: { title: string; children: React.ReactNode; onLeave?: () => void; right?: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b-2 border-ink bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 md:px-6">
          <Logo height={22} />
          <span className="h-5 w-0.5 bg-hairline" aria-hidden />
          <p className="truncate font-semibold">{title}</p>
          <div className="ml-auto flex items-center gap-3">
            {right}
            {onLeave && (
              <button onClick={onLeave} className="rounded p-1 text-muted hover:bg-haze/50 hover:text-ink" aria-label="Close">
                <IconClose />
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-28 md:px-6">{children}</main>
    </div>
  );
}

function ControlButton({ children, label, active, onClick, disabled, hint }: { children: React.ReactNode; label: string; active?: boolean; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={hint ?? label}
      className={clsx("grid size-12 place-items-center rounded-full border-2 border-ink transition-colors disabled:opacity-40", active ? "bg-ink text-white" : "bg-surface hover:bg-haze/50")}
    >
      {children}
    </button>
  );
}

function SelfTile({ cam, name, goal, reaction, mic }: { cam: boolean; name: string; goal: string; reaction: { id: number; emoji: string } | null; mic: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    let stream: MediaStream | null = null;
    if (cam && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then((st) => {
          stream = st;
          if (video.current) video.current.srcObject = st;
          setDenied(false);
        })
        .catch(() => setDenied(true));
    }
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [cam]);
  return (
    <li className="relative aspect-[4/3] overflow-hidden rounded-[var(--dh-radius)] border-2 border-ink bg-ink shadow-brut-sm sm:aspect-video">
      {cam && !denied ? (
        <video ref={video} autoPlay muted playsInline className="h-full w-full scale-x-[-1] object-cover" />
      ) : (
        <div className="grid h-full place-items-center bg-[hsl(225_60%_85%)] pb-8">
          <Avatar name={name} hue={225} size={48} />
        </div>
      )}
      <TileLabel name={`${name} (you)`} goal={goal} mic={mic} />
      {reaction && (
        <span key={reaction.id} className="pop absolute right-3 top-3 text-4xl" aria-hidden>
          {reaction.emoji}
        </span>
      )}
      {denied && cam && <span className="absolute left-2 top-2 rounded bg-surface px-2 py-0.5 text-xs font-semibold">Camera blocked</span>}
    </li>
  );
}

function PersonTile({ person, quiet, update }: { person: Person; quiet: boolean; update?: string }) {
  const camOn = person.camera && !quiet;
  return (
    <li className="relative aspect-[4/3] overflow-hidden rounded-[var(--dh-radius)] border-2 border-ink sm:aspect-video" style={{ background: camOn ? `linear-gradient(160deg, hsl(${person.hue} 45% 72%), hsl(${person.hue} 40% 52%))` : `hsl(${person.hue} 60% 88%)` }}>
      <div className="grid h-full place-items-center pb-8">
        <Avatar name={person.name} hue={person.hue} size={camOn ? 56 : 48} />
      </div>
      {camOn && <span className="absolute left-2 top-2 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">video placeholder</span>}
      {update && <span className="rise absolute inset-x-2 top-2 rounded-[8px] border-2 border-ink bg-surface px-2 py-1 text-xs font-semibold">{update}</span>}
      <TileLabel name={person.name} goal={person.goal} mic={false} />
    </li>
  );
}

function TileLabel({ name, goal, mic }: { name: string; goal: string; mic: boolean }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-ink/85 to-transparent p-2.5 pt-6 text-white">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-white/80">{goal}</p>
      </div>
      {!mic && <IconMicOff width={16} height={16} className="shrink-0 opacity-80" />}
    </div>
  );
}

function CheckIn({ block, goal, onSubmit }: { block: number; goal?: string; onSubmit: (t: CheckInType, note: string) => void }) {
  const [type, setType] = useState<CheckInType | null>(null);
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/40 p-4" role="dialog" aria-modal aria-labelledby="checkin-title">
      <div className="rise w-full max-w-md rounded-[14px] border-2 border-ink bg-surface p-6 shadow-brut">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="checkin-title" className="text-2xl font-bold tracking-tight">
              ⏰ Time for a check-in
            </h2>
            {goal && <p className="mt-1 text-muted">Block {block}: “{goal}”</p>}
          </div>
          <Mascot mood="stretching" size={64} />
        </div>
        <div className="mt-5 grid gap-2">
          {CHECKINS.map((c) => (
            <button
              key={c.value}
              onClick={() => setType(c.value)}
              aria-pressed={type === c.value}
              className={clsx("rounded-[10px] border-2 border-ink px-4 py-3 text-left font-semibold", type === c.value ? "bg-ink text-white" : "bg-surface hover:bg-haze/40")}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: 540 words written" className={clsx(inputClass, "mt-4")} />
        <Button className="mt-4 w-full" size="lg" disabled={!type} onClick={() => type && onSubmit(type, note)}>
          Share with the table
        </Button>
      </div>
    </div>
  );
}

function ChatDrawer({ onClose, people }: { onClose: () => void; people: Person[] }) {
  const name = useStore((s) => s.profile.name);
  const [msgs, setMsgs] = useState<{ who: string; text: string }[]>(() => [
    people[0] ? { who: people[0].name, text: "Good luck everyone 💪" } : null,
    people[2] ? { who: people[2].name, text: "Back after this block!" } : null,
  ].filter(Boolean) as { who: string; text: string }[]);
  const [text, setText] = useState("");
  return (
    <aside className="rise fixed bottom-20 right-4 z-30 flex h-[420px] w-[min(360px,calc(100vw-2rem))] flex-col rounded-[14px] border-2 border-ink bg-surface shadow-brut" aria-label="Chat">
      <div className="flex items-center justify-between border-b-2 border-ink/10 px-4 py-3">
        <p className="font-semibold">Table chat</p>
        <button onClick={onClose} aria-label="Close chat">
          <IconClose width={20} height={20} />
        </button>
      </div>
      <ul className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.map((m, i) => (
          <li key={i} className={clsx("max-w-[85%] rounded-[10px] px-3 py-2 text-[15px]", m.who === (name || "You") ? "ml-auto bg-blue text-white" : "bg-paper")}>
            <p className="text-xs font-semibold opacity-75">{m.who}</p>
            {m.text}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2 border-t-2 border-ink/10 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setMsgs([...msgs, { who: name || "You", text: text.trim() }]);
          setText("");
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something kind" className={clsx(inputClass, "h-10")} />
        <Button size="sm" type="submit" className="h-10">
          Send
        </Button>
      </form>
    </aside>
  );
}

function DemoClock({ onSkip }: { onSkip: () => void }) {
  const [open, setOpen] = useState(false);
  const setOffset = useStore((s) => s.setClockOffset);
  return (
    <div className="fixed bottom-20 left-4 z-30">
      {open ? (
        <div className="rise w-60 rounded-[12px] border-2 border-ink bg-surface p-3 text-sm shadow-brut">
          <p className="font-semibold">Demo clock</p>
          <p className="mt-0.5 text-muted">Move time forward to see breaks, check-ins and the finish.</p>
          <div className="mt-3 grid gap-2">
            <Button
              size="sm"
              onClick={() => {
                onSkip();
                if (window.innerWidth < 768) setOpen(false);
              }}
            >
              Skip to next segment
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOffset(0)}>
              Back to real time
            </Button>
          </div>
          <button className="mt-2 text-xs font-semibold text-muted underline" onClick={() => setOpen(false)}>
            Hide
          </button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-full border-2 border-dashed border-ink/50 bg-surface px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink">
          Demo clock
        </button>
      )}
    </div>
  );
}

/* ---------------- Completion ---------------- */

function Completion({
  data,
  goal,
  taskId,
  people,
  onAgain,
}: {
  data: { blocks: number; minutes: number; outcome: CheckInType; xpBefore: number };
  goal?: string;
  taskId?: string;
  people: Person[];
  onAgain: () => void;
}) {
  const s = useStore();
  const router = useRouter();
  const today = dreamDay(nowMs(s.clockOffsetMin), s.profile.timezone);
  const streak = selectStreak(s, today);
  const task = s.tasks.find((t) => t.id === taskId);
  const xpGained = s.xp - data.xpBefore;
  const counted = data.blocks > 0;
  const tier = !counted ? "none" : data.outcome === "finished" ? "great" : data.outcome === "good" ? "good" : "showed";
  const headline = { great: "🌈✨🚀 YOU’RE CRUSHING YOUR GOALS!!! 🎉", good: "Solid session. That’s real progress.", showed: "You showed up. That counts.", none: "No full block this time" }[tier];
  const buddyNames = s.buddies.map((b) => b.name);
  const [added, setAdded] = useState<string[]>([]);

  return (
    <div className="min-h-dvh bg-paper">
      {tier === "great" && <Confetti />}
      {tier === "good" && <Confetti pieces={30} />}
      <div className="mx-auto max-w-2xl px-4 py-12 md:py-16">
        <div className="text-center">
          <Mascot mood={tier === "great" || tier === "good" ? "celebrating" : tier === "showed" ? "happy" : "looking"} size={140} className="pop mx-auto" />
          <h1 className={clsx("mt-6 font-bold tracking-tight", tier === "great" ? "text-3xl md:text-5xl" : "text-3xl md:text-4xl")}>{headline}</h1>
          {goal && counted && (
            <p className="mt-3 text-lg text-muted">
              You planned: <span className="font-semibold text-ink">{goal}</span>
            </p>
          )}
          {!counted && <p className="mt-3 text-lg text-muted">Sessions count once you finish one block. Next time, stay for 25 minutes.</p>}
        </div>

        {counted && (
          <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [`${data.blocks}`, data.blocks === 1 ? "block done" : "blocks done"],
              [`${data.minutes}m`, "focused"],
              [`🔥 ${streak.current}`, streak.current === 1 ? "day streak" : "day streak"],
              [`+${xpGained}`, "XP"],
            ].map(([v, l]) => (
              <li key={l} className="rise rounded-[var(--dh-radius)] border-2 border-ink bg-surface p-4 text-center shadow-brut-sm">
                <p className="text-2xl font-bold tabular-nums">{v}</p>
                <p className="text-sm text-muted">{l}</p>
              </li>
            ))}
          </ul>
        )}

        {task && counted && (
          <div className="mt-6 rounded-[var(--dh-radius)] border-[1.5px] border-hairline bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{task.title}</p>
              <span className="text-sm font-semibold tabular-nums">{Math.round(taskProgress(task) * 100)}%</span>
            </div>
            <Progress value={taskProgress(task)} className="mt-2" />
          </div>
        )}

        {people.filter((p) => !buddyNames.includes(p.name)).length > 0 && counted && (
          <div className="mt-6 rounded-[var(--dh-radius)] border-[1.5px] border-hairline bg-surface p-4">
            <p className="font-semibold">Focused well with someone?</p>
            <p className="text-sm text-muted">Focus buddies see your streak and can nudge you on save days.</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {people
                .filter((p) => !buddyNames.includes(p.name))
                .map((p) => (
                  <li key={p.id}>
                    <Button
                      size="sm"
                      variant={added.includes(p.name) ? "ghost" : "secondary"}
                      disabled={added.includes(p.name)}
                      onClick={() => {
                        s.addBuddyRequest(p.name);
                        setAdded([...added, p.name]);
                        s.showToast(`Buddy request sent to ${p.name}.`);
                      }}
                    >
                      <Avatar name={p.name} hue={p.hue} size={22} />
                      {added.includes(p.name) ? "Request sent" : `Add ${p.name}`}
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={onAgain}>
            🚀 Start another block
          </Button>
          <Button size="lg" variant="secondary" onClick={() => router.push("/home")}>
            I’m done for today
          </Button>
        </div>
        {counted && <p className="mt-6 text-center text-sm text-muted">+{XP.focusBlock} XP per block · today counts towards your streak</p>}
      </div>
      <Toast />
    </div>
  );
}

