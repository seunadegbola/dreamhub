/** XP values (PRD §13). Configurable in admin later. */
export const XP = {
  focusBlock: 25,
  fullFocusHour: 50,
  subtask: 5,
  task: 20,
  deadlineHit: 40,
  streakSaved: 30,
  hostedWithOthers: 30,
} as const;

export const DAILY_XP_CAP = 400;

export function capDailyXp(earnedToday: number, amount: number): number {
  return Math.max(0, Math.min(amount, DAILY_XP_CAP - earnedToday));
}

export const ACHIEVEMENTS = [
  { key: "first-session", name: "First Session", description: "Complete your first focus block", emoji: "🏁" },
  { key: "showed-up", name: "Showed Up", description: "Attend your first Focus Hour", emoji: "🪑" },
  { key: "momentum-3", name: "3-Day Momentum", description: "Reach a 3-day streak", emoji: "🔥" },
  { key: "saved-it", name: "Saved It", description: "Save your streak on a save day", emoji: "🛟" },
  { key: "comeback", name: "Comeback", description: "Get active within 48 hours of a broken streak", emoji: "👋" },
  { key: "on-time", name: "On Time", description: "Hit your first committed deadline", emoji: "⏰" },
  { key: "host", name: "Host", description: "Host a session someone else joins", emoji: "🎟️" },
  { key: "ten-hours", name: "10 Hours Focused", description: "Focus for 10 hours in total", emoji: "🏆" },
] as const;

export type AchievementKey = (typeof ACHIEVEMENTS)[number]["key"];
