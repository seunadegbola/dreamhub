"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore, selectStreak, taskProgress } from "@/lib/store";
import { useNow, useToday } from "@/lib/hooks";
import { dueItems, nextStep } from "@/lib/view";
import { Box, ButtonLink, Checkbox, DeadlineBadge, Panel, Progress, SectionTitle, Avatar } from "@/components/ui";
import { FocusHourBanner } from "@/components/focus-hour-banner";
import { StreakChain } from "@/components/streak-chain";
import { Mascot } from "@/components/brand";
import { daysBetween, formatShortDate, tzOffsetMs } from "@/lib/domain/time";

function greeting(now: number, tz: string) {
  const h = new Date(now + tzOffsetMs(now, tz)).getUTCHours();
  return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function dueLabel(dueOn: string, today: string) {
  const d = daysBetween(today, dueOn);
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} late`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return formatShortDate(dueOn);
}

export default function Dashboard() {
  const s = useStore();
  const router = useRouter();
  const now = useNow(30_000);
  const today = useToday();
  const streak = selectStreak(s, today);
  const activeToday = s.activeDays.includes(today);
  const next = nextStep(s.tasks, today);
  const due = dueItems(s.tasks, s.goals, today).slice(0, 3);
  const stepsTask = next?.task;
  const buddiesActive = s.buddies.filter((b) => b.status === "active" && (b.today === "active" || b.focusingNow));
  const saveDay = streak.saveDay && !activeToday;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            {greeting(now, s.profile.timezone)}, {s.profile.name || "there"}
          </h1>
          <p className="mt-1 text-lg text-muted">
            {saveDay ? "Yesterday didn’t happen. That’s okay. Today still counts." : activeToday ? "Today already counts. Anything else is a bonus." : "Let’s get something done."}
          </p>
        </div>
        <Mascot mood={saveDay ? "determined" : activeToday ? "happy" : "waving"} size={76} className="hidden shrink-0 sm:block" />
      </div>

      {saveDay && (
        <Panel tone="save" className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold">😌 You missed yesterday. Your {streak.current}-day streak is safe.</p>
            <p className="text-[15px]">Today’s a save day. One focus block or one ticked step keeps it going.</p>
          </div>
          {stepsTask && (
            <ButtonLink href={`/room/solo?task=${stepsTask.id}`} variant="secondary" className="shrink-0">
              Do 25 minutes now
            </ButtonLink>
          )}
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Next up: the one obvious action */}
        <Panel className="p-5 md:p-6">
          <p className="text-sm font-semibold text-muted">Next up</p>
          {next ? (
            <>
              <p className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{next.subtaskTitle ?? next.task.title}</p>
              {next.subtaskTitle && <p className="mt-1 text-muted">Part of {next.task.title}</p>}
              <div className="mt-4 flex items-center gap-3">
                <Progress value={taskProgress(next.task)} className="max-w-xs" />
                <span className="text-sm font-semibold tabular-nums">{Math.round(taskProgress(next.task) * 100)}%</span>
                {next.task.dueOn && <span className="text-sm text-muted">Due {dueLabel(next.task.dueOn, today).toLowerCase()}</span>}
              </div>
              <ButtonLink href={`/focus?task=${next.task.id}`} size="xl" className="mt-6 w-full sm:w-auto">
                🚀 Start focusing
              </ButtonLink>
            </>
          ) : (
            <div className="mt-2 flex items-center gap-4">
              <Mascot mood="looking" size={72} />
              <div>
                <p className="text-xl font-semibold">Nothing here yet. 👀</p>
                <p className="text-muted">What do you want to get done?</p>
                <ButtonLink href="/tasks?new=1" className="mt-3">
                  + Add a goal
                </ButtonLink>
              </div>
            </div>
          )}
        </Panel>

        {/* Due soon */}
        <Box className="p-5">
          <SectionTitle action={<Link href="/tasks" className="text-sm font-semibold text-sky underline underline-offset-4">All tasks</Link>}>Due soon</SectionTitle>
          {due.length === 0 ? (
            <p className="text-muted">No deadlines yet. Add one to a goal and we’ll spread it into steps.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {due.map(({ task, state }) => (
                <li key={task.id} className="flex items-center justify-between gap-3 py-3">
                  <Link href={`/tasks/${task.goalId}`} className="min-w-0">
                    <p className="truncate font-semibold">{task.title}</p>
                    <p className="text-sm text-muted">{dueLabel(task.dueOn!, today)}{task.committed ? " · shared with buddies" : ""}</p>
                  </Link>
                  <DeadlineBadge state={state} />
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>

      <FocusHourBanner />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Box className="p-5">
          <SectionTitle>Today’s steps</SectionTitle>
          {stepsTask && stepsTask.subtasks.length > 0 ? (
            <ul className="space-y-2.5">
              {stepsTask.subtasks.map((st) => (
                <li key={st.id} className="flex items-center gap-3">
                  <Checkbox checked={st.done} onChange={() => s.toggleSubtask(stepsTask.id, st.id)} label={st.title} />
                  <span className={st.done ? "text-muted line-through" : ""}>{st.title}</span>
                </li>
              ))}
            </ul>
          ) : stepsTask ? (
            <div>
              <p className="text-muted">“{stepsTask.title}” has no small steps yet.</p>
              <button onClick={() => router.push(`/tasks/${stepsTask.goalId}?breakdown=${stepsTask.id}`)} className="mt-2 font-semibold text-sky underline underline-offset-4">
                🧩 Break it into steps
              </button>
            </div>
          ) : (
            <p className="text-muted">Add a goal to see today’s steps here.</p>
          )}
        </Box>

        <Box className="p-5">
          <SectionTitle action={<Link href="/progress" className="text-sm font-semibold text-sky underline underline-offset-4">Progress</Link>}>
            {streak.current > 0 ? `🔥 ${streak.current}-day streak` : "Start your streak today"}
          </SectionTitle>
          {streak.current === 0 && <p className="-mt-1 mb-3 text-sm text-muted">One focus block or one ticked step counts.</p>}
          <StreakChain outcomes={streak.outcomes} today={today} todayActive={activeToday} />
          <p className="mt-3 text-sm text-muted">
            Consistency {Math.round(streak.consistency * 100)}% · best {streak.longest} days
          </p>
          {buddiesActive.length > 0 && (
            <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-4">
              <div className="flex -space-x-2">
                {buddiesActive.map((b) => (
                  <Avatar key={b.id} name={b.name} hue={b.hue} size={30} />
                ))}
              </div>
              <p className="text-sm">
                {buddiesActive.map((b) => b.name).join(" and ")} {buddiesActive.length === 1 ? "is" : "are"} active today
              </p>
            </div>
          )}
        </Box>
      </div>
    </div>
  );
}
