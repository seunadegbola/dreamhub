"use client";

import clsx from "clsx";
import { useStore, selectStreak } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { Box, Panel, SectionTitle } from "@/components/ui";
import { StreakChain, StreakLegend } from "@/components/streak-chain";
import { ACHIEVEMENTS } from "@/lib/domain/xp";
import { addDays, formatDuration, formatShortDate, daysBetween } from "@/lib/domain/time";
import { Mascot } from "@/components/brand";

const TYPE_LABEL = { focus_hour: "Focus Hour", hosted: "Hosted", solo: "Solo" } as const;
const OUTCOME = { good: "✅ Good progress", finished: "🎉 Finished", distracted: "😅 Got distracted", more_time: "🔄 Needed more time" } as const;

export default function Progress() {
  const s = useStore();
  const today = useToday();
  const streak = selectStreak(s, today);
  const totalMin = s.logs.reduce((a, l) => a + l.minutes, 0);
  const weekStart = addDays(today, -6);
  const weekMin = s.logs.filter((l) => l.date >= weekStart).reduce((a, l) => a + l.minutes, 0);
  const blocks = s.logs.reduce((a, l) => a + l.blocks, 0);
  const committedTasks = s.tasks.filter((t) => t.committed && t.dueOn);
  const hit = committedTasks.filter((t) => t.completedAt && t.dueOn && daysBetween(new Date(t.completedAt).toISOString().slice(0, 10), t.dueOn) >= 0).length;
  const missed = committedTasks.filter((t) => !t.completedAt && t.dueOn! < today).length;
  const level = Math.floor(s.xp / 500) + 1;

  const stats = [
    { value: formatDuration(weekMin), label: "focused this week", sub: `${formatDuration(totalMin)} all time` },
    { value: String(blocks), label: "blocks completed", sub: `${s.logs.length} sessions` },
    { value: `${hit}`, label: "deadlines hit", sub: missed ? `${missed} missed` : "none missed" },
    { value: String(s.tasks.filter((t) => t.completedAt).length), label: "tasks done", sub: `${s.goals.filter((g) => g.completedAt).length} goals completed` },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Progress</h1>
        <p className="mt-1 text-lg text-muted">Showing up, counted honestly.</p>
      </div>

      <Panel className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-5xl font-bold tracking-tight">🔥 {streak.current}</p>
            <p className="mt-1 text-lg">
              day streak{streak.saveDay && !s.activeDays.includes(today) ? " · today’s a save day" : ""}
            </p>
            <p className="mt-1 text-muted">
              Best {streak.longest} · {streak.lifetimeActive} days showed up · consistency {Math.round(streak.consistency * 100)}%
            </p>
          </div>
          <Mascot mood={streak.current >= 3 ? "celebrating" : "happy"} size={84} />
        </div>
        <StreakChain outcomes={streak.outcomes} today={today} todayActive={s.activeDays.includes(today)} days={28} className="mt-6 overflow-x-auto pb-1" />
        <div className="mt-4">
          <StreakLegend />
        </div>
        <p className="mt-4 max-w-2xl text-sm text-muted">
          Never miss twice: your streak only resets after two missed days in a row, or three misses in any 7 days. Rest days don’t count either way.
        </p>
      </Panel>

      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((st) => (
          <li key={st.label} className="rounded-[var(--dh-radius)] border-[1.5px] border-hairline bg-surface p-4">
            <p className="text-3xl font-bold tabular-nums tracking-tight">{st.value}</p>
            <p className="font-semibold">{st.label}</p>
            <p className="text-sm text-muted">{st.sub}</p>
          </li>
        ))}
      </ul>

      <section>
        <SectionTitle action={<span className="text-sm font-semibold text-muted">Level {level} · {s.xp.toLocaleString()} XP</span>}>Achievements</SectionTitle>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACHIEVEMENTS.map((a) => {
            const earned = s.achievements.includes(a.key);
            return (
              <li key={a.key} className={clsx("rounded-[var(--dh-radius)] border-2 p-4", earned ? "border-ink bg-surface shadow-brut-sm" : "border-dashed border-ink/30 bg-transparent text-muted")}>
                <p className={clsx("text-3xl", !earned && "opacity-40 grayscale")} aria-hidden>
                  {a.emoji}
                </p>
                <p className="mt-2 font-semibold">{a.name}</p>
                <p className="text-sm">{a.description}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <SectionTitle>Session history</SectionTitle>
        {s.logs.length === 0 ? (
          <p className="text-muted">Your sessions will show up here after your first block.</p>
        ) : (
          <Box className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead className="border-b-2 border-ink/10 text-sm text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Session</th>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Planned</th>
                  <th className="px-4 py-3 font-semibold">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {s.logs.map((l) => (
                  <tr key={l.id} className="border-b border-hairline last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">{l.date === today ? "Today" : l.date === addDays(today, -1) ? "Yesterday" : formatShortDate(l.date)}</td>
                    <td className="px-4 py-3">
                      {TYPE_LABEL[l.type]}
                      {l.type === "hosted" && l.with?.length ? <span className="text-muted"> · with {l.with.join(", ")}</span> : null}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      {formatDuration(l.minutes)} · {l.blocks} {l.blocks === 1 ? "block" : "blocks"}
                    </td>
                    <td className="px-4 py-3">{l.planned ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{OUTCOME[l.outcome]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        )}
      </section>
    </div>
  );
}
