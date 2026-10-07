/**
 * Task breakdown (PRD §10).
 *
 * Templates used when the AI breakdown (app/api/breakdown) is unavailable, slow (> 5s)
 * or not configured. Pure, so it runs on server and client.
 */

export type Category = "work" | "school" | "business" | "creative" | "personal" | "other";

export const CATEGORIES: { id: Category; label: string; emoji: string }[] = [
  { id: "work", label: "Work", emoji: "💼" },
  { id: "school", label: "School", emoji: "🎓" },
  { id: "business", label: "My business", emoji: "🚀" },
  { id: "creative", label: "Creative projects", emoji: "🎨" },
  { id: "personal", label: "Personal goals", emoji: "🧘" },
  { id: "other", label: "Something else", emoji: "✨" },
];

export type Detail = "less" | "medium" | "more";

export interface SuggestedStep {
  title: string;
  estimatedMinutes: number;
}

interface Template {
  match: RegExp;
  steps: SuggestedStep[];
}

const KEYWORD_TEMPLATES: Template[] = [
  {
    match: /dissertation|thesis|essay|paper|report|assignment|coursework/i,
    steps: [
      { title: "Find remaining sources", estimatedMinutes: 90 },
      { title: "Finish literature review", estimatedMinutes: 300 },
      { title: "Write methodology", estimatedMinutes: 240 },
      { title: "Edit introduction", estimatedMinutes: 120 },
      { title: "Check references", estimatedMinutes: 60 },
    ],
  },
  {
    match: /website|landing page|site|portfolio/i,
    steps: [
      { title: "Collect examples you like", estimatedMinutes: 45 },
      { title: "Write homepage copy", estimatedMinutes: 120 },
      { title: "Gather images and logo", estimatedMinutes: 60 },
      { title: "Build the pages", estimatedMinutes: 300 },
      { title: "Test on phone and launch", estimatedMinutes: 60 },
    ],
  },
  {
    match: /exam|revis|test|study/i,
    steps: [
      { title: "List every topic on the syllabus", estimatedMinutes: 30 },
      { title: "Rate each topic red, amber or green", estimatedMinutes: 30 },
      { title: "Make notes on red topics", estimatedMinutes: 300 },
      { title: "Do two past papers", estimatedMinutes: 240 },
      { title: "Review mistakes from past papers", estimatedMinutes: 90 },
    ],
  },
  {
    match: /presentation|slides|deck|pitch/i,
    steps: [
      { title: "Write the one-sentence message", estimatedMinutes: 20 },
      { title: "Outline the slides", estimatedMinutes: 45 },
      { title: "Draft the slides", estimatedMinutes: 150 },
      { title: "Rehearse out loud twice", estimatedMinutes: 60 },
    ],
  },
  {
    match: /book|novel|chapter|story|write|blog|newsletter/i,
    steps: [
      { title: "Outline what this piece covers", estimatedMinutes: 45 },
      { title: "Write a rough first draft", estimatedMinutes: 300 },
      { title: "Let it rest, then reread", estimatedMinutes: 30 },
      { title: "Revise the draft", estimatedMinutes: 180 },
      { title: "Final proofread", estimatedMinutes: 45 },
    ],
  },
];

const CATEGORY_TEMPLATES: Record<Category, SuggestedStep[]> = {
  work: [
    { title: "Write down what 'done' looks like", estimatedMinutes: 20 },
    { title: "List the pieces of work involved", estimatedMinutes: 30 },
    { title: "Do the first piece", estimatedMinutes: 120 },
    { title: "Do the remaining pieces", estimatedMinutes: 240 },
    { title: "Review and send", estimatedMinutes: 45 },
  ],
  school: [
    { title: "Reread the brief and marking criteria", estimatedMinutes: 30 },
    { title: "Gather notes and sources", estimatedMinutes: 90 },
    { title: "Make a plan", estimatedMinutes: 45 },
    { title: "Write the first draft", estimatedMinutes: 240 },
    { title: "Edit and submit", estimatedMinutes: 90 },
  ],
  business: [
    { title: "Define the outcome and the metric", estimatedMinutes: 30 },
    { title: "List what's blocking it", estimatedMinutes: 30 },
    { title: "Ship the smallest version", estimatedMinutes: 240 },
    { title: "Get feedback from 3 people", estimatedMinutes: 90 },
    { title: "Improve and relaunch", estimatedMinutes: 180 },
  ],
  creative: [
    { title: "Collect references", estimatedMinutes: 45 },
    { title: "Make rough sketches or drafts", estimatedMinutes: 120 },
    { title: "Pick one direction", estimatedMinutes: 20 },
    { title: "Make the full piece", estimatedMinutes: 300 },
    { title: "Finish and share it", estimatedMinutes: 60 },
  ],
  personal: [
    { title: "Decide what success looks like", estimatedMinutes: 20 },
    { title: "Pick the first small step", estimatedMinutes: 15 },
    { title: "Do the first step", estimatedMinutes: 45 },
    { title: "Plan the next week of steps", estimatedMinutes: 30 },
    { title: "Review how it went", estimatedMinutes: 20 },
  ],
  other: [
    { title: "Write down what 'done' looks like", estimatedMinutes: 20 },
    { title: "List everything involved", estimatedMinutes: 30 },
    { title: "Do the first small piece", estimatedMinutes: 60 },
    { title: "Work through the rest", estimatedMinutes: 240 },
    { title: "Wrap up", estimatedMinutes: 30 },
  ],
};

/** Tiny-step decomposition used for "Too big to start?" on a single task. */
export function tinySteps(taskTitle: string): SuggestedStep[] {
  return [
    { title: `Open everything you need for "${taskTitle}"`, estimatedMinutes: 3 },
    { title: "Write one sentence about what you'll do first", estimatedMinutes: 3 },
    { title: "Do that first thing for 10 minutes", estimatedMinutes: 10 },
    { title: "Note where to pick up next time", estimatedMinutes: 2 },
  ];
}

export function breakdownSteps(goal: string, category: Category, detail: Detail = "medium"): SuggestedStep[] {
  const base = KEYWORD_TEMPLATES.find((t) => t.match.test(goal))?.steps ?? CATEGORY_TEMPLATES[category];
  let steps = base.map((s) => ({ ...s }));
  if (detail === "less") steps = steps.slice(0, 3);
  if (detail === "more") {
    // Split each step into a start and a finish, so the first action is always small.
    steps = steps.flatMap((s) => [
      { title: `Start: ${lowerFirst(s.title)}`, estimatedMinutes: Math.max(10, Math.round(s.estimatedMinutes * 0.3)) },
      { title: `Finish: ${lowerFirst(s.title)}`, estimatedMinutes: Math.max(10, Math.round(s.estimatedMinutes * 0.7)) },
    ]);
  }
  return steps;
}


function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
