import { NextResponse, type NextRequest } from "next/server";
import { breakdownSteps, type Category, type Detail, type SuggestedStep } from "@/lib/domain/breakdown";

/**
 * AI task breakdown (PRD §10). Calls Claude with a 5-second budget and falls back to
 * the built-in templates on any problem, so onboarding never stalls. Used before
 * sign-up, so it's open, with a small per-IP limit.
 */

const CATEGORIES: Category[] = ["work", "school", "business", "creative", "personal", "other"];
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
const hits = new Map<string, { n: number; reset: number }>();

function limited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  h.n += 1;
  return h.n > 10; // 10 breakdowns a minute per IP
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { goal?: string; category?: string; detail?: string; deadline?: string; kind?: "goal" | "task" };
  const goal = String(body.goal ?? "").trim().slice(0, 200);
  const category = (CATEGORIES.includes(body.category as Category) ? body.category : "other") as Category;
  const detail = (["less", "medium", "more"].includes(body.detail ?? "") ? body.detail : "medium") as Detail;
  const kind = body.kind === "task" ? "task" : "goal";
  const fallback = () => NextResponse.json({ steps: breakdownSteps(goal, category, detail), source: "template" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!goal || !key) return fallback();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return fallback();

  const count = kind === "goal" ? (detail === "less" ? "3-4" : detail === "more" ? "6-7" : "4-6") : detail === "less" ? "3" : detail === "more" ? "6-8" : "4-5";
  const size = detail === "more" ? "very small (5-25 minutes each)" : detail === "less" ? "substantial chunks" : "moderate";
  const prompt = `Break this ${kind === "goal" ? "goal into tasks" : "task into steps"} for someone who struggles to get started (many users have ADHD).
${kind === "goal" ? "Goal" : "Task"}: "${goal}"
Area: ${category}${body.deadline ? `\nDeadline: ${body.deadline}` : ""}

Rules:
- ${count} items, in the order they should be done, ${size}.
- The first item must be concrete and startable in under 5 minutes.
- Each title is an action starting with a verb, under 60 characters, plain English, no numbering.
- Give a realistic estimate in minutes for each.
Reply with only JSON: {"steps":[{"title":"...","estimatedMinutes":30}]}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) return fallback();
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { steps?: SuggestedStep[] };
    const steps = (json.steps ?? [])
      .filter((s) => typeof s?.title === "string" && s.title.trim())
      .slice(0, 10)
      .map((s) => ({ title: s.title.trim().slice(0, 120), estimatedMinutes: Math.min(600, Math.max(5, Math.round(Number(s.estimatedMinutes) || 30))) }));
    if (steps.length < 2) return fallback();
    return NextResponse.json({ steps, source: "ai" });
  } catch {
    return fallback();
  }
}
