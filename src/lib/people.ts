/**
 * Simulated community for the front-end prototype. In the backend milestone this
 * comes from Supabase presence + LiveKit room participants.
 */
import type { Category } from "./domain/breakdown";

export interface Person {
  id: string;
  name: string;
  hue: number;
  goal: string;
  camera: boolean;
  category: Category;
  buddy?: boolean;
}

export const TABLE_PEOPLE: Person[] = [
  { id: "p1", name: "Priya", hue: 330, goal: "Stats revision: chapters 4–5", camera: true, category: "school", buddy: true },
  { id: "p2", name: "Sam", hue: 160, goal: "Clear the invoice backlog", camera: false, category: "work", buddy: true },
  { id: "p3", name: "Mei", hue: 270, goal: "Slides for Friday's pitch", camera: true, category: "business" },
  { id: "p4", name: "Tom", hue: 20, goal: "Write 800 words of chapter 2", camera: true, category: "creative" },
  { id: "p5", name: "Ruth", hue: 200, goal: "Lab report discussion section", camera: false, category: "school" },
  { id: "p6", name: "Jordan", hue: 45, goal: "Fix checkout bug", camera: true, category: "business" },
];

/** A plausible, stable-ish live count for the banner (changes slowly with time). */
export function liveCount(now: number, phase: "soon" | "live"): number {
  const minute = Math.floor(now / 60_000);
  const wobble = (minute * 7919) % 17;
  return phase === "soon" ? 84 + wobble : 128 + wobble;
}

export const CHECKIN_UPDATES: Record<string, string> = {
  p1: "Chapter 4 done ✅",
  p2: "7 invoices sent",
  p3: "8 slides drafted",
  p4: "520 words",
  p5: "Got distracted, back on it now",
  p6: "Found it! Fixing now",
};
