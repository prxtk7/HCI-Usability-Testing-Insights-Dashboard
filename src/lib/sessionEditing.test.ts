import { describe, expect, it } from 'vitest';
import type { StudyData } from '../types';
import { sampleStudyData } from '../data/sampleStudy';
import { attemptsForKnownTasks, summarizeAttempts, summarizeByTask } from './metrics';
import { calculateIssuePriority } from './priority';
import {
  addAttempt,
  attemptToInput,
  deleteAttempt,
  EMPTY_ATTEMPT_INPUT,
  filterAttempts,
  isFiltered,
  NEW_PARTICIPANT,
  NO_FILTERS,
  parseErrorCount,
  parseSeconds,
  suggestParticipantCode,
  updateAttempt,
  validateAttempt,
  type AttemptInput,
} from './sessionEditing';
import { addTask } from './studyEditing';
import { createStudyStore, freshSample } from './studyStore';
import { memoryStorage } from './testStorage';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** Sample study plus a sixth task with no attempts, so new attempts don't clash with existing ones. */
function studyWithFreeTask(): StudyData {
  const result = addTask(
    freshSample(),
    { code: 'T6', name: 'Find opening hours', description: '', expectedOutcome: 'States the hours.' },
    () => 'task-hours',
  );
  if (!result.ok) throw new Error('setup failed');
  return deepFreeze(result.data);
}

const VALID: AttemptInput = {
  ...EMPTY_ATTEMPT_INPUT,
  participantId: 'p-03',
  taskId: 'task-hours',
  outcome: 'completed',
  timeSeconds: '42',
  errorCount: '1',
  observation: '  Found it in the footer.  ',
  feedback: '',
};

const ids = { attempt: () => 'attempt-new', participant: () => 'participant-new' };

describe('number parsing', () => {
  it('treats blank as not recorded rather than zero', () => {
    expect(parseSeconds('')).toEqual({ ok: true, value: null });
    expect(parseSeconds('   ')).toEqual({ ok: true, value: null });
    expect(parseErrorCount('')).toEqual({ ok: true, value: null });
  });

  it('accepts zero, decimals for time and whole numbers for errors', () => {
    expect(parseSeconds('0')).toEqual({ ok: true, value: 0 });
    expect(parseSeconds('12.5')).toEqual({ ok: true, value: 12.5 });
    expect(parseErrorCount('3')).toEqual({ ok: true, value: 3 });
  });

  it.each(['-1', 'abc', '12s', 'Infinity', 'NaN', '1e400', '90000'])('rejects time %s', (text) => {
    expect(parseSeconds(text).ok).toBe(false);
  });

  it.each(['-1', '1.5', 'two', 'Infinity', '5000'])('rejects error count %s', (text) => {
    expect(parseErrorCount(text).ok).toBe(false);
  });
});

describe('recording attempts', () => {
  it('creates a valid attempt for an existing participant', () => {
    const data = studyWithFreeTask();
    const result = addAttempt(data, VALID, ids);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.attempts).toHaveLength(data.attempts.length + 1);
    expect(result.data.attempts.at(-1)).toEqual({
      id: 'attempt-new',
      participantId: 'p-03',
      taskId: 'task-hours',
      completed: true,
      timeSeconds: 42,
      errorCount: 1,
      observation: 'Found it in the footer.',
      feedback: '',
    });
    // Same participant list: no duplicate participant created.
    expect(result.data.participants).toBe(data.participants);
  });

  it('records an abandoned attempt without inventing a time', () => {
    const result = addAttempt(studyWithFreeTask(), { ...VALID, outcome: 'not-completed', timeSeconds: '', errorCount: '' }, ids);
    expect(result.ok && result.data.attempts.at(-1)).toMatchObject({ completed: false, timeSeconds: null, errorCount: null });
  });

  it('rejects missing participant, task and outcome', () => {
    const errors = validateAttempt(studyWithFreeTask(), EMPTY_ATTEMPT_INPUT, null);
    expect(Object.keys(errors).sort()).toEqual(['outcome', 'participantId', 'taskId']);
  });

  it('rejects references to participants or tasks that do not exist', () => {
    const errors = validateAttempt(studyWithFreeTask(), { ...VALID, participantId: 'p-99', taskId: 'task-gone' }, null);
    expect(errors.participantId).toMatch(/no longer exists/);
    expect(errors.taskId).toMatch(/no longer exists/);
  });

  it('rejects invalid numbers with clear messages and changes nothing', () => {
    const data = studyWithFreeTask();
    const result = addAttempt(data, { ...VALID, timeSeconds: '-5', errorCount: '2.5' }, ids);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.timeSeconds).toBe('Time cannot be negative.');
      expect(result.errors.errorCount).toBe('Errors must be a whole number.');
    }
  });

  it('rejects a second attempt for the same participant and task', () => {
    const errors = validateAttempt(studyWithFreeTask(), { ...VALID, taskId: 'task-book' }, null);
    expect(errors.taskId).toBe('P03 already has an attempt recorded for T2. Edit that record instead.');
  });
});

describe('creating participants', () => {
  const newParticipant: AttemptInput = {
    ...VALID,
    participantId: NEW_PARTICIPANT,
    newParticipantCode: 'P09',
    newParticipantProfile: 'Postgraduate',
  };

  it('suggests the next free code', () => {
    expect(suggestParticipantCode(sampleStudyData.participants)).toBe('P09');
    expect(suggestParticipantCode([])).toBe('P01');
  });

  it('adds one participant and links the new attempt to it', () => {
    const data = studyWithFreeTask();
    const result = addAttempt(data, newParticipant, ids);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.participants).toHaveLength(9);
    expect(result.data.participants.at(-1)).toEqual({ id: 'participant-new', code: 'P09', profile: 'Postgraduate' });
    expect(result.data.attempts.at(-1)?.participantId).toBe('participant-new');
    // The original eight are unchanged.
    expect(result.data.participants.slice(0, 8)).toEqual(sampleStudyData.participants);
  });

  it('refuses a code that already exists, ignoring case', () => {
    const errors = validateAttempt(studyWithFreeTask(), { ...newParticipant, newParticipantCode: 'p03' }, null);
    expect(errors.newParticipantCode).toBe('P03 already exists. Choose it from the participant list instead.');
  });

  it('refuses codes that look like names or contain spaces', () => {
    const errors = validateAttempt(studyWithFreeTask(), { ...newParticipant, newParticipantCode: 'Jane Doe' }, null);
    expect(errors.newParticipantCode).toMatch(/no names or spaces/);
  });

  it('never reuses an existing participant id', () => {
    const generated = ['p-01', 'participant-unique'];
    const result = addAttempt(studyWithFreeTask(), newParticipant, { participant: () => generated.shift()! });
    expect(result.ok && result.data.participants.at(-1)?.id).toBe('participant-unique');
  });

  it('recording a second attempt for the new participant reuses it', () => {
    const first = addAttempt(studyWithFreeTask(), newParticipant, ids);
    if (!first.ok) throw new Error('setup failed');
    const second = addAttempt(first.data, { ...VALID, participantId: 'participant-new', taskId: 'task-book' }, {
      attempt: () => 'attempt-second',
    });
    expect(second.ok && second.data.participants).toHaveLength(9);
    expect(second.ok && second.data.attempts.filter((a) => a.participantId === 'participant-new')).toHaveLength(2);
  });
});

describe('editing attempts', () => {
  const target = 'a-p-02-task-confirm'; // P02 failed T3 in the sample

  it('updates the record in place, keeping its id, position and links', () => {
    const data = studyWithFreeTask();
    const index = data.attempts.findIndex((a) => a.id === target);
    const original = data.attempts[index]!;
    const result = updateAttempt(data, target, { ...attemptToInput(original), outcome: 'completed', timeSeconds: '75' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.attempts).toHaveLength(data.attempts.length);
    expect(result.data.attempts[index]).toEqual({ ...original, completed: true, timeSeconds: 75 });
  });

  it('pre-populates the form from the record, so an unchanged save is identical', () => {
    const data = studyWithFreeTask();
    const original = data.attempts.find((a) => a.id === 'a-p-08-task-find-slot')!; // has a null time
    expect(attemptToInput(original)).toMatchObject({ participantId: 'p-08', taskId: 'task-find-slot', timeSeconds: '' });
    const result = updateAttempt(data, original.id, attemptToInput(original));
    expect(result.ok && result.data.attempts.find((a) => a.id === original.id)).toEqual(original);
  });

  it('allows keeping the same participant and task (not a duplicate of itself)', () => {
    const data = studyWithFreeTask();
    const original = data.attempts.find((a) => a.id === target)!;
    expect(validateAttempt(data, attemptToInput(original), target)).toEqual({});
  });

  it("rejects moving an attempt onto another attempt's participant and task", () => {
    const data = studyWithFreeTask();
    const original = data.attempts.find((a) => a.id === target)!;
    const errors = validateAttempt(data, { ...attemptToInput(original), taskId: 'task-book' }, target);
    expect(errors.taskId).toMatch(/already has an attempt/);
  });

  it('cancelling (never calling update) leaves data untouched; update never mutates the original', () => {
    const data = studyWithFreeTask(); // frozen: any mutation would throw
    const before = structuredClone(data);
    updateAttempt(data, target, { ...VALID, taskId: 'task-hours', outcome: 'completed' });
    expect(data).toEqual(before);
  });

  it('reports a missing attempt', () => {
    expect(updateAttempt(studyWithFreeTask(), 'missing', VALID)).toMatchObject({ ok: false, message: 'This attempt no longer exists.' });
  });
});

describe('deleting attempts', () => {
  it('removes only that attempt, keeps the participant, and metrics recalculate', () => {
    const data = studyWithFreeTask();
    const before = summarizeAttempts(attemptsForKnownTasks(data.tasks, data.attempts));
    expect(before).toMatchObject({ attempts: 40, completed: 32, totalErrors: 45 });

    // P02 failed T1 with 4 errors in 300 s.
    const result = deleteAttempt(data, 'a-p-02-task-find-slot');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.attempts).toHaveLength(39);
    expect(result.data.participants).toBe(data.participants);
    expect(result.data.issues).toBe(data.issues);

    const after = summarizeAttempts(attemptsForKnownTasks(result.data.tasks, result.data.attempts));
    expect(after).toMatchObject({ attempts: 39, completed: 32, totalErrors: 41, uniqueParticipants: 8 });
    expect(after.completionRate).toBeCloseTo(32 / 39);
    // Failed attempts never counted toward average time, so it is unchanged.
    expect(after.averageTimeSeconds).toBe(before.averageTimeSeconds);

    const t1 = summarizeByTask(result.data.tasks, result.data.attempts)[0]!;
    expect(t1).toMatchObject({ attempts: 7, completed: 5 });
  });

  it('cancelling (never calling delete) leaves the record in place', () => {
    const data = studyWithFreeTask();
    expect(data.attempts.some((a) => a.id === 'a-p-02-task-find-slot')).toBe(true);
  });

  it('reports a missing attempt', () => {
    expect(deleteAttempt(studyWithFreeTask(), 'missing').ok).toBe(false);
  });

  it('issue priority uses the updated attempts, with the same formula', () => {
    const data = studyWithFreeTask();
    const issue = data.issues.find((i) => i.id === 'issue-reschedule-cancels-first')!;
    expect(calculateIssuePriority(issue, data.participants, data.attempts).denominator).toBe(8);

    const result = deleteAttempt(data, 'a-p-01-task-reschedule');
    if (!result.ok) throw new Error('expected success');
    const after = calculateIssuePriority(issue, result.data.participants, result.data.attempts);
    expect(after.denominator).toBe(7);
    expect(after.score).toBeCloseTo(3 * (2 / 7));
  });
});

describe('metrics after adding and editing', () => {
  it('recalculate completion, average time and errors from the records', () => {
    const data = studyWithFreeTask();
    const added = addAttempt(data, { ...VALID, timeSeconds: '60', errorCount: '2' }, ids);
    if (!added.ok) throw new Error('expected success');
    const second = addAttempt(
      added.data,
      { ...VALID, participantId: 'p-04', outcome: 'not-completed', timeSeconds: '', errorCount: '3' },
      { attempt: () => 'attempt-second' },
    );
    if (!second.ok) throw new Error('expected success');

    const t6 = summarizeByTask(second.data.tasks, second.data.attempts).find((m) => m.taskId === 'task-hours')!;
    expect(t6).toMatchObject({
      attempts: 2,
      completed: 1,
      completionRate: 0.5,
      averageTimeSeconds: 60,
      timeSampleSize: 1,
      totalErrors: 5,
      missingTime: 1,
      uniqueParticipants: 2,
    });

    // Editing the failed attempt to a success with a time updates the average.
    const edited = updateAttempt(second.data, 'attempt-second', {
      ...attemptToInput(second.data.attempts.at(-1)!),
      outcome: 'completed',
      timeSeconds: '90',
    });
    if (!edited.ok) throw new Error('expected success');
    const t6After = summarizeByTask(edited.data.tasks, edited.data.attempts).find((m) => m.taskId === 'task-hours')!;
    expect(t6After).toMatchObject({ completionRate: 1, averageTimeSeconds: 75, timeSampleSize: 2 });
  });

  it('a task with every attempt deleted shows no rate instead of NaN or 0%', () => {
    const data = studyWithFreeTask();
    const added = addAttempt(data, VALID, ids);
    if (!added.ok) throw new Error('expected success');
    const removed = deleteAttempt(added.data, 'attempt-new');
    if (!removed.ok) throw new Error('expected success');
    const t6 = summarizeByTask(removed.data.tasks, removed.data.attempts).find((m) => m.taskId === 'task-hours')!;
    expect(t6).toMatchObject({ attempts: 0, completionRate: null, averageTimeSeconds: null, errorsPerAttempt: null });
  });
});

describe('filtering', () => {
  const attempts = sampleStudyData.attempts;

  it('returns everything with no filters', () => {
    expect(filterAttempts(attempts, NO_FILTERS)).toHaveLength(40);
    expect(isFiltered(NO_FILTERS)).toBe(false);
  });

  it('filters by participant, task and outcome', () => {
    expect(filterAttempts(attempts, { ...NO_FILTERS, participantId: 'p-02' })).toHaveLength(5);
    expect(filterAttempts(attempts, { ...NO_FILTERS, taskId: 'task-find-slot' })).toHaveLength(8);
    expect(filterAttempts(attempts, { ...NO_FILTERS, outcome: 'completed' })).toHaveLength(32);
    expect(filterAttempts(attempts, { ...NO_FILTERS, outcome: 'not-completed' })).toHaveLength(8);
  });

  it('combines filters', () => {
    const result = filterAttempts(attempts, { participantId: 'p-02', taskId: '', outcome: 'not-completed' });
    expect(result.map((a) => a.taskId)).toEqual(['task-find-slot', 'task-confirm']);
    expect(filterAttempts(attempts, { participantId: 'p-03', taskId: 'task-find-slot', outcome: 'not-completed' })).toEqual([]);
  });

  it('does not modify the attempts list', () => {
    const frozen = deepFreeze(structuredClone(attempts));
    filterAttempts(frozen, { participantId: 'p-01', taskId: 'task-book', outcome: 'completed' });
    expect(frozen).toEqual(attempts);
  });
});

describe('persistence', () => {
  it('recorded, edited and deleted attempts and new participants survive a reload', () => {
    const storage = memoryStorage();
    const store = createStudyStore(storage);
    const current = () => store.getState().data;

    const added = addAttempt(
      current(),
      { ...VALID, participantId: NEW_PARTICIPANT, newParticipantCode: 'P09', taskId: 'task-book' },
      ids,
    );
    if (!added.ok) throw new Error('expected success');
    store.update(() => added.data);

    const original = current().attempts.find((a) => a.id === 'a-p-01-task-book')!;
    const edited = updateAttempt(current(), original.id, { ...attemptToInput(original), errorCount: '4' });
    if (!edited.ok) throw new Error('expected success');
    store.update(() => edited.data);

    const removed = deleteAttempt(current(), 'a-p-05-task-cancel');
    if (!removed.ok) throw new Error('expected success');
    store.update(() => removed.data);

    const reloaded = createStudyStore(storage).getState();
    expect(reloaded.loadProblem).toBeNull();
    expect(reloaded.data.participants.find((p) => p.id === 'participant-new')?.code).toBe('P09');
    expect(reloaded.data.attempts.find((a) => a.id === 'attempt-new')?.participantId).toBe('participant-new');
    expect(reloaded.data.attempts.find((a) => a.id === 'a-p-01-task-book')?.errorCount).toBe(4);
    expect(reloaded.data.attempts.some((a) => a.id === 'a-p-05-task-cancel')).toBe(false);
    expect(reloaded.data.attempts).toHaveLength(40);

    // Restoring the sample brings back the original eight participants and 40 attempts.
    createStudyStore(storage).restoreSample();
    const restored = createStudyStore(storage).getState().data;
    expect(restored.participants).toHaveLength(8);
    expect(restored).toEqual(sampleStudyData);
  });
});
