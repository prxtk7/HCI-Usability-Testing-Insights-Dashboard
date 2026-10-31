// Pure metric calculations. No React here, so every function can be unit tested.
//
// Definitions (the "denominator" is what we divide by):
//
// - Task attempt: one participant trying one task once.
// - Completion rate = completed attempts / all attempts.
//     Every attempt has a yes/no outcome, so every attempt counts.
// - Average time on task = mean seconds of *successful* attempts with a valid time.
//     Failed attempts are excluded because they usually stop when the participant
//     gives up or hits a time limit, which would distort the average.
// - Total errors = sum of error counts across attempts with a valid count.
// - Errors per attempt = total errors / attempts with a valid error count.
//
// Missing or invalid values (null, negative, NaN, Infinity) are left out of the
// relevant denominator and counted separately so the UI can disclose them.
// Any ratio with a denominator of 0 returns `null`, which the UI shows as "—".

import type { Task, TaskAttempt } from '../types';

/** A usable time: a finite number of seconds, zero or more. */
export function isValidSeconds(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** A usable error count: a whole number, zero or more. */
export function isValidCount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Divide safely: returns null instead of NaN or Infinity. */
export function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return numerator / denominator;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface AttemptSummary {
  attempts: number;
  uniqueParticipants: number;
  completed: number;
  /** 0–1, or null when there are no attempts. */
  completionRate: number | null;
  /** Mean seconds of successful attempts with a valid time, or null. */
  averageTimeSeconds: number | null;
  /** How many successful attempts the average time is based on. */
  timeSampleSize: number;
  totalErrors: number;
  /** Errors divided by attempts that have a valid error count, or null. */
  errorsPerAttempt: number | null;
  /** Attempts whose time was missing or invalid. */
  missingTime: number;
  /** Attempts whose error count was missing or invalid. */
  missingErrors: number;
}

export function summarizeAttempts(attempts: TaskAttempt[]): AttemptSummary {
  const completed = attempts.filter((a) => a.completed);
  const successfulTimes = completed.map((a) => a.timeSeconds).filter(isValidSeconds);
  const errorCounts = attempts.map((a) => a.errorCount).filter(isValidCount);
  const totalErrors = errorCounts.reduce((sum, n) => sum + n, 0);

  return {
    attempts: attempts.length,
    uniqueParticipants: new Set(attempts.map((a) => a.participantId)).size,
    completed: completed.length,
    completionRate: safeRatio(completed.length, attempts.length),
    averageTimeSeconds: mean(successfulTimes),
    timeSampleSize: successfulTimes.length,
    totalErrors,
    errorsPerAttempt: safeRatio(totalErrors, errorCounts.length),
    missingTime: attempts.filter((a) => !isValidSeconds(a.timeSeconds)).length,
    missingErrors: attempts.length - errorCounts.length,
  };
}

export interface TaskMetrics extends AttemptSummary {
  taskId: string;
}

/** One summary per task, in the same order as `tasks`. */
export function summarizeByTask(tasks: Task[], attempts: TaskAttempt[]): TaskMetrics[] {
  return tasks.map((task) => ({
    taskId: task.id,
    ...summarizeAttempts(attempts.filter((a) => a.taskId === task.id)),
  }));
}

export interface TaskOutcome {
  taskId: string;
  attempts: number;
  completed: number;
  unsuccessful: number;
  /** 0–1, or null when the task has no attempts. */
  completionRate: number | null;
  /** Bar lengths as a percentage of the task with the most attempts, so length means count. */
  completedWidth: number;
  unsuccessfulWidth: number;
}

/**
 * Completed versus unsuccessful attempts per task. Uses only the recorded outcome:
 * a missing time or error count never turns an attempt into a failure.
 */
export function summarizeOutcomes(metrics: TaskMetrics[]): TaskOutcome[] {
  const largest = Math.max(0, ...metrics.map((m) => m.attempts));
  const width = (count: number) => (safeRatio(count, largest) ?? 0) * 100;
  return metrics.map((m) => {
    const unsuccessful = m.attempts - m.completed;
    return {
      taskId: m.taskId,
      attempts: m.attempts,
      completed: m.completed,
      unsuccessful,
      completionRate: m.completionRate,
      completedWidth: width(m.completed),
      unsuccessfulWidth: width(unsuccessful),
    };
  });
}

/**
 * Attempts that point at a task which still exists. Attempts for a deleted
 * task are left out of study-wide metrics rather than silently miscounted.
 */
export function attemptsForKnownTasks(tasks: Task[], attempts: TaskAttempt[]): TaskAttempt[] {
  const taskIds = new Set(tasks.map((t) => t.id));
  return attempts.filter((a) => taskIds.has(a.taskId));
}
