"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { useStore, taskProgress } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { Button, Field, Panel, Progress, Segmented, inputClass, DeadlineBadge } from "@/components/ui";
import { Modal } from "@/components/modal";
import { Mascot } from "@/components/brand";
import { CATEGORIES, type Category, type SuggestedStep } from "@/lib/domain/breakdown";
import { suggestBreakdown } from "@/lib/breakdown-client";
import { INTENSITY, deadlineState, type Intensity } from "@/lib/domain/cascade";
import { addDays, formatShortDate, daysBetween } from "@/lib/domain/time";
import { IconPlus, IconClose } from "@/components/icons";
import { Suspense } from "react";

export default function TasksPage() {
  return (
    <Suspense>
      <Tasks />
    </Suspense>
  );
}

function Tasks() {
  const s = useStore();
  const today = useToday();
  const params = useSearchParams();
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (params.get("new")) setAdding(true);
  }, [params]);

  const goals = [...s.goals].sort((a, b) => (a.completedAt ? 1 : 0) - (b.completedAt ? 1 : 0) || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Your goals</h1>
          <p className="mt-1 text-lg text-muted">Big outcomes, broken into steps you can start today.</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <IconPlus width={18} height={18} /> New goal
        </Button>
      </div>

      {goals.length === 0 ? (
        <Panel className="flex flex-col items-center gap-3 p-10 text-center">
          <Mascot mood="looking" size={96} />
          <p className="text-2xl font-semibold">Nothing here yet. 👀</p>
          <p className="text-muted">Okay… what are we getting done?</p>
          <Button onClick={() => setAdding(true)} className="mt-2">
            + Add a goal
          </Button>
        </Panel>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => {
            const tasks = s.tasks.filter((t) => t.goalId === g.id);
            const done = tasks.filter((t) => t.completedAt).length;
            const progress = tasks.length ? tasks.reduce((a, t) => a + taskProgress(t), 0) / tasks.length : 0;
            const state = g.deadline
              ? deadlineState({ createdOn: g.createdOn, dueOn: g.deadline, today, progress, completed: !!g.completedAt || (tasks.length > 0 && done === tasks.length) })
              : undefined;
            const cat = CATEGORIES.find((c) => c.id === g.category);
            return (
              <li key={g.id}>
                <Link href={`/tasks/${g.id}`} className="press block rounded-[var(--dh-radius)] border-2 border-ink bg-surface p-5 shadow-brut">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-muted">
                      {cat?.emoji} {cat?.label}
                    </p>
                    {state && <DeadlineBadge state={state} />}
                  </div>
                  <p className="mt-2 text-xl font-semibold tracking-tight">{g.title}</p>
                  <div className="mt-4 flex items-center gap-3">
                    <Progress value={progress} />
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {done}/{tasks.length}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {g.deadline ? `Due ${formatShortDate(g.deadline)} · ${daysBetween(today, g.deadline)} days left` : "No deadline"}
                    {g.committed ? " · shared with buddies" : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <NewGoalModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function NewGoalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const router = useRouter();
  const today = useToday();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("work");
  const [hasDeadline, setHasDeadline] = useState(true);
  const [deadline, setDeadline] = useState(addDays(today, 21));
  const [intensity, setIntensity] = useState<Intensity>("standard");
  const [steps, setSteps] = useState<SuggestedStep[] | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setTitle("");
    setSteps(null);
    setLoading(false);
    onClose();
  };

  const breakDown = async () => {
    setLoading(true);
    setSteps(await suggestBreakdown(title, category, "medium", { deadline: hasDeadline ? deadline : undefined }));
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={reset} title={steps ? "Here’s your plan" : "New goal"} wide>
      {!steps ? (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) breakDown();
          }}
        >
          <Field label="What do you want to get done?">
            <input autoFocus className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Launch my website" />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Type</p>
            <Segmented value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c.id, label: `${c.emoji} ${c.label}` }))} />
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Deadline</p>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented value={hasDeadline ? "y" : "n"} onChange={(v) => setHasDeadline(v === "y")} options={[{ value: "y", label: "Set a date" }, { value: "n", label: "No deadline" }]} />
              {hasDeadline && <input type="date" className={clsx(inputClass, "h-10 w-auto")} min={addDays(today, 1)} value={deadline} onChange={(e) => setDeadline(e.target.value)} />}
            </div>
          </div>
          {hasDeadline && (
            <div>
              <p className="mb-1.5 text-sm font-semibold">Intensity</p>
              <Segmented value={intensity} onChange={setIntensity} options={(Object.keys(INTENSITY) as Intensity[]).map((k) => ({ value: k, label: INTENSITY[k].label }))} />
              <p className="mt-1.5 text-sm text-muted">{INTENSITY[intensity].blurb}</p>
            </div>
          )}
          <Button type="submit" size="lg" disabled={!title.trim() || loading}>
            {loading ? "Breaking it down…" : "🧩 Break it down"}
          </Button>
        </form>
      ) : (
        <div>
          <ul className="space-y-1.5">
            {steps.map((st, i) => (
              <li key={i} className="flex items-center gap-2 rounded-[8px] border-[1.5px] border-hairline px-3 py-2">
                <input
                  aria-label={`Step ${i + 1}`}
                  className="min-w-0 flex-1 bg-transparent font-medium focus:outline-none"
                  value={st.title}
                  onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                />
                <button aria-label="Delete step" onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="text-muted hover:text-missed">
                  <IconClose width={18} height={18} />
                </button>
              </li>
            ))}
          </ul>
          <button className="mt-2 text-sm font-semibold text-sky" onClick={() => setSteps([...steps, { title: "New step", estimatedMinutes: 60 }])}>
            + Add a step
          </button>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={() => {
                const id = s.addGoal({ title: title.trim(), category, deadline: hasDeadline ? deadline : undefined, intensity, steps });
                s.showToast("✨ Nice. Now we know what we’re working with.");
                reset();
                router.push(`/tasks/${id}`);
              }}
            >
              Save goal
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setSteps(null)}>
              Back
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
