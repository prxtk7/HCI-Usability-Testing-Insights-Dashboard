// JSON backup files: creating them and checking one before it may replace the study.
//
// File structure (documented in the README):
//   { "format": "hci-usability-dashboard-backup", "backupVersion": 1,
//     "exportedAt": "2026-10-31T10:00:00.000Z", "data": { ...StudyData } }
//
// `backupVersion` is separate from the localStorage schema version: the file format
// is a promise to the user, and can stay stable if internal storage changes.
//
// A file is either accepted whole or rejected with reasons. Nothing is dropped or
// repaired, because that could quietly change what the study says.

import type { StudyData } from '../types';
import { STUDY_DATA_FIELDS, validateStudyData } from './storage';
import { exportFilename, type ExportResult } from './exportData';
import { studyToInput, taskToInput, validateStudyDetails, validateTask } from './studyEditing';
import { MAX_ERRORS, MAX_SECONDS, participantCodeError } from './sessionEditing';

export const BACKUP_FORMAT = 'hci-usability-dashboard-backup';
export const BACKUP_VERSION = 1;
/** Larger than localStorage can normally hold, so it could not be saved anyway. */
export const MAX_BACKUP_BYTES = 5_000_000;

export function createBackupText(data: StudyData, now: Date = new Date()): string {
  return JSON.stringify(
    { format: BACKUP_FORMAT, backupVersion: BACKUP_VERSION, exportedAt: now.toISOString(), data },
    null,
    2,
  );
}

export function exportBackup(data: StudyData, now: Date = new Date()): ExportResult {
  return { ok: true, filename: exportFilename(data.study, 'backup', 'json', now), text: createBackupText(data, now) };
}

export type BackupResult = { ok: true; data: StudyData; exportedAt: string } | { ok: false; errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Fields this version does not know about would otherwise be saved without anyone noticing. */
function unknownFieldErrors(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const check = (record: unknown, allowed: Record<string, unknown>, label: string) => {
    if (!isRecord(record)) return;
    for (const key of Object.keys(record)) {
      if (!Object.hasOwn(allowed, key)) errors.push(`${label}: unknown field "${key}"`);
    }
  };
  check(data, STUDY_DATA_FIELDS, 'Backup data');
  check(data.study, STUDY_DATA_FIELDS.study, 'study');
  for (const list of ['tasks', 'participants', 'attempts', 'issues', 'findings'] as const) {
    const items = data[list];
    if (Array.isArray(items)) items.forEach((item, i) => check(item, STUDY_DATA_FIELDS[list], `${list}[${i}]`));
  }
  return errors;
}

/** Rules the app's forms enforce, plus every link between records. Assumes the shape is already valid. */
export function validateRelationships(data: StudyData): string[] {
  const errors: string[] = [];
  const { study, tasks, participants, attempts, issues, findings } = data;

  const lists = { tasks, participants, attempts, issues, findings };
  for (const [name, items] of Object.entries(lists)) {
    items.forEach((item, i) => {
      if (item.id.trim() === '') errors.push(`${name}[${i}] has a blank ID`);
    });
  }

  for (const message of Object.values(validateStudyDetails(studyToInput(study)))) {
    errors.push(`Study details: ${message}`);
  }
  for (const task of tasks) {
    for (const message of Object.values(validateTask(taskToInput(task), tasks, task.id))) {
      errors.push(`Task "${task.id}": ${message}`);
    }
  }

  const taskIds = new Set(tasks.map((t) => t.id));
  const participantIds = new Set(participants.map((p) => p.id));
  const issueIds = new Set(issues.map((i) => i.id));

  const codes = new Set<string>();
  for (const p of participants) {
    const problem = participantCodeError(p.code.trim(), []);
    if (problem) errors.push(`Participant "${p.id}": ${problem}`);
    const code = p.code.trim().toLowerCase();
    if (codes.has(code)) errors.push(`Participant code "${p.code}" is used more than once`);
    codes.add(code);
  }

  const pairs = new Set<string>();
  for (const a of attempts) {
    if (!participantIds.has(a.participantId)) {
      errors.push(`Attempt "${a.id}" refers to participant "${a.participantId}", which is not in the backup`);
    }
    if (!taskIds.has(a.taskId)) errors.push(`Attempt "${a.id}" refers to task "${a.taskId}", which is not in the backup`);
    if (a.timeSeconds !== null && a.timeSeconds > MAX_SECONDS) errors.push(`Attempt "${a.id}" has a time over 24 hours`);
    if (a.errorCount !== null && a.errorCount > MAX_ERRORS) errors.push(`Attempt "${a.id}" has more than ${MAX_ERRORS} errors`);

    const pair = JSON.stringify([a.participantId, a.taskId]);
    if (pairs.has(pair)) errors.push(`Attempt "${a.id}" repeats a participant and task that already have an attempt`);
    pairs.add(pair);
  }

  for (const issue of issues) {
    if (issue.title.trim() === '') errors.push(`Issue "${issue.id}" has no title`);
    if (issue.description.trim() === '') errors.push(`Issue "${issue.id}" has no description`);
    if (issue.taskId !== null && !taskIds.has(issue.taskId)) {
      errors.push(`Issue "${issue.id}" refers to task "${issue.taskId}", which is not in the backup`);
    }
    if (new Set(issue.affectedParticipantIds).size !== issue.affectedParticipantIds.length) {
      errors.push(`Issue "${issue.id}" lists a participant more than once`);
    }
    for (const id of issue.affectedParticipantIds) {
      if (!participantIds.has(id)) errors.push(`Issue "${issue.id}" refers to participant "${id}", which is not in the backup`);
    }
  }

  for (const finding of findings) {
    if (finding.title.trim() === '') errors.push(`Finding "${finding.id}" has no title`);
    if (new Set(finding.issueIds).size !== finding.issueIds.length) {
      errors.push(`Finding "${finding.id}" cites an issue more than once`);
    }
    for (const id of finding.issueIds) {
      if (!issueIds.has(id)) errors.push(`Finding "${finding.id}" refers to issue "${id}", which is not in the backup`);
    }
  }

  return errors;
}

/** Checks backup text in full. Never touches the current study or storage. */
export function parseBackup(text: string): BackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, errors: ['This file is not valid JSON, so it cannot be read as a backup.'] };
  }

  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['This file is not a backup from this app (its "format" marker is missing or different).'] };
  }
  if (parsed.backupVersion !== BACKUP_VERSION) {
    return {
      ok: false,
      errors: [`This backup uses format version ${String(parsed.backupVersion)}, but this app can only read version ${BACKUP_VERSION}.`],
    };
  }
  const exportedAt = parsed.exportedAt;
  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
    return { ok: false, errors: ['The backup is missing a valid "exportedAt" date.'] };
  }

  const shape = validateStudyData(parsed.data);
  if (!shape.ok) return { ok: false, errors: shape.errors };

  const errors = [...unknownFieldErrors(parsed.data as Record<string, unknown>), ...validateRelationships(shape.data)];
  return errors.length > 0 ? { ok: false, errors } : { ok: true, data: shape.data, exportedAt };
}

/** Plain-language record counts, shown before the user confirms an import. */
export function describeStudyContents(data: StudyData): string {
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  return [
    count(data.tasks.length, 'task'),
    count(data.participants.length, 'participant'),
    count(data.attempts.length, 'task attempt'),
    count(data.issues.length, 'issue'),
    count(data.findings.length, 'finding'),
  ].join(', ');
}
