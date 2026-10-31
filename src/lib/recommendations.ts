// Builds the Recommendations list. A recommendation is not stored separately:
// it is the `recommendation` text of an issue, so it always shows that issue's
// current title, status and priority.

import type { Finding, StudyData, UsabilityIssue } from '../types';
import { rankIssues, type IssuePriority } from './priority';

export interface RecommendationRow {
  issue: UsabilityIssue;
  priority: IssuePriority;
  /** Titles of findings that cite the issue. */
  findingTitles: string[];
}

export interface FindingEvidence {
  finding: Finding;
  /** Issues the finding cites, highest priority first. Only explicit links, nothing inferred. */
  supporting: { issue: UsabilityIssue; priority: IssuePriority }[];
  /** Cited issue IDs that do not exist, disclosed rather than hidden. */
  missingIssueIds: string[];
}

export function buildFindingEvidence(data: StudyData): FindingEvidence[] {
  const { participants, attempts, issues, findings } = data;
  return findings.map((finding) => ({
    finding,
    supporting: rankIssues(
      issues.filter((i) => finding.issueIds.includes(i.id)),
      participants,
      attempts,
    ),
    missingIssueIds: finding.issueIds.filter((id) => !issues.some((i) => i.id === id)),
  }));
}

/** Issues with recommendation text, highest priority first. */
export function buildRecommendations(data: StudyData): RecommendationRow[] {
  const { participants, attempts, issues, findings } = data;
  return rankIssues(
    issues.filter((i) => i.recommendation.trim() !== ''),
    participants,
    attempts,
  ).map(({ issue, priority }) => ({
    issue,
    priority,
    findingTitles: findings.filter((f) => f.issueIds.includes(issue.id)).map((f) => f.title),
  }));
}
