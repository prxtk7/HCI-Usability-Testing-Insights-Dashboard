// Issue prioritisation: a transparent triage heuristic, not a scientific measure.
//
//   Priority score = severity rating (1–4) × share of participants affected (0–1)
//
// - Severity is the evaluator's subjective judgement of impact.
// - Share affected = affected participants / participants who attempted the
//   linked task. Issues not linked to a task use all study participants.
// - The score therefore ranges from 0 to 4.
//
// Levels: High ≥ 2.0, Medium ≥ 1.0, otherwise Low. A severity-4 (critical)
// issue is never ranked below Medium, so a blocker seen by one person is not
// hidden. With no participants to compare against, the level is "Not enough data".

import type { Participant, Severity, TaskAttempt, UsabilityIssue } from '../types';
import { safeRatio } from './metrics';

export type PriorityLevel = 'high' | 'medium' | 'low' | 'unknown';

export const SEVERITY_LABELS: Record<Severity, string> = {
  1: 'Cosmetic',
  2: 'Minor',
  3: 'Major',
  4: 'Critical',
};

export interface IssuePriority {
  issueId: string;
  severity: Severity;
  /** Distinct, existing participants the evaluator recorded as affected. */
  recorded: number;
  /** Of those, how many count toward the score (they attempted the linked task). */
  affected: number;
  /** Participants the share is measured against. */
  denominator: number;
  /** 0–1, or null when the denominator is 0. */
  shareAffected: number | null;
  /** 0–4, or null when the share is unknown. */
  score: number | null;
  level: PriorityLevel;
}

export function levelForScore(score: number | null, severity: Severity): PriorityLevel {
  if (score === null) return 'unknown';
  if (score >= 2) return 'high';
  if (score >= 1 || severity === 4) return 'medium';
  return 'low';
}

export function calculateIssuePriority(
  issue: UsabilityIssue,
  participants: Participant[],
  attempts: TaskAttempt[],
): IssuePriority {
  const known = new Set(participants.map((p) => p.id));

  // Who could have encountered this issue?
  const exposed =
    issue.taskId === null
      ? known
      : new Set(
          attempts
            .filter((a) => a.taskId === issue.taskId && known.has(a.participantId))
            .map((a) => a.participantId),
        );

  // Count each affected participant once, and only if they were exposed.
  // Recorded participants without a current attempt stay on the issue but are not counted.
  const recorded = new Set(issue.affectedParticipantIds.filter((id) => known.has(id))).size;
  const affected = new Set(issue.affectedParticipantIds.filter((id) => exposed.has(id))).size;
  const shareAffected = safeRatio(affected, exposed.size);
  const score = shareAffected === null ? null : issue.severity * shareAffected;

  return {
    issueId: issue.id,
    severity: issue.severity,
    recorded,
    affected,
    denominator: exposed.size,
    shareAffected,
    score,
    level: levelForScore(score, issue.severity),
  };
}

/** Issues sorted by score (highest first), then severity, then title. Unknown scores go last. */
export function rankIssues(
  issues: UsabilityIssue[],
  participants: Participant[],
  attempts: TaskAttempt[],
): { issue: UsabilityIssue; priority: IssuePriority }[] {
  return issues
    .map((issue) => ({ issue, priority: calculateIssuePriority(issue, participants, attempts) }))
    .sort((a, b) => {
      const scoreA = a.priority.score ?? -1;
      const scoreB = b.priority.score ?? -1;
      if (scoreA !== scoreB) return scoreB - scoreA;
      if (a.issue.severity !== b.issue.severity) return b.issue.severity - a.issue.severity;
      return a.issue.title.localeCompare(b.issue.title);
    });
}
