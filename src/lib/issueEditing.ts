// Pure editing rules for usability issues. Same pattern as studyEditing.ts and
// sessionEditing.ts: take the current StudyData plus form input, return new
// data or field errors, never modify the original.
//
// Relationships:
// - An issue may link to one task (`taskId`) or to the whole study (null).
// - `affectedParticipantIds` is the evaluator's explicit record of who hit the issue.
// - Findings cite issues through `issueIds`.
// - A recommendation is the issue's own `recommendation` text (no separate record).

import type { IssueStatus, Severity, StudyData, UsabilityIssue } from '../types';
import { createId, type EditResult, type FieldErrors } from './studyEditing';

export const ISSUE_STATUSES: { value: IssueStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont-fix', label: 'Won’t fix' },
];

export const SEVERITY_OPTIONS: { value: Severity; label: string; hint: string }[] = [
  { value: 1, label: '1 – Cosmetic', hint: 'Noticed but did not slow the participant down' },
  { value: 2, label: '2 – Minor', hint: 'Caused hesitation or a small detour' },
  { value: 3, label: '3 – Major', hint: 'Caused errors or a long delay' },
  { value: 4, label: '4 – Critical', hint: 'Stopped the participant completing the task' },
];

export const ISSUE_LIMITS = { title: 150 } as const;

export type IssueField =
  | 'title'
  | 'description'
  | 'taskId'
  | 'severity'
  | 'status'
  | 'affectedParticipantIds'
  | 'evidence'
  | 'recommendation';

/** Form values. `taskId` is '' for a whole-study issue; `severity` is '' until chosen. */
export interface IssueInput {
  title: string;
  description: string;
  taskId: string;
  severity: string;
  status: string;
  affectedParticipantIds: string[];
  evidence: string;
  recommendation: string;
}

export const EMPTY_ISSUE_INPUT: IssueInput = {
  title: '',
  description: '',
  taskId: '',
  severity: '',
  status: 'open',
  affectedParticipantIds: [],
  evidence: '',
  recommendation: '',
};

export function issueToInput(issue: UsabilityIssue): IssueInput {
  return {
    title: issue.title,
    description: issue.description,
    taskId: issue.taskId ?? '',
    severity: String(issue.severity),
    status: issue.status,
    affectedParticipantIds: [...issue.affectedParticipantIds],
    evidence: issue.evidence,
    recommendation: issue.recommendation,
  };
}

/** Participants with a current attempt at the task (all participants when taskId is ''). */
export function exposedParticipantIds(data: StudyData, taskId: string): Set<string> {
  if (taskId === '') return new Set(data.participants.map((p) => p.id));
  const known = new Set(data.participants.map((p) => p.id));
  return new Set(data.attempts.filter((a) => a.taskId === taskId && known.has(a.participantId)).map((a) => a.participantId));
}

/**
 * Affected participants recorded on the saved issue who no longer have an
 * attempt at its task (e.g. the attempt was deleted). They are kept as the
 * evaluator recorded them, but the priority score does not count them.
 */
export function uncountedParticipantIds(data: StudyData, issue: UsabilityIssue): string[] {
  const exposed = exposedParticipantIds(data, issue.taskId ?? '');
  return [...new Set(issue.affectedParticipantIds)].filter((id) => !exposed.has(id));
}

function codeOf(data: StudyData, participantId: string): string {
  return data.participants.find((p) => p.id === participantId)?.code ?? participantId;
}

/** `editingId` is the issue being edited, or null when creating one. */
export function validateIssue(data: StudyData, input: IssueInput, editingId: string | null): FieldErrors<IssueField> {
  const errors: FieldErrors<IssueField> = {};
  const title = input.title.trim();

  if (!title) errors.title = 'Enter a short title for the issue.';
  else if (title.length > ISSUE_LIMITS.title) errors.title = `Keep the title under ${ISSUE_LIMITS.title} characters.`;
  if (!input.description.trim()) errors.description = 'Describe what the problem is.';

  if (!SEVERITY_OPTIONS.some((s) => String(s.value) === input.severity)) errors.severity = 'Choose a severity from 1 to 4.';
  if (!ISSUE_STATUSES.some((s) => s.value === input.status)) errors.status = 'Choose a status.';

  if (input.taskId !== '' && !data.tasks.some((t) => t.id === input.taskId)) {
    errors.taskId = 'This task no longer exists. Choose another or "Whole study".';
  }

  const ids = input.affectedParticipantIds;
  const known = new Set(data.participants.map((p) => p.id));
  if (new Set(ids).size !== ids.length) {
    errors.affectedParticipantIds = 'A participant is listed more than once.';
  } else if (ids.some((id) => !known.has(id))) {
    errors.affectedParticipantIds = 'One or more selected participants no longer exist.';
  } else if (!errors.taskId) {
    // For a task-linked issue, only people who attempted the task can be added.
    // People already recorded on this issue (for the same task) may stay even if
    // their attempt was later deleted, so the evaluator's record is not lost.
    const saved = editingId ? data.issues.find((i) => i.id === editingId) : undefined;
    const keptFromSaved = new Set(saved && (saved.taskId ?? '') === input.taskId ? saved.affectedParticipantIds : []);
    const exposed = exposedParticipantIds(data, input.taskId);
    const notExposed = ids.filter((id) => !exposed.has(id) && !keptFromSaved.has(id));
    if (notExposed.length > 0) {
      const task = data.tasks.find((t) => t.id === input.taskId)?.code ?? 'the linked task';
      errors.affectedParticipantIds = `${notExposed.map((id) => codeOf(data, id)).join(', ')} did not attempt ${task}. Remove them or link the issue to a different task.`;
    }
  }

  return errors;
}

function cleanIssue(input: IssueInput): Omit<UsabilityIssue, 'id'> {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    taskId: input.taskId === '' ? null : input.taskId,
    evidence: input.evidence.trim(),
    severity: Number(input.severity) as Severity,
    status: input.status as IssueStatus,
    affectedParticipantIds: [...input.affectedParticipantIds],
    recommendation: input.recommendation.trim(),
  };
}

export function addIssue(
  data: StudyData,
  input: IssueInput,
  makeId: () => string = () => createId('issue'),
): EditResult<IssueField> {
  const errors = validateIssue(data, input, null);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const existing = new Set(data.issues.map((i) => i.id));
  let id = makeId();
  while (existing.has(id)) id = makeId();
  return { ok: true, data: { ...data, issues: [...data.issues, { id, ...cleanIssue(input) }] } };
}

/** Replaces an issue's fields in place. Its `id`, list position and findings links never change. */
export function updateIssue(data: StudyData, issueId: string, input: IssueInput): EditResult<IssueField> {
  if (!data.issues.some((i) => i.id === issueId)) {
    return { ok: false, errors: {}, message: 'This issue no longer exists.' };
  }
  const errors = validateIssue(data, input, issueId);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: { ...data, issues: data.issues.map((i) => (i.id === issueId ? { id: i.id, ...cleanIssue(input) } : i)) },
  };
}

// ---------- Deletion ----------

export interface IssueDeletionImpact {
  /** Findings that cite this issue alongside other issues; they lose only this link. */
  detachedFindings: { id: string; title: string }[];
  /** Findings that cite only this issue; deleting it would leave them unsupported. */
  blockingFindings: { id: string; title: string }[];
}

export function issueDeletionImpact(data: StudyData, issueId: string): IssueDeletionImpact {
  const citing = data.findings.filter((f) => f.issueIds.includes(issueId));
  const isOnlySupport = (f: (typeof citing)[number]) => f.issueIds.every((id) => id === issueId);
  return {
    detachedFindings: citing.filter((f) => !isOnlySupport(f)).map(({ id, title }) => ({ id, title })),
    blockingFindings: citing.filter(isOnlySupport).map(({ id, title }) => ({ id, title })),
  };
}

/** A plain-language reason the issue cannot be deleted, or null if it can. */
export function issueDeletionBlocker(data: StudyData, issueId: string): string | null {
  const { blockingFindings } = issueDeletionImpact(data, issueId);
  if (blockingFindings.length === 0) return null;
  const titles = blockingFindings.map((f) => `“${f.title}”`).join(', ');
  const noun = blockingFindings.length === 1 ? 'finding' : 'findings';
  return `It is the only evidence cited by the ${noun} ${titles}. Deleting it would leave that ${noun} unsupported, so it is kept.`;
}

/**
 * Deletes an issue and removes its id from any findings that also cite other
 * issues. Tasks, attempts and participants are never touched.
 */
export function deleteIssue(data: StudyData, issueId: string): EditResult<never> {
  if (!data.issues.some((i) => i.id === issueId)) {
    return { ok: false, errors: {}, message: 'This issue no longer exists.' };
  }
  const blocker = issueDeletionBlocker(data, issueId);
  if (blocker) return { ok: false, errors: {}, message: blocker };

  return {
    ok: true,
    data: {
      ...data,
      issues: data.issues.filter((i) => i.id !== issueId),
      findings: data.findings.map((f) =>
        f.issueIds.includes(issueId) ? { ...f, issueIds: f.issueIds.filter((id) => id !== issueId) } : f,
      ),
    },
  };
}
