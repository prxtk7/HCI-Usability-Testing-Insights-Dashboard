import { describe, expect, it } from 'vitest';
import type { StudyData } from '../types';
import { sampleStudyData } from '../data/sampleStudy';
import { attemptsForKnownTasks, summarizeByTask } from './metrics';
import { rankIssues } from './priority';
import {
  addTask,
  deleteTask,
  deletionBlocker,
  isIsoDate,
  studyToInput,
  suggestTaskCode,
  taskDependencies,
  taskToInput,
  updateStudyDetails,
  updateTask,
  validateStudyDetails,
  validateTask,
  type TaskInput,
} from './studyEditing';
import { createStudyStore, freshSample } from './studyStore';
import { memoryStorage } from './testStorage';

/** Freezes every nested object, so any accidental mutation throws. */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const frozenSample = (): StudyData => deepFreeze(freshSample());

const NEW_TASK: TaskInput = {
  code: 'T6',
  name: 'Find the advising office opening hours',
  description: 'Locate when the office is open in person.',
  expectedOutcome: 'Participant states the opening hours.',
};

let idCounter = 0;
const testId = () => `task-test-${++idCounter}`;

describe('isIsoDate', () => {
  it('accepts real dates and rejects impossible or badly formatted ones', () => {
    expect(isIsoDate('2026-09-14')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('14/09/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('study details', () => {
  it('updates the study and keeps its id and sample flag', () => {
    const data = frozenSample();
    const result = updateStudyDetails(data, {
      ...studyToInput(data.study),
      title: '  Revised title  ',
      status: 'complete',
      endDate: '',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.study).toMatchObject({
      id: data.study.id,
      isSample: true,
      title: 'Revised title',
      status: 'complete',
      endDate: null,
    });
    // Everything else is untouched.
    expect(result.data.tasks).toBe(data.tasks);
    expect(result.data.attempts).toBe(data.attempts);
  });

  it('requires title, product, purpose, method and start date', () => {
    const errors = validateStudyDetails({
      title: ' ',
      product: '',
      purpose: '',
      method: '',
      status: 'analysis',
      startDate: '',
      endDate: '',
    });
    expect(Object.keys(errors).sort()).toEqual(['method', 'product', 'purpose', 'startDate', 'title']);
  });

  it('rejects invalid dates, an end before the start, and unknown statuses', () => {
    const base = studyToInput(sampleStudyData.study);
    expect(validateStudyDetails({ ...base, startDate: '2026-02-30' }).startDate).toMatch(/valid date/);
    expect(validateStudyDetails({ ...base, endDate: 'soon' }).endDate).toMatch(/valid date/);
    expect(validateStudyDetails({ ...base, startDate: '2026-09-14', endDate: '2026-09-01' }).endDate).toMatch(
      /before the start/,
    );
    expect(validateStudyDetails({ ...base, status: 'archived' }).status).toBeDefined();
  });

  it('returns errors and no data when input is invalid', () => {
    const result = updateStudyDetails(frozenSample(), { ...studyToInput(sampleStudyData.study), title: '' });
    expect(result.ok).toBe(false);
  });
});

describe('adding tasks', () => {
  it('adds a valid task with a new unique id', () => {
    const data = frozenSample();
    const result = addTask(data, NEW_TASK, testId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tasks).toHaveLength(data.tasks.length + 1);
    const added = result.data.tasks.at(-1)!;
    expect(added).toEqual({ id: `task-test-${idCounter}`, ...NEW_TASK });
    expect(data.tasks.some((t) => t.id === added.id)).toBe(false);
  });

  it('never reuses an existing id, even if the generator returns one', () => {
    const ids = ['task-find-slot', 'task-unique'];
    const result = addTask(frozenSample(), NEW_TASK, () => ids.shift()!);
    expect(result.ok && result.data.tasks.at(-1)!.id).toBe('task-unique');
  });

  it('rejects missing required fields', () => {
    const result = addTask(frozenSample(), { code: '', name: ' ', description: '', expectedOutcome: '' }, testId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['code', 'expectedOutcome', 'name']);
  });

  it('rejects a duplicate code regardless of case and spacing', () => {
    const errors = validateTask({ ...NEW_TASK, code: ' t1 ' }, sampleStudyData.tasks, null);
    expect(errors.code).toMatch(/already uses/);
  });

  it('rejects overly long codes', () => {
    expect(validateTask({ ...NEW_TASK, code: 'T-0123456789' }, sampleStudyData.tasks, null).code).toBeDefined();
  });

  it('suggests the next free code', () => {
    expect(suggestTaskCode(sampleStudyData.tasks)).toBe('T6');
    expect(suggestTaskCode([])).toBe('T1');
  });
});

describe('editing tasks', () => {
  it('changes the text but keeps the stable id', () => {
    const data = frozenSample();
    const result = updateTask(data, 'task-find-slot', {
      ...taskToInput(data.tasks[0]!),
      code: 'FIND',
      name: 'Locate an open slot',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const edited = result.data.tasks.find((t) => t.id === 'task-find-slot');
    expect(edited).toMatchObject({ id: 'task-find-slot', code: 'FIND', name: 'Locate an open slot' });
    expect(result.data.tasks.map((t) => t.id)).toEqual(data.tasks.map((t) => t.id));
  });

  it('keeps linked attempts, metrics and issue priority unchanged after renaming', () => {
    const data = frozenSample();
    const result = updateTask(data, 'task-find-slot', { ...taskToInput(data.tasks[0]!), name: 'Renamed' });
    if (!result.ok) throw new Error('expected success');

    expect(result.data.attempts).toBe(data.attempts);
    expect(result.data.attempts.filter((a) => a.taskId === 'task-find-slot')).toHaveLength(8);
    const before = summarizeByTask(data.tasks, attemptsForKnownTasks(data.tasks, data.attempts));
    const after = summarizeByTask(result.data.tasks, attemptsForKnownTasks(result.data.tasks, result.data.attempts));
    expect(after).toEqual(before);
    expect(rankIssues(result.data.issues, result.data.participants, result.data.attempts)).toEqual(
      rankIssues(data.issues, data.participants, data.attempts),
    );
  });

  it('allows a task to keep its own code', () => {
    expect(validateTask(taskToInput(sampleStudyData.tasks[0]!), sampleStudyData.tasks, 'task-find-slot')).toEqual({});
  });

  it("rejects taking another task's code", () => {
    const result = updateTask(frozenSample(), 'task-find-slot', { ...taskToInput(sampleStudyData.tasks[0]!), code: 'T2' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.code).toMatch(/already uses/);
  });

  it('reports a task that no longer exists', () => {
    const result = updateTask(frozenSample(), 'missing', NEW_TASK);
    expect(result).toMatchObject({ ok: false, message: 'This task no longer exists.' });
  });
});

describe('deleting tasks', () => {
  it('counts linked attempts and issues', () => {
    expect(taskDependencies(sampleStudyData, 'task-find-slot')).toEqual({ attempts: 8, issues: 2 });
  });

  it('blocks deleting a task that has linked records and changes nothing', () => {
    const data = frozenSample();
    const result = deleteTask(data, 'task-find-slot');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(deletionBlocker(data, 'task-find-slot'));
    expect(deletionBlocker(data, 'task-find-slot')).toMatch(/8 session attempts and 2 usability issues/);
  });

  it('blocks a task linked only by an issue', () => {
    const data = frozenSample();
    const added = addTask(data, NEW_TASK, () => 'task-new');
    if (!added.ok) throw new Error('expected success');
    const withIssue: StudyData = {
      ...added.data,
      issues: [...added.data.issues, { ...added.data.issues[0]!, id: 'issue-new', taskId: 'task-new' }],
    };
    expect(deletionBlocker(withIssue, 'task-new')).toMatch(/^It is linked to 1 usability issue\./);
  });

  it('deletes an unreferenced task', () => {
    const added = addTask(frozenSample(), NEW_TASK, () => 'task-new');
    if (!added.ok) throw new Error('expected success');
    const result = deleteTask(added.data, 'task-new');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.tasks.map((t) => t.id)).toEqual(sampleStudyData.tasks.map((t) => t.id));
  });
});

describe('cancelling and persistence', () => {
  it('never modifies the original data, so a discarded form changes nothing', () => {
    // frozenSample() throws on any mutation; the original stays equal to the sample.
    const data = frozenSample();
    updateStudyDetails(data, { ...studyToInput(data.study), title: 'Draft' });
    updateTask(data, 'task-book', { ...taskToInput(data.tasks[1]!), name: 'Draft' });
    addTask(data, NEW_TASK, testId);
    expect(data).toEqual(sampleStudyData);
  });

  it('saved study and task edits survive a reload', () => {
    const storage = memoryStorage();
    const store = createStudyStore(storage);
    const current = () => store.getState().data;

    const studyEdit = updateStudyDetails(current(), { ...studyToInput(current().study), title: 'Persisted title' });
    if (!studyEdit.ok) throw new Error('expected success');
    store.update(() => studyEdit.data);

    const taskEdit = updateTask(current(), 'task-confirm', { ...taskToInput(current().tasks[2]!), name: 'Persisted task' });
    if (!taskEdit.ok) throw new Error('expected success');
    store.update(() => taskEdit.data);

    const added = addTask(current(), NEW_TASK, () => 'task-persisted');
    if (!added.ok) throw new Error('expected success');
    store.update(() => added.data);

    const reloaded = createStudyStore(storage).getState();
    expect(reloaded.loadProblem).toBeNull();
    expect(reloaded.data.study.title).toBe('Persisted title');
    expect(reloaded.data.tasks.find((t) => t.id === 'task-confirm')?.name).toBe('Persisted task');
    expect(reloaded.data.tasks.find((t) => t.id === 'task-persisted')?.code).toBe('T6');
    expect(reloaded.data.attempts.filter((a) => a.taskId === 'task-confirm')).toHaveLength(8);
  });
});
