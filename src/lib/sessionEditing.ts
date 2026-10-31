// Pure editing rules for task attempts (participant sessions) and the
// participants they belong to. Same pattern as studyEditing.ts: functions take
// the current StudyData plus form input and return new data or field errors,
// without ever modifying the original.

import type { Participant, StudyData, TaskAttempt } from '../types';
import { createId, type EditResult, type FieldErrors } from './studyEditing';

/** Select value meaning "create a new participant" instead of picking one. */
export const NEW_PARTICIPANT = '__new__';

/** Sanity limits that catch typos (e.g. an extra zero) without restricting real data. */
export const MAX_SECONDS = 86_400; // 24 hours
export const MAX_ERRORS = 1_000;
export const PARTICIPANT_CODE_MAX = 10;
export const PROFILE_MAX = 80;

export type AttemptField =
  | 'participantId'
  | 'newParticipantCode'
  | 'newParticipantProfile'
  | 'taskId'
  | 'outcome'
  | 'timeSeconds'
  | 'errorCount'
  | 'observation'
  | 'feedback';

/** Raw form values. Numbers stay as text until validated; blank means "not recorded". */
export interface AttemptInput {
  participantId: string;
  newParticipantCode: string;
  newParticipantProfile: string;
  taskId: string;
  outcome: '' | 'completed' | 'not-completed';
  timeSeconds: string;
  errorCount: string;
  observation: string;
  feedback: string;
}

export const EMPTY_ATTEMPT_INPUT: AttemptInput = {
  participantId: '',
  newParticipantCode: '',
  newParticipantProfile: '',
  taskId: '',
  outcome: '',
  timeSeconds: '',
  errorCount: '',
  observation: '',
  feedback: '',
};

export function attemptToInput(attempt: TaskAttempt): AttemptInput {
  return {
    ...EMPTY_ATTEMPT_INPUT,
    participantId: attempt.participantId,
    taskId: attempt.taskId,
    outcome: attempt.completed ? 'completed' : 'not-completed',
    timeSeconds: attempt.timeSeconds === null ? '' : String(attempt.timeSeconds),
    errorCount: attempt.errorCount === null ? '' : String(attempt.errorCount),
    observation: attempt.observation,
    feedback: attempt.feedback,
  };
}

// ---------- Number parsing ----------

type Parsed = { ok: true; value: number | null } | { ok: false; error: string };

/** Blank → null (not recorded). Otherwise a finite number from 0 to MAX_SECONDS. */
export function parseSeconds(text: string): Parsed {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter the time as a number of seconds, or leave it blank.' };
  if (value < 0) return { ok: false, error: 'Time cannot be negative.' };
  if (value > MAX_SECONDS) return { ok: false, error: 'That is more than 24 hours. Check the value is in seconds.' };
  return { ok: true, value };
}

/** Blank → null (not recorded). Otherwise a whole number from 0 to MAX_ERRORS. */
export function parseErrorCount(text: string): Parsed {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter the number of errors, or leave it blank.' };
  if (value < 0) return { ok: false, error: 'Errors cannot be negative.' };
  if (!Number.isInteger(value)) return { ok: false, error: 'Errors must be a whole number.' };
  if (value > MAX_ERRORS) return { ok: false, error: `Enter ${MAX_ERRORS} or fewer errors.` };
  return { ok: true, value };
}

// ---------- Participants ----------

/** Next unused code in the "P01, P02, …" pattern. */
export function suggestParticipantCode(participants: Participant[]): string {
  const numbers = participants
    .map((p) => /^P(\d+)$/i.exec(p.code.trim())?.[1])
    .filter((n) => n !== undefined)
    .map(Number);
  return `P${String(Math.max(0, ...numbers) + 1).padStart(2, '0')}`;
}

export function participantCodeError(code: string, participants: Participant[]): string | undefined {
  if (!code) return 'Enter an anonymised code, such as P09.';
  if (code.length > PARTICIPANT_CODE_MAX) return `Keep the code to ${PARTICIPANT_CODE_MAX} characters or fewer.`;
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return 'Use letters, numbers, hyphens or underscores only (no names or spaces).';
  const existing = participants.find((p) => p.code.trim().toLowerCase() === code.toLowerCase());
  if (existing) return `${existing.code} already exists. Choose it from the participant list instead.`;
  return undefined;
}

// ---------- Validation ----------

/** `editingId` is the attempt being edited, or null when recording a new one. */
export function validateAttempt(
  data: StudyData,
  input: AttemptInput,
  editingId: string | null,
): FieldErrors<AttemptField> {
  const errors: FieldErrors<AttemptField> = {};
  const isNew = input.participantId === NEW_PARTICIPANT;

  if (isNew) {
    const codeError = participantCodeError(input.newParticipantCode.trim(), data.participants);
    if (codeError) errors.newParticipantCode = codeError;
    if (input.newParticipantProfile.trim().length > PROFILE_MAX) {
      errors.newParticipantProfile = `Keep the description under ${PROFILE_MAX} characters.`;
    }
  } else if (!input.participantId) {
    errors.participantId = 'Choose a participant.';
  } else if (!data.participants.some((p) => p.id === input.participantId)) {
    errors.participantId = 'This participant no longer exists. Choose another.';
  }

  if (!input.taskId) errors.taskId = 'Choose a task.';
  else if (!data.tasks.some((t) => t.id === input.taskId)) errors.taskId = 'This task no longer exists. Choose another.';

  if (input.outcome !== 'completed' && input.outcome !== 'not-completed') {
    errors.outcome = 'Choose whether the task was completed.';
  }

  const time = parseSeconds(input.timeSeconds);
  if (!time.ok) errors.timeSeconds = time.error;
  const errorCount = parseErrorCount(input.errorCount);
  if (!errorCount.ok) errors.errorCount = errorCount.error;

  // One attempt per participant per task keeps completion rates honest.
  if (!isNew && !errors.participantId && !errors.taskId) {
    const duplicate = data.attempts.find(
      (a) => a.id !== editingId && a.participantId === input.participantId && a.taskId === input.taskId,
    );
    if (duplicate) {
      const p = data.participants.find((x) => x.id === input.participantId)?.code ?? 'This participant';
      const t = data.tasks.find((x) => x.id === input.taskId)?.code ?? 'this task';
      errors.taskId = `${p} already has an attempt recorded for ${t}. Edit that record instead.`;
    }
  }

  return errors;
}

// ---------- Changes ----------

/** Applies valid input: adds a participant if requested, then builds the attempt fields. */
function applyInput(
  data: StudyData,
  input: AttemptInput,
  makeParticipantId: () => string,
): { participants: Participant[]; fields: Omit<TaskAttempt, 'id'> } {
  let participants = data.participants;
  let participantId = input.participantId;

  if (participantId === NEW_PARTICIPANT) {
    const existing = new Set(participants.map((p) => p.id));
    let id = makeParticipantId();
    while (existing.has(id)) id = makeParticipantId();
    participants = [
      ...participants,
      { id, code: input.newParticipantCode.trim(), profile: input.newParticipantProfile.trim() },
    ];
    participantId = id;
  }

  const time = parseSeconds(input.timeSeconds);
  const errorCount = parseErrorCount(input.errorCount);
  return {
    participants,
    fields: {
      participantId,
      taskId: input.taskId,
      completed: input.outcome === 'completed',
      timeSeconds: time.ok ? time.value : null,
      errorCount: errorCount.ok ? errorCount.value : null,
      observation: input.observation.trim(),
      feedback: input.feedback.trim(),
    },
  };
}

export interface IdMakers {
  attempt?: () => string;
  participant?: () => string;
}

export function addAttempt(data: StudyData, input: AttemptInput, ids: IdMakers = {}): EditResult<AttemptField> {
  const errors = validateAttempt(data, input, null);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const makeAttemptId = ids.attempt ?? (() => createId('attempt'));
  const { participants, fields } = applyInput(data, input, ids.participant ?? (() => createId('participant')));
  const existing = new Set(data.attempts.map((a) => a.id));
  let id = makeAttemptId();
  while (existing.has(id)) id = makeAttemptId();

  return { ok: true, data: { ...data, participants, attempts: [...data.attempts, { id, ...fields }] } };
}

/** Replaces an attempt's fields in place. Its `id` and list position never change. */
export function updateAttempt(
  data: StudyData,
  attemptId: string,
  input: AttemptInput,
  ids: IdMakers = {},
): EditResult<AttemptField> {
  if (!data.attempts.some((a) => a.id === attemptId)) {
    return { ok: false, errors: {}, message: 'This attempt no longer exists.' };
  }
  const errors = validateAttempt(data, input, attemptId);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const { participants, fields } = applyInput(data, input, ids.participant ?? (() => createId('participant')));
  return {
    ok: true,
    data: {
      ...data,
      participants,
      attempts: data.attempts.map((a) => (a.id === attemptId ? { id: a.id, ...fields } : a)),
    },
  };
}

/** Removes one attempt. The participant and all other records are kept. */
export function deleteAttempt(data: StudyData, attemptId: string): EditResult<never> {
  if (!data.attempts.some((a) => a.id === attemptId)) {
    return { ok: false, errors: {}, message: 'This attempt no longer exists.' };
  }
  return { ok: true, data: { ...data, attempts: data.attempts.filter((a) => a.id !== attemptId) } };
}

// ---------- Filtering ----------

export interface AttemptFilters {
  participantId: string; // '' = all
  taskId: string; // '' = all
  outcome: '' | 'completed' | 'not-completed';
}

export const NO_FILTERS: AttemptFilters = { participantId: '', taskId: '', outcome: '' };

export function isFiltered(filters: AttemptFilters): boolean {
  return filters.participantId !== '' || filters.taskId !== '' || filters.outcome !== '';
}

/** Returns the matching attempts (a new array); the input list is never changed. */
export function filterAttempts(attempts: TaskAttempt[], filters: AttemptFilters): TaskAttempt[] {
  return attempts.filter(
    (a) =>
      (filters.participantId === '' || a.participantId === filters.participantId) &&
      (filters.taskId === '' || a.taskId === filters.taskId) &&
      (filters.outcome === '' || a.completed === (filters.outcome === 'completed')),
  );
}
