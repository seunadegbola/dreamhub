"use client";

import { cascadedTaskState, type DeadlineState } from "./domain/cascade";
import type { Goal, Task } from "./types";
import { taskProgress } from "./store";

/** Deadline state for a task, using the previous task in its goal as the start of its pace window. */
export function taskState(task: Task, allTasks: Task[], today: string): DeadlineState {
  const siblings = allTasks
    .filter((t) => t.goalId === task.goalId && t.dueOn && t.id !== task.id && t.dueOn <= (task.dueOn ?? ""))
    .map((t) => t.dueOn!)
    .sort();
  return cascadedTaskState(
    { createdOn: task.createdOn, dueOn: task.dueOn, progress: taskProgress(task), completed: !!task.completedAt },
    siblings.at(-1),
    today,
  );
}

export interface DueItem {
  task: Task;
  goal?: Goal;
  state: DeadlineState;
  progress: number;
}

export function dueItems(tasks: Task[], goals: Goal[], today: string): DueItem[] {
  return tasks
    .filter((t) => t.dueOn && !t.completedAt)
    .map((t) => ({ task: t, goal: goals.find((g) => g.id === t.goalId), progress: taskProgress(t), state: taskState(t, tasks, today) }))
    .sort((a, b) => a.task.dueOn!.localeCompare(b.task.dueOn!));
}

/** The single "next step": earliest-due open task, with its first open subtask. */
export function nextStep(tasks: Task[], today: string): { task: Task; subtaskTitle?: string } | undefined {
  const open = tasks.filter((t) => !t.completedAt).sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const task = open.find((t) => t.dueOn && t.dueOn >= today) ?? open[0];
  if (!task) return undefined;
  return { task, subtaskTitle: task.subtasks.find((s) => !s.done)?.title };
}
