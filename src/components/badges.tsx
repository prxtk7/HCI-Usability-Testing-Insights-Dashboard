// Status badges. Each always shows a text label, so meaning never relies on colour alone.

import type { IssueStatus, Severity, StudyStatus } from '../types';
import { SEVERITY_LABELS, type PriorityLevel } from '../lib/priority';

const STUDY_STATUS: Record<StudyStatus, { label: string; tone: string }> = {
  planning: { label: 'Planning', tone: 'badge-outline' },
  'in-progress': { label: 'In progress', tone: 'badge-info' },
  analysis: { label: 'Analysis', tone: 'badge-info' },
  complete: { label: 'Complete', tone: 'badge-low' },
};

export function StudyStatusBadge({ status }: { status: StudyStatus }) {
  const { label, tone } = STUDY_STATUS[status];
  return <span className={`badge ${tone}`}>Status: {label}</span>;
}

const PRIORITY: Record<PriorityLevel, { label: string; tone: string }> = {
  high: { label: 'High priority', tone: 'badge-high' },
  medium: { label: 'Medium priority', tone: 'badge-medium' },
  low: { label: 'Low priority', tone: 'badge-low' },
  unknown: { label: 'Not enough data', tone: 'badge-outline' },
};

export function PriorityBadge({ level }: { level: PriorityLevel }) {
  const { label, tone } = PRIORITY[level];
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className="badge badge-outline">
      Severity {severity} · {SEVERITY_LABELS[severity]}
    </span>
  );
}

const ISSUE_STATUS: Record<IssueStatus, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  resolved: 'Resolved',
  'wont-fix': 'Won’t fix',
};

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return <span className="badge">{ISSUE_STATUS[status]}</span>;
}

export function FictionalBadge() {
  return <span className="badge badge-medium">Fictional sample data</span>;
}
