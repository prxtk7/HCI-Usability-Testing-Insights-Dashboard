// Reading and writing study data in browser storage.
//
// Saved format (an "envelope" around the data):
//   { "schemaVersion": 1, "savedAt": "2026-10-28T12:00:00.000Z", "data": { ...StudyData } }
//
// The schema version lets a future release recognise data saved in an older
// shape instead of misreading it. Storage is passed in as a parameter
// (`KeyValueStore`) so tests can use a simple in-memory fake.

import type { StudyData } from '../types';
import { isValidCount, isValidSeconds } from './metrics';

export const STORAGE_KEY = 'hci-usability-dashboard:study';
/** Where an unreadable record is copied before it is ever replaced. */
export const BACKUP_KEY = 'hci-usability-dashboard:study-backup';
export const SCHEMA_VERSION = 1;

/** The part of the browser's localStorage API this app uses. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Returns localStorage if it can actually be written to, otherwise null. */
export function getBrowserStorage(): KeyValueStore | null {
  try {
    const storage = window.localStorage;
    const probe = `${STORAGE_KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    // Blocked by privacy settings, disabled, or not running in a browser.
    return null;
  }
}

// ---------- Validation ----------

export type ValidationResult = { ok: true; data: StudyData } | { ok: false; errors: string[] };

type Rec = Record<string, unknown>;

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const oneOf =
  <T extends string | number>(...allowed: T[]) =>
  (v: unknown): v is T =>
    allowed.includes(v as T);

type Check = (v: unknown) => boolean;

/** Checks that each named field passes its check; collects readable error messages. */
function checkFields(value: unknown, label: string, fields: Record<string, Check>, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${label} is not an object`);
    return;
  }
  for (const [field, check] of Object.entries(fields)) {
    if (!check(value[field])) errors.push(`${label}: "${field}" is missing or invalid`);
  }
}

function checkList(value: unknown, label: string, fields: Record<string, Check>, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`"${label}" is not a list`);
    return;
  }
  value.forEach((item, i) => checkFields(item, `${label}[${i}]`, fields, errors));

  // Records are linked by ID, so IDs must be unique within each list.
  const ids = value.filter(isRecord).map((item) => item.id);
  if (new Set(ids).size !== ids.length) errors.push(`"${label}" contains duplicate IDs`);
}

const STUDY_FIELDS: Record<string, Check> = {
  id: isString,
  title: isString,
  product: isString,
  purpose: isString,
  method: isString,
  status: oneOf('planning', 'in-progress', 'analysis', 'complete'),
  startDate: isString,
  endDate: (v) => v === null || isString(v),
  isSample: (v) => typeof v === 'boolean',
};

const TASK_FIELDS: Record<string, Check> = {
  id: isString,
  code: isString,
  name: isString,
  description: isString,
  expectedOutcome: isString,
};

const PARTICIPANT_FIELDS: Record<string, Check> = { id: isString, code: isString, profile: isString };

const ATTEMPT_FIELDS: Record<string, Check> = {
  id: isString,
  participantId: isString,
  taskId: isString,
  completed: (v) => typeof v === 'boolean',
  // Missing values must be stored as null; negative or fractional counts are rejected.
  timeSeconds: (v) => v === null || isValidSeconds(v as number),
  errorCount: (v) => v === null || isValidCount(v as number),
  observation: isString,
  feedback: isString,
};

const ISSUE_FIELDS: Record<string, Check> = {
  id: isString,
  title: isString,
  description: isString,
  taskId: (v) => v === null || isString(v),
  evidence: isString,
  severity: oneOf(1, 2, 3, 4),
  status: oneOf('open', 'in-progress', 'resolved', 'wont-fix'),
  affectedParticipantIds: isStringArray,
  recommendation: isString,
};

const FINDING_FIELDS: Record<string, Check> = {
  id: isString,
  title: isString,
  detail: isString,
  issueIds: isStringArray,
};

/** The fields each part of StudyData is allowed to have. */
export const STUDY_DATA_FIELDS = {
  study: STUDY_FIELDS,
  tasks: TASK_FIELDS,
  participants: PARTICIPANT_FIELDS,
  attempts: ATTEMPT_FIELDS,
  issues: ISSUE_FIELDS,
  findings: FINDING_FIELDS,
};

export function validateStudyData(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['Study data is not an object'] };

  checkFields(value.study, 'study', STUDY_FIELDS, errors);
  checkList(value.tasks, 'tasks', TASK_FIELDS, errors);
  checkList(value.participants, 'participants', PARTICIPANT_FIELDS, errors);
  checkList(value.attempts, 'attempts', ATTEMPT_FIELDS, errors);
  checkList(value.issues, 'issues', ISSUE_FIELDS, errors);
  checkList(value.findings, 'findings', FINDING_FIELDS, errors);

  return errors.length === 0 ? { ok: true, data: value as unknown as StudyData } : { ok: false, errors };
}

// ---------- Loading ----------

export type LoadProblemReason = 'malformed-json' | 'unsupported-version' | 'invalid-data';

export type LoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; data: StudyData; savedAt: string | null }
  | { status: 'invalid'; reason: LoadProblemReason; message: string; raw: string }
  | { status: 'unavailable'; message: string };

export function loadStudy(storage: KeyValueStore | null): LoadResult {
  if (!storage) {
    return { status: 'unavailable', message: 'Browser storage is not available, so changes cannot be saved.' };
  }

  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'unavailable', message: 'The browser blocked reading saved data.' };
  }
  if (raw === null) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid', reason: 'malformed-json', message: 'The saved data is not valid JSON.', raw };
  }

  if (!isRecord(parsed) || parsed.schemaVersion !== SCHEMA_VERSION) {
    const found = isRecord(parsed) && 'schemaVersion' in parsed ? String(parsed.schemaVersion) : 'none';
    return {
      status: 'invalid',
      reason: 'unsupported-version',
      message: `The saved data uses an unsupported format (version ${found}; this app reads version ${SCHEMA_VERSION}).`,
      raw,
    };
  }

  const result = validateStudyData(parsed.data);
  if (!result.ok) {
    const shown = result.errors.slice(0, 3).join('; ');
    const more = result.errors.length > 3 ? ` (and ${result.errors.length - 3} more)` : '';
    return { status: 'invalid', reason: 'invalid-data', message: `The saved data is incomplete: ${shown}${more}.`, raw };
  }

  return { status: 'loaded', data: result.data, savedAt: isString(parsed.savedAt) ? parsed.savedAt : null };
}

// ---------- Saving ----------

export type SaveResult = { ok: true; savedAt: string } | { ok: false; message: string };

export function saveStudy(storage: KeyValueStore | null, data: StudyData, now: Date = new Date()): SaveResult {
  if (!storage) return { ok: false, message: 'Browser storage is not available.' };
  const savedAt = now.toISOString();
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt, data }));
    return { ok: true, savedAt };
  } catch {
    return { ok: false, message: 'The browser refused to save (storage may be full or disabled).' };
  }
}

/** Copies a raw saved record to the backup key. Returns false if that failed. */
export function backupRawRecord(storage: KeyValueStore, raw: string): boolean {
  try {
    storage.setItem(BACKUP_KEY, raw);
    return true;
  } catch {
    return false;
  }
}
