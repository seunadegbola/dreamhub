"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import clsx from "clsx";
import { useStore, taskProgress } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { Button, ButtonLink, Checkbox, DeadlineBadge, Field, Panel, Pill, Progress, Segmented, inputClass } from "@/components/ui";
import { Modal } from "@/components/modal";
import { IconBack, IconPlus, IconTrash } from "@/components/icons";
import { CATEGORIES, breakdownSteps, tinySteps } from "@/lib/domain/breakdown";
import { INTENSITY, type DeadlineState, type Intensity } from "@/lib/domain/cascade";
import { addDays, daysBetween, formatDuration, formatShortDate } from "@/lib/domain/time";
import type { Task } from "@/lib/types";
import { taskState } from "@/lib/view";

export default function GoalPage() {
  return (
    <Suspense>
      <Goal />
    </Suspense>
  );
}

function Goal() {
  const { goalId } = useParams<{ goalId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const s = useStore();
  const today = useToday();
  const goal = s.goals.find((g) => g.id === goalId);
  const tasks = s.tasks.filter((t) => t.goalId === goalId).sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const [open, setOpen] = useState<string | null>(params.get("breakdown") ?? tasks.find((t) => !t.completedAt)?.id ?? null);
  const [newTask, setNewTask] = useState("");
  const [extendFor, setExtendFor] = useState<Task | null>(null);

  useEffect(() => {
    const b = params.get("breakdown");
    if (b) setOpen(b);
  }, [params]);

  if (!goal) {
    return (
      <div className="py-16 text-center">
        <p className="text-xl font-semibold">We couldn’t find that goal.</p>
        <ButtonLink href="/tasks" className="mt-4">
          Back to goals
        </ButtonLink>
      </div>
    );
  }

  const progress = tasks.length ? tasks.reduce((a, t) => a + taskProgress(t), 0) / tasks.length : 0;
  const cat = CATEGORIES.find((c) => c.id === goal.category);
  const extensionsUsed = tasks.reduce((a, t) => a + t.extensions.length, 0);
  const allowed = INTENSITY[goal.intensity].extensions;
  const extensionsLeft = allowed === "unlimited" ? Infinity : allowed - extensionsUsed;

  return (
    <div className="space-y-6">
      <Link href="/tasks" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <IconBack width={16} height={16} /> Goals
      </Link>

      <header>
        <p className="text-sm font-semibold text-muted">
          {cat?.emoji} {cat?.label}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">{goal.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {goal.deadline ? <Pill>Due {formatShortDate(goal.deadline)}</Pill> : <Pill>No deadline</Pill>}
          <Pill>{INTENSITY[goal.intensity].label}</Pill>
          {goal.committed && <Pill className="bg-haze/50">Shared with buddies</Pill>}
          {goal.deadline && goal.intensity !== "gentle" && (
            <Pill>
              {extensionsLeft === Infinity ? "Unlimited extensions" : `${Math.max(0, extensionsLeft)} extension${extensionsLeft === 1 ? "" : "s"} left`}
            </Pill>
          )}
        </div>
        <div className="mt-4 flex max-w-md items-center gap-3">
          <Progress value={progress} />
          <span className="text-sm font-semibold tabular-nums">{Math.round(progress * 100)}%</span>
        </div>
      </header>

      {goal.deadline && <Cascade tasks={tasks} start={goal.createdOn} deadline={goal.deadline} today={today} />}

      <GoalSettings goalId={goal.id} />

      <section aria-label="Tasks" className="space-y-3">
        {tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            today={today}
            open={open === t.id}
            onToggleOpen={() => setOpen(open === t.id ? null : t.id)}
            onExtend={() => setExtendFor(t)}
            category={goal.category}
          />
        ))}
        <form
          className="flex items-center gap-3 rounded-[var(--dh-radius)] border-2 border-dashed border-ink/40 bg-surface px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTask.trim()) return;
            s.addTask(goal.id, newTask.trim());
            setNewTask("");
          }}
        >
          <IconPlus width={20} height={20} className="text-muted" />
          <input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task" className="flex-1 bg-transparent py-1 font-medium focus:outline-none" />
          {newTask && <Button size="sm">Add</Button>}
        </form>
      </section>

      {goal.deadline && (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              s.recascade(goal.id);
              s.showToast("Here’s the new plan. Deadlines re-spread across what’s left.");
            }}
          >
            Re-plan remaining deadlines
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm("Delete this goal and its tasks?")) {
                tasks.forEach((t) => s.deleteTask(t.id));
                useStore.setState((st) => ({ goals: st.goals.filter((g) => g.id !== goal.id) }));
                router.push("/tasks");
              }
            }}
          >
            Delete goal
          </Button>
        </div>
      )}

      <ExtensionModal task={extendFor} onClose={() => setExtendFor(null)} extensionsLeft={extensionsLeft} witnessed={INTENSITY[goal.intensity].witnessed} />
    </div>
  );
}

/* ------------ Cascade timeline: the shape of the plan at a glance ------------ */

const DOT: Record<DeadlineState, string> = {
  on_track: "bg-surface",
  at_risk: "bg-save",
  due_today: "bg-blue",
  missed: "bg-missed",
  done: "bg-good",
};

function Cascade({ tasks, start, deadline, today }: { tasks: Task[]; start: string; deadline: string; today: string }) {
  const span = Math.max(1, daysBetween(start, deadline));
  const pos = (d: string) => `${Math.min(100, Math.max(0, (daysBetween(start, d) / span) * 100))}%`;
  const lastDue = tasks.filter((t) => t.dueOn).map((t) => t.dueOn!).sort().at(-1);

  return (
    <Panel className="p-5 md:p-6">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">The plan</h2>
        <p className="text-sm text-muted">{daysBetween(today, deadline)} days to go · buffer after the last step</p>
      </div>
      <div className="relative mx-2 h-16">
        {/* track */}
        <div className="absolute inset-x-0 top-6 h-2 rounded-full border-2 border-ink bg-paper" />
        {/* elapsed */}
        <div className="absolute left-0 top-6 h-2 rounded-l-full bg-haze-700" style={{ width: pos(today) }} />
        {/* buffer */}
        {lastDue && (
          <div
            className="absolute top-[18px] h-5 rounded-[4px] border-2 border-dashed border-ink/50"
            style={{ left: pos(lastDue), right: 0, background: "repeating-linear-gradient(135deg, transparent 0 5px, rgba(5,8,102,.12) 5px 7px)" }}
            title="Buffer"
          />
        )}
        {/* today */}
        <div className="absolute top-0 -translate-x-1/2" style={{ left: pos(today) }}>
          <div className="mx-auto h-14 w-0.5 bg-ink" />
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-white">Today</span>
        </div>
        {/* task markers */}
        {tasks.map((t, i) =>
          t.dueOn ? (
            <span
              key={t.id}
              title={`${t.title}: ${formatShortDate(t.dueOn)}`}
              className={clsx(
                "absolute top-[14px] grid size-7 -translate-x-1/2 place-items-center rounded-full border-2 border-ink text-xs font-bold",
                DOT[stateOf(t, today)],
                stateOf(t, today) === "due_today" || stateOf(t, today) === "done" || stateOf(t, today) === "missed" ? "text-white" : "text-ink",
              )}
              style={{ left: pos(t.dueOn) }}
            >
              {i + 1}
            </span>
          ) : null,
        )}
        {/* goal deadline */}
        <span className="absolute right-0 top-[10px] translate-x-1/2 text-2xl" aria-hidden>
          🏁
        </span>
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{formatShortDate(start)}</span>
        <span className="font-semibold text-ink">{formatShortDate(deadline)}</span>
      </div>
    </Panel>
  );
}

function stateOf(t: Task, today: string): DeadlineState {
  return taskState(t, useStore.getState().tasks, today);
}

/* ------------ Goal settings ------------ */

function GoalSettings({ goalId }: { goalId: string }) {
  const s = useStore();
  const goal = s.goals.find((g) => g.id === goalId)!;
  const [editing, setEditing] = useState(false);
  if (!goal.deadline) return null;
  return (
    <div>
      <button className="text-sm font-semibold text-sky underline underline-offset-4" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
        {editing ? "Hide settings" : "Deadline settings"}
      </button>
      {editing && (
        <div className="rise mt-3 grid gap-4 rounded-[var(--dh-radius)] border-[1.5px] border-hairline bg-surface p-4 md:grid-cols-2">
          <div>
            <p className="mb-1.5 text-sm font-semibold">Intensity</p>
            <Segmented
              value={goal.intensity}
              onChange={(v: Intensity) => s.updateGoal(goal.id, { intensity: v })}
              options={(Object.keys(INTENSITY) as Intensity[]).map((k) => ({ value: k, label: INTENSITY[k].label }))}
            />
            <p className="mt-1.5 text-sm text-muted">{INTENSITY[goal.intensity].blurb}</p>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">Share deadlines with buddies</p>
            <Segmented
              value={goal.committed ? "y" : "n"}
              onChange={(v) => {
                s.updateGoal(goal.id, { committed: v === "y" });
                useStore.setState((st) => ({ tasks: st.tasks.map((t) => (t.goalId === goal.id ? { ...t, committed: v === "y" } : t)) }));
              }}
              options={[
                { value: "y", label: "Committed" },
                { value: "n", label: "Just for me" },
              ]}
            />
            <p className="mt-1.5 text-sm text-muted">Committed deadlines can only move with an extension.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------ Task row ------------ */

function TaskRow({
  task,
  today,
  open,
  onToggleOpen,
  onExtend,
  category,
}: {
  task: Task;
  today: string;
  open: boolean;
  onToggleOpen: () => void;
  onExtend: () => void;
  category: Parameters<typeof breakdownSteps>[1];
}) {
  const s = useStore();
  const [sub, setSub] = useState("");
  const state = stateOf(task, today);
  const done = !!task.completedAt;
  const pending = task.extensions.find((e) => e.status === "pending");

  return (
    <div className={clsx("rounded-[var(--dh-radius)] border-2 border-ink bg-surface", open && "shadow-brut")}>
      <div className="flex items-center gap-3 p-4">
        <Checkbox checked={done} onChange={() => s.toggleTask(task.id)} label={`Complete ${task.title}`} />
        <button onClick={onToggleOpen} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <p className={clsx("truncate text-[17px] font-semibold", done && "text-muted line-through")}>{task.title}</p>
          <p className="text-sm text-muted">
            {task.dueOn ? `Due ${formatShortDate(task.dueOn)}` : "No due date"} · {formatDuration(task.estimatedMinutes)}
            {task.subtasks.length > 0 && ` · ${task.subtasks.filter((x) => x.done).length}/${task.subtasks.length} steps`}
          </p>
        </button>
        {task.dueOn && <DeadlineBadge state={state} />}
      </div>

      {open && (
        <div className="rise border-t-2 border-ink/10 px-4 pb-4 pt-3">
          {state === "missed" && (
            <p className="mb-3 rounded-[8px] bg-missed-tint px-3 py-2 text-sm">
              Missed one. That’s okay. Re-plan the remaining deadlines or request an extension to get back on track.
            </p>
          )}
          {pending && (
            <p className="mb-3 rounded-[8px] bg-save-tint px-3 py-2 text-sm">
              Waiting for {pending.witness} to approve moving this to {formatShortDate(pending.newDue)}.
            </p>
          )}

          {task.subtasks.length > 0 ? (
            <ul className="space-y-2">
              {task.subtasks.map((st) => (
                <li key={st.id} className="group flex items-center gap-3">
                  <Checkbox checked={st.done} onChange={() => s.toggleSubtask(task.id, st.id)} label={st.title} />
                  <span className={clsx("flex-1", st.done && "text-muted line-through")}>{st.title}</span>
                  <button aria-label={`Delete ${st.title}`} onClick={() => s.deleteSubtask(task.id, st.id)} className="text-muted opacity-0 hover:text-missed group-hover:opacity-100 focus:opacity-100">
                    <IconTrash width={16} height={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted">No steps yet.</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  s.addSubtasks(task.id, breakdownSteps(task.title, category, "less").map((x) => ({ ...x, title: x.title })));
                  s.showToast("🧩 Much easier. One step at a time.");
                }}
              >
                🧩 Break it down
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  s.addSubtasks(task.id, tinySteps(task.title));
                  s.showToast("🧩 Tiny steps added. Start with the first one.");
                }}
              >
                Too big to start?
              </Button>
            </div>
          )}

          <form
            className="mt-3 flex items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!sub.trim()) return;
              s.addSubtasks(task.id, [{ title: sub.trim(), estimatedMinutes: 25 }]);
              setSub("");
            }}
          >
            <IconPlus width={18} height={18} className="text-muted" />
            <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Add a step" className="flex-1 bg-transparent py-1 text-[15px] focus:outline-none" />
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {!done && (
              <ButtonLink href={`/focus?task=${task.id}`} size="md">
                🚀 Start focusing
              </ButtonLink>
            )}
            {task.dueOn && !done && (
              <Button variant="secondary" onClick={onExtend} disabled={!!pending}>
                {task.committed ? "Request extension" : "Change date"}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm(`Delete “${task.title}”?`)) s.deleteTask(task.id);
              }}
            >
              Delete
            </Button>
          </div>
          {task.extensions.length > 0 && (
            <details className="mt-3 text-sm text-muted">
              <summary className="cursor-pointer font-semibold">Deadline history</summary>
              <ul className="mt-2 space-y-1">
                {task.extensions.map((e) => (
                  <li key={e.id}>
                    {formatShortDate(e.oldDue)} → {formatShortDate(e.newDue)}: “{e.reason}” ({e.status === "approved" ? `approved by ${e.witness}` : e.status === "pending" ? `waiting for ${e.witness}` : "self-approved"})
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------ Extension request ------------ */

function ExtensionModal({ task, onClose, extensionsLeft, witnessed }: { task: Task | null; onClose: () => void; extensionsLeft: number; witnessed: boolean }) {
  const s = useStore();
  const buddies = s.buddies.filter((b) => b.status === "active");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [witness, setWitness] = useState<string>("");

  useEffect(() => {
    if (task?.dueOn) {
      setDate(addDays(task.dueOn, 3));
      setReason("");
      setWitness(buddies[0]?.name ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  if (!task) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;

  if (!task.committed) {
    return (
      <Modal open onClose={onClose} title="Change the due date">
        <Field label="New date">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Button
          className="mt-5"
          onClick={() => {
            s.updateTask(task.id, { dueOn: date });
            onClose();
          }}
        >
          Save date
        </Button>
      </Modal>
    );
  }

  const outOfExtensions = extensionsLeft <= 0;
  return (
    <Modal open onClose={onClose} title="Request an extension">
      {outOfExtensions ? (
        <div>
          <p>You’ve used all the extensions for this goal. Try one of these instead:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>Break the task into smaller steps</li>
            <li>Cut the scope of the task</li>
            <li>Book a session with a buddy</li>
          </ul>
          <Button className="mt-5" variant="secondary" onClick={onClose}>
            Got it
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            s.requestExtension(task.id, date, reason.trim(), witnessed && witness ? witness : undefined);
            s.showToast(witnessed && witness ? `Request sent to ${witness}.` : "Deadline moved.");
            onClose();
          }}
        >
          <p className="text-muted">
            “{task.title}” is due {task.dueOn && formatShortDate(task.dueOn)}. Committed deadlines can’t move silently.
          </p>
          <Field label="New date">
            <input type="date" className={inputClass} min={task.dueOn ? addDays(task.dueOn, 1) : undefined} value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Why do you need more time?" hint="One line is enough.">
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sources took longer than planned" required />
          </Field>
          {witnessed && buddies.length > 0 && (
            <Field label="Who should approve it?">
              <select className={inputClass} value={witness} onChange={(e) => setWitness(e.target.value)}>
                {buddies.map((b) => (
                  <option key={b.id}>{b.name}</option>
                ))}
              </select>
            </Field>
          )}
          {witnessed && buddies.length === 0 && <p className="text-sm text-muted">You don’t have a buddy yet, so this will be self-approved and still count towards your limit.</p>}
          <p className="text-sm text-muted">
            {extensionsLeft === Infinity ? "Unlimited extensions on this goal." : `${extensionsLeft} extension${extensionsLeft === 1 ? "" : "s"} left on this goal.`} If nobody answers in 24 hours it’s approved automatically.
          </p>
          <Button type="submit" disabled={!reason.trim() || !date}>
            {witnessed && witness ? `Send to ${witness}` : "Move deadline"}
          </Button>
        </form>
      )}
    </Modal>
  );
}

