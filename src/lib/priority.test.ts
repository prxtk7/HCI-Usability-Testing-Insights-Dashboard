import { describe, expect, it } from 'vitest';
import type { Participant, TaskAttempt, UsabilityIssue } from '../types';
import { calculateIssuePriority, levelForScore, rankIssues } from './priority';

const participants: Participant[] = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, code: id, profile: '' }));

// p1–p4 all attempted t1; only p1 and p2 attempted t2.
const attempts: TaskAttempt[] = [
  ...['p1', 'p2', 'p3', 'p4'].map((p) => ({ p, t: 't1' })),
  ...['p1', 'p2'].map((p) => ({ p, t: 't2' })),
].map(({ p, t }) => ({
  id: `${p}-${t}`,
  participantId: p,
  taskId: t,
  completed: true,
  timeSeconds: 10,
  errorCount: 0,
  observation: '',
  feedback: '',
}));

function issue(overrides: Partial<UsabilityIssue>): UsabilityIssue {
  return {
    id: 'i',
    title: 'Issue',
    description: '',
    taskId: 't1',
    evidence: '',
    severity: 2,
    status: 'open',
    affectedParticipantIds: [],
    recommendation: '',
    ...overrides,
  };
}

describe('calculateIssuePriority', () => {
  it('multiplies severity by the share of exposed participants affected', () => {
    const p = calculateIssuePriority(
      issue({ severity: 3, taskId: 't1', affectedParticipantIds: ['p1', 'p2', 'p3'] }),
      participants,
      attempts,
    );
    expect(p.affected).toBe(3);
    expect(p.denominator).toBe(4);
    expect(p.shareAffected).toBe(0.75);
    expect(p.score).toBeCloseTo(2.25);
    expect(p.level).toBe('high');
  });

  it('uses only participants who attempted the linked task as the denominator', () => {
    const p = calculateIssuePriority(
      issue({ severity: 2, taskId: 't2', affectedParticipantIds: ['p1'] }),
      participants,
      attempts,
    );
    expect(p.denominator).toBe(2);
    expect(p.score).toBe(1);
    expect(p.level).toBe('medium');
  });

  it('uses all participants when the issue is not linked to a task', () => {
    const p = calculateIssuePriority(issue({ taskId: null, affectedParticipantIds: ['p1'] }), participants, attempts);
    expect(p.denominator).toBe(4);
    expect(p.shareAffected).toBe(0.25);
  });

  it('ignores duplicate, unknown and unexposed participant IDs', () => {
    const p = calculateIssuePriority(
      issue({ taskId: 't2', affectedParticipantIds: ['p1', 'p1', 'ghost', 'p4'] }),
      participants,
      attempts,
    );
    expect(p.affected).toBe(1);
    expect(p.shareAffected).toBe(0.5);
  });

  it('returns an unknown level instead of NaN when nobody attempted the task', () => {
    const p = calculateIssuePriority(issue({ taskId: 'none', affectedParticipantIds: ['p1'] }), participants, attempts);
    expect(p.denominator).toBe(0);
    expect(p.shareAffected).toBeNull();
    expect(p.score).toBeNull();
    expect(p.level).toBe('unknown');
  });
});

describe('levelForScore', () => {
  it('applies the documented thresholds', () => {
    expect(levelForScore(2, 2)).toBe('high');
    expect(levelForScore(1.99, 3)).toBe('medium');
    expect(levelForScore(1, 2)).toBe('medium');
    expect(levelForScore(0.99, 2)).toBe('low');
    expect(levelForScore(null, 4)).toBe('unknown');
  });

  it('never ranks a critical issue below medium', () => {
    expect(levelForScore(0.25, 4)).toBe('medium');
  });
});

describe('rankIssues', () => {
  it('sorts by score, then severity, and puts unknown scores last', () => {
    const ranked = rankIssues(
      [
        issue({ id: 'unknown', taskId: 'none', severity: 4, affectedParticipantIds: ['p1'] }),
        issue({ id: 'low', severity: 1, affectedParticipantIds: ['p1'] }),
        issue({ id: 'top', severity: 4, affectedParticipantIds: ['p1', 'p2', 'p3', 'p4'] }),
        issue({ id: 'tie-sev2', severity: 2, affectedParticipantIds: ['p1', 'p2'] }),
        issue({ id: 'tie-sev4', severity: 4, affectedParticipantIds: ['p1'] }),
      ],
      participants,
      attempts,
    );
    expect(ranked.map((r) => r.issue.id)).toEqual(['top', 'tie-sev4', 'tie-sev2', 'low', 'unknown']);
  });

  it('handles an empty list', () => {
    expect(rankIssues([], participants, attempts)).toEqual([]);
  });
});
