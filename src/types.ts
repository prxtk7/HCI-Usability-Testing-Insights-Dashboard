// Core data model. Every record has a stable `id` that never changes, so
// links between records (e.g. an attempt pointing at a task) survive edits
// to names, labels or list order.

export type StudyStatus = 'planning' | 'in-progress' | 'analysis' | 'complete';

export interface Study {
  id: string;
  title: string;
  product: string;
  purpose: string;
  method: string;
  status: StudyStatus;
  startDate: string; // ISO date, e.g. "2026-09-14"
  endDate: string | null;
  /** True for the built-in fictional example study. */
  isSample: boolean;
}

export interface Task {
  id: string;
  /** Short human-readable label such as "T1". Editable; `id` is what links records. */
  code: string;
  name: string;
  description: string;
  expectedOutcome: string;
}

export interface Participant {
  id: string;
  /** Anonymised label such as "P01". Never a real name. */
  code: string;
  /** Optional broad descriptor, e.g. "Undergraduate, first year". */
  profile: string;
}

/**
 * One participant attempting one task. A participant usually has several
 * attempts (one per task), so attempts and participants are counted separately.
 */
export interface TaskAttempt {
  id: string;
  participantId: string;
  taskId: string;
  completed: boolean;
  /** Seconds on task. `null` when not recorded (e.g. recording failed). */
  timeSeconds: number | null;
  /** Errors observed during the attempt. `null` when not recorded. */
  errorCount: number | null;
  observation: string;
  feedback: string;
}

/** Evaluator's judgement of impact. A subjective rating, not a measurement. */
export type Severity = 1 | 2 | 3 | 4;

export type IssueStatus = 'open' | 'in-progress' | 'resolved' | 'wont-fix';

export interface UsabilityIssue {
  id: string;
  title: string;
  description: string;
  /** Task where the issue was observed, or `null` if it spans the whole product. */
  taskId: string | null;
  evidence: string;
  severity: Severity;
  status: IssueStatus;
  /** Participants who encountered the issue. Used for the frequency part of priority. */
  affectedParticipantIds: string[];
  recommendation: string;
}

/** A short synthesis statement drawn from one or more issues. */
export interface Finding {
  id: string;
  title: string;
  detail: string;
  issueIds: string[];
}

/** Everything the app stores for one study. */
export interface StudyData {
  study: Study;
  tasks: Task[];
  participants: Participant[];
  attempts: TaskAttempt[];
  issues: UsabilityIssue[];
  findings: Finding[];
}
