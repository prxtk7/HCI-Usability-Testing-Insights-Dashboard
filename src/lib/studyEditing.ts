// Pure editing rules for study details and tasks.
//
// Each function takes the current StudyData plus form input and returns
// either new StudyData or a set of field errors. The original data is never
// modified, so discarding a form (Cancel) can never change saved data.

import type { Study, StudyData, StudyStatus, Task } from '../types';

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type EditResult<K extends string = string> =
  | { ok: true; data: StudyData }
  | { ok: false; errors: FieldErrors<K>; message?: string };

export const STUDY_STATUSES: { value: StudyStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'complete', label: 'Complete' },
];

export const LIMITS = { title: 150, product: 150, code: 10, taskName: 120 } as const;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // Rejects dates such as 2026-02-30, which JavaScript would roll over.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Collision-resistant ID; falls back when crypto.randomUUID is unavailable (non-HTTPS pages). */
export function createId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

// ---------- Study details ----------

export type StudyField = 'title' | 'product' | 'purpose' | 'method' | 'status' | 'startDate' | 'endDate';
export type StudyDetailsInput = Record<StudyField, string>;

export function studyToInput(study: Study): StudyDetailsInput {
  return {
    title: study.title,
    product: study.product,
    purpose: study.purpose,
    method: study.method,
    status: study.status,
    startDate: study.startDate,
    endDate: study.endDate ?? '',
  };
}

export function validateStudyDetails(input: StudyDetailsInput): FieldErrors<StudyField> {
  const errors: FieldErrors<StudyField> = {};
  const title = input.title.trim();
  const product = input.product.trim();
  const startDate = input.startDate.trim();
  const endDate = input.endDate.trim();

  if (!title) errors.title = 'Enter a study title.';
  else if (title.length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`;
  if (!product) errors.product = 'Enter the product or service being tested.';
  else if (product.length > LIMITS.product) errors.product = `Keep this under ${LIMITS.product} characters.`;
  if (!input.purpose.trim()) errors.purpose = 'Describe what the study is trying to learn.';
  if (!input.method.trim()) errors.method = 'Describe how the study is run.';
  if (!STUDY_STATUSES.some((s) => s.value === input.status)) errors.status = 'Choose a status.';

  if (!startDate) errors.startDate = 'Enter a start date.';
  else if (!isIsoDate(startDate)) errors.startDate = 'Enter a valid date (YYYY-MM-DD).';

  if (endDate && !isIsoDate(endDate)) errors.endDate = 'Enter a valid date (YYYY-MM-DD), or leave it empty.';
  else if (endDate && !errors.startDate && endDate < startDate) errors.endDate = 'The end date cannot be before the start date.';

  return errors;
}

export function updateStudyDetails(data: StudyData, input: StudyDetailsInput): EditResult<StudyField> {
  const errors = validateStudyDetails(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const endDate = input.endDate.trim();
  return {
    ok: true,
    data: {
      ...data,
      study: {
        ...data.study, // keeps id and isSample
        title: input.title.trim(),
        product: input.product.trim(),
        purpose: input.purpose.trim(),
        method: input.method.trim(),
        status: input.status as StudyStatus,
        startDate: input.startDate.trim(),
        endDate: endDate === '' ? null : endDate,
      },
    },
  };
}

// ---------- Tasks ----------

export type TaskField = 'code' | 'name' | 'description' | 'expectedOutcome';
export type TaskInput = Record<TaskField, string>;

export const EMPTY_TASK_INPUT: TaskInput = { code: '', name: '', description: '', expectedOutcome: '' };

export function taskToInput(task: Task): TaskInput {
  return { code: task.code, name: task.name, description: task.description, expectedOutcome: task.expectedOutcome };
}

/** Next unused code in the "T1, T2, …" pattern. */
export function suggestTaskCode(tasks: Task[]): string {
  const numbers = tasks.map((t) => /^T(\d+)$/i.exec(t.code.trim())?.[1]).filter((n) => n !== undefined).map(Number);
  return `T${Math.max(0, ...numbers) + 1}`;
}

/** `editingId` is the task being edited, or null when adding a new one. */
export function validateTask(input: TaskInput, tasks: Task[], editingId: string | null): FieldErrors<TaskField> {
  const errors: FieldErrors<TaskField> = {};
  const code = input.code.trim();
  const name = input.name.trim();

  if (!code) errors.code = 'Enter a short code, such as T6.';
  else if (code.length > LIMITS.code) errors.code = `Keep the code to ${LIMITS.code} characters or fewer.`;
  else if (tasks.some((t) => t.id !== editingId && t.code.trim().toLowerCase() === code.toLowerCase())) {
    errors.code = `Another task already uses the code "${code}".`;
  }

  if (!name) errors.name = 'Enter a task name.';
  else if (name.length > LIMITS.taskName) errors.name = `Keep the name under ${LIMITS.taskName} characters.`;

  if (!input.expectedOutcome.trim()) errors.expectedOutcome = 'Describe what successful completion looks like.';

  return errors;
}

function cleanTask(input: TaskInput): Omit<Task, 'id'> {
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    description: input.description.trim(),
    expectedOutcome: input.expectedOutcome.trim(),
  };
}

export function addTask(
  data: StudyData,
  input: TaskInput,
  makeId: () => string = () => createId('task'),
): EditResult<TaskField> {
  const errors = validateTask(input, data.tasks, null);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const existing = new Set(data.tasks.map((t) => t.id));
  let id = makeId();
  while (existing.has(id)) id = makeId();

  return { ok: true, data: { ...data, tasks: [...data.tasks, { id, ...cleanTask(input) }] } };
}

/** Changes a task's text. Its `id` never changes, so attempts and issues stay linked. */
export function updateTask(data: StudyData, taskId: string, input: TaskInput): EditResult<TaskField> {
  if (!data.tasks.some((t) => t.id === taskId)) {
    return { ok: false, errors: {}, message: 'This task no longer exists.' };
  }
  const errors = validateTask(input, data.tasks, taskId);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: { ...data, tasks: data.tasks.map((t) => (t.id === taskId ? { ...t, ...cleanTask(input) } : t)) },
  };
}

export interface TaskDependencies {
  attempts: number;
  issues: number;
}

/** Records that point at a task. Findings link to issues, not tasks, so they are covered via issues. */
export function taskDependencies(data: StudyData, taskId: string): TaskDependencies {
  return {
    attempts: data.attempts.filter((a) => a.taskId === taskId).length,
    issues: data.issues.filter((i) => i.taskId === taskId).length,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A plain-language reason the task cannot be deleted, or null if it can. */
export function deletionBlocker(data: StudyData, taskId: string): string | null {
  const { attempts, issues } = taskDependencies(data, taskId);
  if (attempts === 0 && issues === 0) return null;
  const parts = [attempts > 0 && plural(attempts, 'session attempt'), issues > 0 && plural(issues, 'usability issue')]
    .filter(Boolean)
    .join(' and ');
  return `It is linked to ${parts}. Deleting it would leave those records without a task, so it is kept.`;
}

export function deleteTask(data: StudyData, taskId: string): EditResult<never> {
  if (!data.tasks.some((t) => t.id === taskId)) {
    return { ok: false, errors: {}, message: 'This task no longer exists.' };
  }
  const blocker = deletionBlocker(data, taskId);
  if (blocker) return { ok: false, errors: {}, message: blocker };
  return { ok: true, data: { ...data, tasks: data.tasks.filter((t) => t.id !== taskId) } };
}
