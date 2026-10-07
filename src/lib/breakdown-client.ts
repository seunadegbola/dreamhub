"use client";

import { breakdownSteps, type Category, type Detail, type SuggestedStep } from "./domain/breakdown";

/** Ask the server for an AI breakdown; fall back to templates if anything goes wrong. */
export async function suggestBreakdown(
  goal: string,
  category: Category,
  detail: Detail = "medium",
  opts: { deadline?: string; kind?: "goal" | "task" } = {},
): Promise<SuggestedStep[]> {
  try {
    const res = await fetch("/api/breakdown", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal, category, detail, ...opts }),
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const data = (await res.json()) as { steps?: SuggestedStep[] };
      if (data.steps?.length) return data.steps;
    }
  } catch {
    // offline or slow: use templates
  }
  return breakdownSteps(goal, category, detail);
}
