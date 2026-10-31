// Chart data, finding links and record links: all derived from the study's records.

import { describe, expect, it } from 'vitest';
import type { StudyData, Task, TaskAttempt } from '../types';
import { sampleStudyData } from '../data/sampleStudy';
import { summarizeAttempts, summarizeByTask, summarizeOutcomes } from './metrics';
import { addAttempt, attemptToInput, deleteAttempt, updateAttempt } from './sessionEditing';
import { buildFindingEvidence } from './recommendations';
import { parseHash, recordHref } from '../navigation';

const task = (id: string): Task => ({ id, code: id, name: id, description: '', expectedOutcome: '' });

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

const outcomesFor = (data: StudyData) => summarizeOutcomes(summarizeByTask(data.tasks, data.attempts));

describe('summarizeOutcomes', () => {
  it('counts completed and unsuccessful attempts per task', () => {
    const tasks = [task('t1'), task('t2')];
    const attempts = [
      attempt({ taskId: 't1' }),
      attempt({ taskId: 't1' }),
      attempt({ taskId: 't1', completed: false }),
      attempt({ taskId: 't1', completed: false }),
      attempt({ taskId: 't2' }),
    ];
    const [first, second] = summarizeOutcomes(summarizeByTask(tasks, attempts));
    expect(first).toMatchObject({ completed: 2, unsuccessful: 2, attempts: 4, completionRate: 0.5, completedWidth: 50, unsuccessfulWidth: 50 });
    expect(second).toMatchObject({ completed: 1, unsuccessful: 0, attempts: 1, completionRate: 1, completedWidth: 25, unsuccessfulWidth: 0 });
  });

  it('gives a task with no attempts no percentage and no bar', () => {
    const [empty] = summarizeOutcomes(summarizeByTask([task('t1')], []));
    expect(empty).toEqual({ taskId: 't1', attempts: 0, completed: 0, unsuccessful: 0, completionRate: null, completedWidth: 0, unsuccessfulWidth: 0 });
  });

  it('does not treat a missing time or error count as failure', () => {
    const [row] = summarizeOutcomes(
      summarizeByTask([task('t1')], [attempt({ timeSeconds: null, errorCount: null }), attempt({ completed: false })]),
    );
    expect(row).toMatchObject({ completed: 1, unsuccessful: 1 });
  });

  it('adds up to the sample totals and is not hard-coded', () => {
    const rows = outcomesFor(sampleStudyData);
    const overall = summarizeAttempts(sampleStudyData.attempts);
    expect(rows.reduce((n, r) => n + r.completed, 0)).toBe(overall.completed);
    expect(rows.reduce((n, r) => n + r.unsuccessful, 0)).toBe(overall.attempts - overall.completed);
  });
});

describe('missing metrics', () => {
  it('stay null rather than zero', () => {
    const [m] = summarizeByTask([task('t1')], [attempt({ completed: false, timeSeconds: null, errorCount: null })]);
    expect(m).toMatchObject({ averageTimeSeconds: null, errorsPerAttempt: null, completionRate: 0 });
  });
});

describe('metrics stay consistent when attempts change', () => {
  const taskId = sampleStudyData.tasks[0]!.id;
  const taskOutcome = (data: StudyData) => outcomesFor(data).find((o) => o.taskId === taskId)!;
  const overall = (data: StudyData) => summarizeAttempts(data.attempts);

  it('after adding', () => {
    const base: StudyData = { ...sampleStudyData, attempts: sampleStudyData.attempts.filter((a) => !(a.taskId === taskId && a.participantId === sampleStudyData.participants[0]!.id)) };
    const before = taskOutcome(base);
    const result = addAttempt(base, {
      participantId: sampleStudyData.participants[0]!.id,
      newParticipantCode: '',
      newParticipantProfile: '',
      taskId,
      outcome: 'not-completed',
      timeSeconds: '',
      errorCount: '',
      observation: '',
      feedback: '',
    });
    if (!result.ok) throw new Error('expected success');
    expect(taskOutcome(result.data)).toMatchObject({ attempts: before.attempts + 1, unsuccessful: before.unsuccessful + 1, completed: before.completed });
    expect(overall(result.data).attempts).toBe(overall(base).attempts + 1);
  });

  it('after editing an outcome', () => {
    const target = sampleStudyData.attempts.find((a) => a.taskId === taskId && a.completed)!;
    const before = taskOutcome(sampleStudyData);
    const result = updateAttempt(sampleStudyData, target.id, { ...attemptToInput(target), outcome: 'not-completed' });
    if (!result.ok) throw new Error('expected success');
    expect(taskOutcome(result.data)).toMatchObject({ attempts: before.attempts, completed: before.completed - 1, unsuccessful: before.unsuccessful + 1 });
    expect(overall(result.data).completed).toBe(overall(sampleStudyData).completed - 1);
  });

  it('after deleting', () => {
    const target = sampleStudyData.attempts.find((a) => a.taskId === taskId)!;
    const before = taskOutcome(sampleStudyData);
    const result = deleteAttempt(sampleStudyData, target.id);
    if (!result.ok) throw new Error('expected success');
    expect(taskOutcome(result.data).attempts).toBe(before.attempts - 1);
    expect(overall(result.data).attempts).toBe(overall(sampleStudyData).attempts - 1);
  });
});

describe('buildFindingEvidence', () => {
  it('lists exactly the issues each finding cites', () => {
    for (const { finding, supporting, missingIssueIds } of buildFindingEvidence(sampleStudyData)) {
      expect(supporting.map((s) => s.issue.id).sort()).toEqual([...finding.issueIds].sort());
      expect(missingIssueIds).toEqual([]);
    }
  });

  it('discloses a cited issue that does not exist, and invents nothing for an unlinked finding', () => {
    const data: StudyData = {
      ...sampleStudyData,
      findings: [
        { id: 'f1', title: 'A', detail: '', issueIds: ['gone'] },
        { id: 'f2', title: 'B', detail: '', issueIds: [] },
      ],
    };
    const [broken, unlinked] = buildFindingEvidence(data);
    expect(broken).toMatchObject({ supporting: [], missingIssueIds: ['gone'] });
    expect(unlinked).toMatchObject({ supporting: [], missingIssueIds: [] });
  });
});

describe('record links', () => {
  it('round trips a record ID, including awkward characters', () => {
    expect(recordHref('issues', 'issue-1')).toBe('#/issues/issue-1');
    expect(parseHash(recordHref('issues', 'a/b c'))).toEqual({ page: 'issues', recordId: 'a/b c' });
  });

  it('still reads plain page links and survives bad addresses', () => {
    expect(parseHash('#/sessions')).toEqual({ page: 'sessions', recordId: null });
    expect(parseHash('')).toEqual({ page: 'dashboard', recordId: null });
    expect(parseHash('#/nope/x').page).toBe('dashboard');
    expect(parseHash('#/issues/%E0%A4%A')).toEqual({ page: 'issues', recordId: null });
  });
});
