"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Logo, Mascot, Swirls } from "@/components/brand";
import { Button, ButtonLink, Checkbox, Field, Panel, Segmented, inputClass } from "@/components/ui";
import { IconBack, IconClose, IconPlus } from "@/components/icons";
import { CATEGORIES, type Detail } from "@/lib/domain/breakdown";
import { suggestBreakdown } from "@/lib/breakdown-client";
import { cascadeDeadlines, INTENSITY, type Intensity } from "@/lib/domain/cascade";
import { addDays, dreamDay, formatClock, formatDuration, formatShortDate } from "@/lib/domain/time";
import { focusHourBanner } from "@/lib/domain/session";
import { useStore, nowMs } from "@/lib/store";
import { supabase, supabaseConfigured } from "@/lib/supabase/client";
import { useHydrated } from "@/lib/hooks";
import { Toast } from "@/components/feedback";

const STEPS = ["What", "Goal", "Deadline", "Plan", "Together", "Save", "Start"] as const;

export default function Onboarding() {
  const hydrated = useHydrated();
  const [step, setStep] = useState(0);
  const router = useRouter();
  const onboarded = useStore((s) => s.profile.onboarded);
  const setDraft = useStore((s) => s.setDraft);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const st = Number(q.get("step"));
    if (st >= 0 && st < STEPS.length && q.get("step") !== null) setStep(st);
    const nx = q.get("next");
    if (nx && nx.startsWith("/") && !nx.startsWith("//")) setDraft({ next: nx });
  }, [setDraft]);

  useEffect(() => {
    if (hydrated && onboarded && step === 0 && !new URLSearchParams(window.location.search).get("step")) router.replace("/home");
  }, [hydrated, onboarded, step, router]);

  if (!hydrated) return null;

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
        {step > 0 && step < 6 ? (
          <Button variant="ghost" size="sm" onClick={back} aria-label="Back">
            <IconBack width={18} height={18} /> Back
          </Button>
        ) : (
          <Logo height={24} />
        )}
        <ol className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <li key={s} className={clsx("h-2 rounded-full border-[1.5px] border-ink transition-all", i === step ? "w-7 bg-blue" : i < step ? "w-2 bg-ink" : "w-2 bg-surface")} />
          ))}
        </ol>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-4">
        <div key={step} className="rise">
          {step === 0 && <StepCategory onNext={next} />}
          {step === 1 && <StepGoal onNext={next} />}
          {step === 2 && <StepDeadline onNext={next} />}
          {step === 3 && <StepPlan onNext={next} />}
          {step === 4 && <StepTogether onNext={next} />}
          {step === 5 && <StepSave onNext={next} />}
          {step === 6 && <StepFirstSession />}
        </div>
      </main>
      <Toast />
    </div>
  );
}

function Heading({ title, sub, mood }: { title: string; sub?: string; mood?: Parameters<typeof Mascot>[0]["mood"] }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-[2rem] leading-tight font-bold tracking-tight md:text-[2.6rem]">{title}</h1>
        {sub && <p className="mt-2 max-w-xl text-lg text-muted">{sub}</p>}
      </div>
      {mood && <Mascot mood={mood} size={84} className="hidden shrink-0 sm:block" />}
    </div>
  );
}

function StepCategory({ onNext }: { onNext: () => void }) {
  const { draft, setDraft } = useStore();
  return (
    <>
      <Heading title="👋 Welcome to DreamHub. What do you want to get done?" mood="waving" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setDraft({ category: c.id });
              onNext();
            }}
            className={clsx(
              "press flex h-28 flex-col items-start justify-between rounded-[var(--dh-radius)] border-2 border-ink p-4 text-left shadow-brut",
              draft.category === c.id ? "bg-haze" : "bg-surface",
            )}
          >
            <span className="text-2xl" aria-hidden>
              {c.emoji}
            </span>
            <span className="text-lg font-semibold">{c.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function StepGoal({ onNext }: { onNext: () => void }) {
  const { draft, setDraft } = useStore();
  const [goal, setGoal] = useState(draft.goal ?? "");
  const examples = {
    school: "Finish the first draft of my dissertation",
    work: "Ship the quarterly report",
    business: "Launch my website",
    creative: "Write the first three chapters of my book",
    personal: "Sort out my finances",
    other: "Clear out the spare room",
  } as const;
  const example = examples[draft.category ?? "other"];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!goal.trim()) return;
        setDraft({ goal: goal.trim() });
        onNext();
      }}
    >
      <Heading title="Let’s make it specific. What are you trying to get done?" sub="A clear goal makes it easier to know where to start." mood="looking" />
      <Field label="I want to…">
        <input autoFocus className={clsx(inputClass, "h-14 text-lg")} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={example} />
      </Field>
      <button type="button" className="mt-3 text-sm font-semibold text-sky underline underline-offset-4" onClick={() => setGoal(example)}>
        Use an example: “{example}”
      </button>
      <div className="mt-10">
        <Button type="submit" size="lg" disabled={!goal.trim()}>
          Continue
        </Button>
      </div>
    </form>
  );
}

function StepDeadline({ onNext }: { onNext: () => void }) {
  const { draft, setDraft, profile } = useStore();
  const today = dreamDay(Date.now(), profile.timezone);
  const endOfWeek = addDays(today, (7 - new Date().getDay()) % 7 || 7);
  const options = [
    { key: "week", label: "This week", date: endOfWeek },
    { key: "month", label: "This month", date: addDays(today, 30) },
    { key: "pick", label: "Pick a date", date: draft.deadline ?? addDays(today, 21) },
    { key: "none", label: "No deadline", date: undefined },
  ] as const;
  const [choice, setChoice] = useState<string>(draft.deadline ? "pick" : "month");
  const [picked, setPicked] = useState(draft.deadline ?? addDays(today, 21));
  const date = choice === "pick" ? picked : options.find((o) => o.key === choice)?.date;

  return (
    <>
      <Heading title="When does it need to be done?" sub="A deadline turns “someday” into a plan. We’ll spread smaller deadlines across the steps." mood="determined" />
      <Segmented value={choice} onChange={setChoice} options={options.map((o) => ({ value: o.key, label: o.label }))} />
      {choice === "pick" && (
        <div className="mt-5 max-w-xs">
          <Field label="Deadline">
            <input type="date" className={inputClass} min={addDays(today, 1)} value={picked} onChange={(e) => setPicked(e.target.value)} />
          </Field>
        </div>
      )}
      {date && <p className="mt-5 text-lg">Due <strong>{formatShortDate(date)}</strong></p>}

      {date && (
        <div className="mt-8">
          <p className="mb-2 font-semibold">How much pressure do you want?</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(INTENSITY) as Intensity[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setDraft({ intensity: k })}
                aria-pressed={draft.intensity === k}
                className={clsx("rounded-[var(--dh-radius)] border-2 border-ink p-4 text-left", draft.intensity === k ? "bg-ink text-white shadow-brut" : "bg-surface hover:bg-haze/40")}
              >
                <span className="font-semibold">
                  {INTENSITY[k].label}
                  {k === "standard" && " (recommended)"}
                </span>
                <span className={clsx("mt-1 block text-sm", draft.intensity === k ? "text-white/80" : "text-muted")}>{INTENSITY[k].blurb}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10">
        <Button
          size="lg"
          onClick={() => {
            setDraft({ deadline: date });
            onNext();
          }}
        >
          Continue
        </Button>
      </div>
    </>
  );
}

function StepPlan({ onNext }: { onNext: () => void }) {
  const { draft, setDraft, profile } = useStore();
  const [detail, setDetail] = useState<Detail>("medium");
  const [loading, setLoading] = useState(draft.steps.length === 0);
  const [newStep, setNewStep] = useState("");
  const today = dreamDay(Date.now(), profile.timezone);

  useEffect(() => {
    let live = true;
    if (draft.steps.length > 0 && detail === "medium" && !loading) return;
    setLoading(true);
    suggestBreakdown(draft.goal ?? "", draft.category ?? "other", detail, { deadline: draft.deadline }).then((steps) => {
      if (!live) return;
      setDraft({ steps });
      setLoading(false);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const due = useMemo(() => {
    if (!draft.deadline) return {};
    return cascadeDeadlines({
      start: today,
      deadline: draft.deadline,
      tasks: draft.steps.map((s, i) => ({ id: String(i), estimatedMinutes: s.estimatedMinutes })),
      intensity: draft.intensity,
    });
  }, [draft.steps, draft.deadline, draft.intensity, today]);

  const update = (i: number, title: string) => setDraft({ steps: draft.steps.map((s, j) => (j === i ? { ...s, title } : s)) });
  const remove = (i: number) => setDraft({ steps: draft.steps.filter((_, j) => j !== i) });

  return (
    <>
      <Heading title="Here’s your plan" sub={`You said you want to: ${draft.goal}`} mood={loading ? "looking" : "happy"} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Detail</span>
        <Segmented
          value={detail}
          onChange={setDetail}
          options={[
            { value: "less", label: "Bigger steps" },
            { value: "medium", label: "Balanced" },
            { value: "more", label: "Tiny steps" },
          ]}
        />
      </div>

      <Panel className="p-2">
        {loading ? (
          <div className="flex items-center gap-3 p-6 text-lg" role="status">
            <span className="inline-block size-5 animate-spin rounded-full border-[3px] border-ink border-t-transparent" aria-hidden />
            Breaking it down…
          </div>
        ) : (
          <ul>
            {draft.steps.map((s, i) => (
              <li key={i} className="group flex items-center gap-3 rounded-[8px] px-3 py-2.5 hover:bg-paper">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-haze text-xs font-bold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <input
                    aria-label={`Step ${i + 1}`}
                    value={s.title}
                    onChange={(e) => update(i, e.target.value)}
                    className="w-full bg-transparent text-[16px] font-medium focus:outline-none focus:underline"
                  />
                  <span className="block text-xs text-muted sm:hidden">
                    {formatDuration(s.estimatedMinutes)}
                    {due[String(i)] ? ` · due ${formatShortDate(due[String(i)])}` : ""}
                  </span>
                </div>
                <span className="hidden text-sm text-muted sm:inline">{formatDuration(s.estimatedMinutes)}</span>
                {due[String(i)] && <span className="hidden shrink-0 rounded-full bg-haze/60 px-2 py-0.5 text-xs font-semibold sm:inline">{formatShortDate(due[String(i)])}</span>}
                <button onClick={() => remove(i)} aria-label={`Delete ${s.title}`} className="rounded p-1 text-muted hover:bg-missed-tint hover:text-missed">
                  <IconClose width={18} height={18} />
                </button>
              </li>
            ))}
            <li className="px-3 py-2">
              <form
                className="flex items-center gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newStep.trim()) return;
                  setDraft({ steps: [...draft.steps, { title: newStep.trim(), estimatedMinutes: 60 }] });
                  setNewStep("");
                }}
              >
                <IconPlus width={20} height={20} className="text-muted" />
                <input value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Add a step" className="flex-1 bg-transparent py-1 focus:outline-none" />
              </form>
            </li>
          </ul>
        )}
      </Panel>
      {draft.deadline && !loading && (
        <p className="mt-3 text-sm text-muted">
          Mini-deadlines are spread before your final date of {formatShortDate(draft.deadline)}, with a {Math.round(INTENSITY[draft.intensity].buffer * 100)}% buffer.
        </p>
      )}
      <div className="mt-10 flex flex-wrap gap-3">
        <Button size="lg" onClick={onNext} disabled={loading || draft.steps.length === 0}>
          Looks good
        </Button>
      </div>
    </>
  );
}

function StepTogether({ onNext }: { onNext: () => void }) {
  return (
    <>
      <div className="relative isolate overflow-hidden rounded-[18px] border-2 border-ink bg-blue p-6 text-white shadow-brut md:p-10">
        <Swirls />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h1 className="text-[2rem] leading-tight font-bold tracking-tight md:text-[2.6rem]">You don’t have to do it alone.</h1>
            <p className="mt-4 max-w-lg text-lg text-white/90">
              Every evening from 6:30 to 8:30pm, people on DreamHub focus together. Join any time, say what you’re working on, and get started alongside them.
            </p>
            <p className="mt-3 max-w-lg text-lg text-white/90">Can’t make it? Start your own session and invite friends, or focus solo whenever you like.</p>
          </div>
          <Mascot mood="waving" size={140} className="mx-auto" />
        </div>
      </div>
      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {["Cameras are optional", "Mics muted while you focus", "Never recorded"].map((t) => (
          <li key={t} className="rounded-[var(--dh-radius)] border-[1.5px] border-hairline bg-surface p-4 font-semibold">
            ✓ {t}
          </li>
        ))}
      </ul>
      <div className="mt-10">
        <Button size="lg" onClick={onNext}>
          Save my plan
        </Button>
      </div>
    </>
  );
}

function StepSave({ onNext }: { onNext: () => void }) {
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const setDraft = useStore((s) => s.setDraft);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [agree, setAgree] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000)) : null;
  const tooYoung = age !== null && age < 18;
  const eligible = age !== null && !tooYoung && agree;
  const valid = eligible && name.trim() && /\S+@\S+\.\S+/.test(email);
  const live = supabaseConfigured;
  const callback = (path: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(path)}`;

  const remember = () => setDraft({ account: { name: name.trim(), dateOfBirth: dob } });

  const google = async () => {
    if (!eligible) return setError("Add your date of birth and agree to the guidelines first.");
    if (!live) {
      setName((n) => n || "Alex");
      setEmail((e) => e || "alex@gmail.com");
      return;
    }
    remember();
    setBusy(true);
    const { error } = await supabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback("/start/finish") } });
    if (error) {
      setBusy(false);
      setError("Google sign-in isn’t available right now. Use your email instead.");
    }
  };

  const submit = async () => {
    if (!valid) return;
    if (!live) {
      completeOnboarding(name.trim(), email.trim());
      onNext();
      return;
    }
    remember();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callback("/start/finish"), data: { name: name.trim() } },
    });
    setBusy(false);
    if (error) setError(error.message.includes("rate") ? "Too many attempts. Wait a minute and try again." : "We couldn’t send the link. Check the email address and try again.");
    else setSent(email.trim());
  };

  if (sent) {
    return (
      <>
        <Heading title="Check your email 📬" sub={`We sent a sign-in link to ${sent}. Open it on this device and your plan will be saved.`} mood="happy" />
        <p className="text-muted">No email after a minute? Check spam, or</p>
        <Button variant="secondary" className="mt-3" onClick={() => setSent(null)}>
          Try a different email
        </Button>
      </>
    );
  }

  return (
    <>
      <Heading title="Let’s save your plan" sub="Create your free account and we’ll keep your goal, steps and progress." mood="happy" />
      <div className="max-w-md space-y-4">
        <Field label="Date of birth" hint={tooYoung ? undefined : "DreamHub is for adults 18 and over."}>
          <input type="date" className={inputClass} value={dob} onChange={(e) => setDob(e.target.value)} autoComplete="bday" />
        </Field>
        {tooYoung && <p className="rounded-[8px] bg-missed-tint px-3 py-2 text-sm font-medium text-missed">You need to be 18 or over to use DreamHub.</p>}
        <div className="flex items-start gap-3">
          <Checkbox checked={agree} onChange={() => setAgree((a) => !a)} label="I agree to the community guidelines" className="mt-0.5" />
          <span className="text-sm">I agree to the community guidelines: be kind, stay on task, cameras show only you, no recording, no selling.</span>
        </div>

        <Button variant="secondary" size="lg" className="w-full" onClick={google} disabled={busy}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z" />
            <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1-3.8 1-2.9 0-5.4-2-6.3-4.6H2v2.8A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.7 14a6.6 6.6 0 0 1 0-4.2V7H2a11 11 0 0 0 0 10l3.7-3z" />
            <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7l3.7 2.8C6.6 7.3 9 5.4 12 5.4z" />
          </svg>
          Continue with Google
        </Button>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="h-px flex-1 bg-hairline" /> or use email <span className="h-px flex-1 bg-hairline" />
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="First name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </Field>
          <Field label="Email" hint="We’ll send a sign-in link. No password needed.">
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          {error && <p className="rounded-[8px] bg-missed-tint px-3 py-2 text-sm font-medium text-missed">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={!valid || busy}>
            {busy ? "Sending…" : live ? "Email me a sign-in link" : "Create my free account"}
          </Button>
          <p className="text-center text-sm text-muted">Free to get started. No credit card required.</p>
        </form>
      </div>
    </>
  );
}

function StepFirstSession() {
  const s = useStore();
  const router = useRouter();
  const task = s.tasks.find((t) => !t.completedAt);
  const now = nowMs(s.clockOffsetMin);
  const b = focusHourBanner(now);
  const live = b.state === "live" || b.state === "soon";
  const start = b.state === "later" ? b.startsAt : b.state === "done" ? b.nextStartsAt : undefined;
  // Arrived from an invite link: send them straight into that session.
  const invited = s.draft.next ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null);

  if (invited?.startsWith("/room/")) {
    return (
      <>
        <Heading title="🎉 You’re in. Your friend’s session is waiting." sub="Bring your first step with you." mood="celebrating" />
        <ButtonLink href={`${invited}${task ? `?task=${task.id}` : ""}`} size="xl">
          Join the session
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <Heading title="🎉 Your first session is ready" sub="Start with one small step. 25 minutes is plenty." mood="celebrating" />
      <Panel className="p-5">
        <p className="text-sm font-semibold text-muted">Your first step</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{task?.title ?? "Your first step"}</p>
        <p className="mt-1 text-muted">Suggested: one 25-minute block</p>
      </Panel>
      <div className="mt-8 flex flex-wrap gap-3">
        {live ? (
          <>
            <ButtonLink href="/room/focus-hour" size="xl">
              Join tonight’s Focus Hour
            </ButtonLink>
            <ButtonLink href="/room/solo" variant="secondary" size="lg">
              Start solo instead
            </ButtonLink>
          </>
        ) : (
          <>
            <Button
              size="xl"
              onClick={() => {
                s.startSolo({ kickoffMinutes: 0, blocks: 1, blockMinutes: 25, breakMinutes: 0 });
                router.push("/room/solo");
              }}
            >
              🚀 Start solo now
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                s.showToast(start ? `We’ll remind you at ${formatClock(start - 5 * 60_000, s.profile.timezone)}.` : "Reminder set.");
                setTimeout(() => router.push("/home"), 900);
              }}
            >
              Remind me before Focus Hour
            </Button>
          </>
        )}
      </div>
      <button className="mt-6 text-sm font-semibold text-muted underline underline-offset-4" onClick={() => router.push("/home")}>
        Go to my dashboard
      </button>
    </>
  );
}
