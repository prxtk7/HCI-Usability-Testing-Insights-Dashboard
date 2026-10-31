import { describe, expect, it } from 'vitest';
import type { Task, TaskAttempt } from '../types';
import {
  attemptsForKnownTasks,
  isValidCount,
  isValidSeconds,
  safeRatio,
  summarizeAttempts,
  summarizeByTask,
} from './metrics';

function attempt(overrides: Partial<TaskAttempt>): TaskAttempt {
  return {
    id: crypto.randomUUID(),
    participantId: 'p1',
    taskId: 't1',
    completed: true,
    timeSeconds: 60,
    errorCount: 0,
    observation: '',
    feedback: '',
    ...overrides,
  };
}

const task = (id: string): Task => ({ id, code: id, name: id, description: '', expectedOutcome: '' });

describe('summarizeAttempts', () => {
  it('calculates completion rate from mixed successful and unsuccessful attempts', () => {
    const result = summarizeAttempts([
      attempt({ completed: true }),
      attempt({ completed: true }),
      attempt({ completed: true }),
      attempt({ completed: false }),
    ]);
    expect(result.completed).toBe(3);
    expect(result.attempts).toBe(4);
    expect(result.completionRate).toBe(0.75);
  });

  it('averages time over successful attempts only', () => {
    const result = summarizeAttempts([
      attempt({ completed: true, timeSeconds: 40 }),
      attempt({ completed: true, timeSeconds: 80 }),
      attempt({ completed: false, timeSeconds: 300 }),
    ]);
    expect(result.averageTimeSeconds).toBe(60);
    expect(result.timeSampleSize).toBe(2);
  });

  it('adds up errors and divides by attempts with a valid count', () => {
    const result = summarizeAttempts([
      attempt({ errorCount: 2 }),
      attempt({ errorCount: 3 }),
      attempt({ errorCount: 0 }),
      attempt({ errorCount: null }),
    ]);
    expect(result.totalErrors).toBe(5);
    expect(result.errorsPerAttempt).toBeCloseTo(5 / 3);
    expect(result.missingErrors).toBe(1);
  });

  it('returns nulls, not NaN, for an empty dataset', () => {
    const result = summarizeAttempts([]);
    expect(result).toEqual({
      attempts: 0,
      uniqueParticipants: 0,
      completed: 0,
      completionRate: null,
      averageTimeSeconds: null,
      timeSampleSize: 0,
      totalErrors: 0,
      errorsPerAttempt: null,
      missingTime: 0,
      missingErrors: 0,
    });
  });

  it('ignores missing and invalid numbers instead of letting them skew results', () => {
    const result = summarizeAttempts([
      attempt({ timeSeconds: 50, errorCount: 1 }),
      attempt({ timeSeconds: null, errorCount: null }),
      attempt({ timeSeconds: -10, errorCount: -2 }),
      attempt({ timeSeconds: Number.NaN, errorCount: 1.5 }),
      attempt({ timeSeconds: Number.POSITIVE_INFINITY, errorCount: Number.NaN }),
    ]);
    expect(result.averageTimeSeconds).toBe(50);
    expect(result.timeSampleSize).toBe(1);
    expect(result.totalErrors).toBe(1);
    expect(result.errorsPerAttempt).toBe(1);
    expect(result.missingTime).toBe(4);
    expect(result.missingErrors).toBe(4);
  });

  it('gives a null average time when every attempt failed', () => {
    const result = summarizeAttempts([attempt({ completed: false }), attempt({ completed: false })]);
    expect(result.completionRate).toBe(0);
    expect(result.averageTimeSeconds).toBeNull();
  });

  it('counts unique participants separately from attempts', () => {
    const result = summarizeAttempts([
      attempt({ participantId: 'p1', taskId: 't1' }),
      attempt({ participantId: 'p1', taskId: 't2' }),
      attempt({ participantId: 'p2', taskId: 't1' }),
    ]);
    expect(result.attempts).toBe(3);
    expect(result.uniqueParticipants).toBe(2);
  });
});

describe('summarizeByTask', () => {
  it('returns one summary per task, including tasks with no attempts', () => {
    const result = summarizeByTask(
      [task('t1'), task('t2')],
      [attempt({ taskId: 't1', completed: true }), attempt({ taskId: 't1', completed: false })],
    );
    expect(result.map((r) => r.taskId)).toEqual(['t1', 't2']);
    expect(result[0]?.completionRate).toBe(0.5);
    expect(result[1]?.attempts).toBe(0);
    expect(result[1]?.completionRate).toBeNull();
  });
});

describe('attemptsForKnownTasks', () => {
  it('drops attempts whose task no longer exists', () => {
    const kept = attemptsForKnownTasks([task('t1')], [attempt({ taskId: 't1' }), attempt({ taskId: 'gone' })]);
    expect(kept).toHaveLength(1);
  });
});

describe('validators', () => {
  it('accept zero and positive values, reject the rest', () => {
    expect(isValidSeconds(0)).toBe(true);
    expect(isValidSeconds(12.5)).toBe(true);
    expect(isValidSeconds(-1)).toBe(false);
    expect(isValidSeconds(null)).toBe(false);
    expect(isValidSeconds(Number.NaN)).toBe(false);
    expect(isValidCount(3)).toBe(true);
    expect(isValidCount(1.5)).toBe(false);
    expect(isValidCount(-1)).toBe(false);
  });

  it('safeRatio never returns NaN or Infinity', () => {
    expect(safeRatio(1, 0)).toBeNull();
    expect(safeRatio(0, 0)).toBeNull();
    expect(safeRatio(Number.NaN, 2)).toBeNull();
    expect(safeRatio(1, 4)).toBe(0.25);
  });
});
