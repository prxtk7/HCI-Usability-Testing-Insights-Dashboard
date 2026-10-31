// Builds the CSV files offered on the Export & data page. Pure functions, so the
// exact file contents can be unit tested without a browser.
//
// - Missing values become empty cells, never 0.
// - Only anonymised participant IDs and codes are exported, not participant profiles.
// - A recommendation is exported with the issue it belongs to (see types.ts).

import type { Study, StudyData } from '../types';
import { rankIssues, SEVERITY_LABELS } from './priority';
import { ISSUE_STATUSES } from './issueEditing';

export type CsvCell = string | number | null;

/**
 * Spreadsheets run text starting with these characters as a formula. Text cells
 * get a leading apostrophe so an imported note can never execute as one.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCsvCell(cell: CsvCell): string {
  if (cell === null) return '';
  if (typeof cell === 'number') return String(cell);
  const safe = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Standard CSV (RFC 4180): comma separated, with CRLF between rows. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

/** A byte-order mark tells Excel the file is UTF-8, so characters like “ ” display correctly. */
const UTF8_BOM = '\uFEFF';

export function exportFilename(study: Study, kind: string, extension: string, now: Date = new Date()): string {
  const slug = study.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  const fictional = study.isSample ? '-fictional-sample' : '';
  return `${slug || 'study'}${fictional}-${kind}-${now.toISOString().slice(0, 10)}.${extension}`;
}

export type ExportResult = { ok: true; filename: string; text: string } | { ok: false; message: string };

export const ATTEMPT_HEADERS = [
  'attempt_id',
  'participant_id',
  'participant_code',
  'task_id',
  'task_code',
  'task_name',
  'outcome',
  'time_seconds',
  'error_count',
  'observation',
  'participant_feedback',
];

export function attemptsCsv(data: StudyData): string {
  const participants = new Map(data.participants.map((p) => [p.id, p]));
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  return toCsv(
    ATTEMPT_HEADERS,
    data.attempts.map((a) => [
      a.id,
      a.participantId,
      participants.get(a.participantId)?.code ?? null,
      a.taskId,
      tasks.get(a.taskId)?.code ?? null,
      tasks.get(a.taskId)?.name ?? null,
      a.completed ? 'completed' : 'not completed',
      a.timeSeconds,
      a.errorCount,
      a.observation,
      a.feedback,
    ]),
  );
}

export const ISSUE_HEADERS = [
  'issue_id',
  'title',
  'description',
  'severity',
  'severity_label',
  'status',
  'priority_score',
  'priority_level',
  'task_id',
  'task_code',
  'task_name',
  'affected_participant_ids',
  'affected_participant_codes',
  'evidence',
  'recommendation',
];

/** Highest priority first, the same order as the Issues page. */
export function issuesCsv(data: StudyData): string {
  const participants = new Map(data.participants.map((p) => [p.id, p]));
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const statusLabel = new Map(ISSUE_STATUSES.map((s) => [s.value, s.label]));
  return toCsv(
    ISSUE_HEADERS,
    rankIssues(data.issues, data.participants, data.attempts).map(({ issue, priority }) => {
      const task = issue.taskId ? tasks.get(issue.taskId) : undefined;
      return [
        issue.id,
        issue.title,
        issue.description,
        issue.severity,
        SEVERITY_LABELS[issue.severity],
        statusLabel.get(issue.status) ?? issue.status,
        priority.score === null ? null : priority.score.toFixed(2),
        priority.level === 'unknown' ? 'not enough data' : priority.level,
        issue.taskId,
        task?.code ?? null,
        task?.name ?? null,
        issue.affectedParticipantIds.join('; '),
        issue.affectedParticipantIds.map((id) => participants.get(id)?.code ?? id).join('; '),
        issue.evidence,
        issue.recommendation,
      ];
    }),
  );
}

export function exportAttempts(data: StudyData, now: Date = new Date()): ExportResult {
  if (data.attempts.length === 0) {
    return { ok: false, message: 'There are no task attempts to export yet. Record one on the Sessions page first.' };
  }
  return { ok: true, filename: exportFilename(data.study, 'task-attempts', 'csv', now), text: UTF8_BOM + attemptsCsv(data) };
}

export function exportIssues(data: StudyData, now: Date = new Date()): ExportResult {
  if (data.issues.length === 0) {
    return { ok: false, message: 'There are no usability issues to export yet. Add one on the Issues page first.' };
  }
  return { ok: true, filename: exportFilename(data.study, 'usability-issues', 'csv', now), text: UTF8_BOM + issuesCsv(data) };
}
