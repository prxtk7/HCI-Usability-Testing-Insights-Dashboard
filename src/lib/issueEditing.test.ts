import { describe, expect, it } from 'vitest';
import type { StudyData } from '../types';
import { sampleStudyData } from '../data/sampleStudy';
import { calculateIssuePriority } from './priority';
import { buildRecommendations } from './recommendations';
import {
  addIssue,
  deleteIssue,
  EMPTY_ISSUE_INPUT,
  exposedParticipantIds,
  issueDeletionBlocker,
  issueDeletionImpact,
  issueToInput,
  uncountedParticipantIds,
  updateIssue,
  validateIssue,
  type IssueInput,
} from './issueEditing';
import { deleteAttempt } from './sessionEditing';
import { addTask } from './studyEditing';
import { createStudyStore, freshSample } from './studyStore';
import { memoryStorage } from './testStorage';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const frozenSample = (): StudyData => deepFreeze(freshSample());

/** Sample study plus task T6 ("task-hours") that nobody has attempted. */
function withUnattemptedTask(): StudyData {
  const result = addTask(
    freshSample(),
    { code: 'T6', name: 'Find opening hours', description: '', expectedOutcome: 'States the hours.' },
    () => 'task-hours',
  );
  if (!result.ok) throw new Error('setup failed');
  return deepFreeze(result.data);
}

const VALID: IssueInput = {
  title: '  Booking reasons are hard to scan  ',
  description: 'The reason list is long and unsorted.',
  taskId: 'task-book',
  severity: '2',
  status: 'open',
  affectedParticipantIds: ['p-02', 'p-08'],
  evidence: 'Two participants scrolled the list twice.',
  recommendation: 'Group reasons by topic.',
};

const AVAILABILITY = 'issue-availability-hidden'; // T1, cited by a finding together with week-navigation
const WEEK_NAV = 'issue-week-navigation';
const CONFIRMATION = 'issue-confirmation-wording'; // only issue behind "Confirmation wording creates doubt"
const RESCHEDULE = 'issue-reschedule-cancels-first'; // not cited by any finding

describe('creating issues', () => {
  it('adds a valid issue with a new unique id', () => {
    const data = frozenSample();
    const result = addIssue(data, VALID, () => 'issue-new');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.issues).toHaveLength(data.issues.length + 1);
    expect(result.data.issues.at(-1)).toEqual({
      id: 'issue-new',
      title: 'Booking reasons are hard to scan',
      description: 'The reason list is long and unsorted.',
      taskId: 'task-book',
      evidence: 'Two participants scrolled the list twice.',
      severity: 2,
      status: 'open',
      affectedParticipantIds: ['p-02', 'p-08'],
      recommendation: 'Group reasons by topic.',
    });
    // Nothing else changes.
    expect(result.data.attempts).toBe(data.attempts);
    expect(result.data.findings).toBe(data.findings);
  });

  it('stores a whole-study issue with a null task', () => {
    const result = addIssue(frozenSample(), { ...VALID, taskId: '', affectedParticipantIds: ['p-03'] }, () => 'issue-new');
    expect(result.ok && result.data.issues.at(-1)?.taskId).toBeNull();
  });

  it('never reuses an existing id', () => {
    const ids = [AVAILABILITY, 'issue-unique'];
    const result = addIssue(frozenSample(), VALID, () => ids.shift()!);
    expect(result.ok && result.data.issues.at(-1)?.id).toBe('issue-unique');
  });

  it('rejects missing required fields', () => {
    const errors = validateIssue(frozenSample(), { ...EMPTY_ISSUE_INPUT, title: ' ' }, null);
    expect(Object.keys(errors).sort()).toEqual(['description', 'severity', 'title']);
  });

  it.each(['0', '5', '2.5', 'high', ''])('rejects severity %j', (severity) => {
    expect(validateIssue(frozenSample(), { ...VALID, severity }, null).severity).toBeDefined();
  });

  it('rejects an unknown status, a missing task and unknown participants', () => {
    const data = frozenSample();
    expect(validateIssue(data, { ...VALID, status: 'archived' }, null).status).toBeDefined();
    expect(validateIssue(data, { ...VALID, taskId: 'task-gone' }, null).taskId).toMatch(/no longer exists/);
    expect(validateIssue(data, { ...VALID, affectedParticipantIds: ['p-99'] }, null).affectedParticipantIds).toMatch(
      /no longer exist/,
    );
  });

  it('rejects duplicate participants', () => {
    const errors = validateIssue(frozenSample(), { ...VALID, affectedParticipantIds: ['p-02', 'p-02'] }, null);
    expect(errors.affectedParticipantIds).toBe('A participant is listed more than once.');
  });

  it('rejects participants who did not attempt the linked task', () => {
    const data = deleteAttempt(frozenSample(), 'a-p-02-task-book');
    if (!data.ok) throw new Error('setup failed');
    const errors = validateIssue(data.data, VALID, null);
    expect(errors.affectedParticipantIds).toBe(
      'P02 did not attempt T2. Remove them or link the issue to a different task.',
    );
  });

  it('allows any participant on a whole-study issue', () => {
    const data = deleteAttempt(frozenSample(), 'a-p-02-task-book');
    if (!data.ok) throw new Error('setup failed');
    expect(validateIssue(data.data, { ...VALID, taskId: '' }, null)).toEqual({});
  });

  it('handles a linked task with no attempts: no one to select, priority not enough data', () => {
    const data = withUnattemptedTask();
    expect(exposedParticipantIds(data, 'task-hours').size).toBe(0);
    expect(validateIssue(data, { ...VALID, taskId: 'task-hours', affectedParticipantIds: ['p-01'] }, null).affectedParticipantIds).toMatch(
      /P01 did not attempt T6/,
    );

    const result = addIssue(data, { ...VALID, taskId: 'task-hours', affectedParticipantIds: [] }, () => 'issue-new');
    if (!result.ok) throw new Error('expected success');
    const priority = calculateIssuePriority(result.data.issues.at(-1)!, result.data.participants, result.data.attempts);
    expect(priority).toMatchObject({ denominator: 0, shareAffected: null, score: null, level: 'unknown' });
  });
});

describe('editing issues', () => {
  it('updates status and recommendation in place, keeping id, position and finding links', () => {
    const data = frozenSample();
    const index = data.issues.findIndex((i) => i.id === AVAILABILITY);
    const original = data.issues[index]!;
    const result = updateIssue(data, AVAILABILITY, {
      ...issueToInput(original),
      status: 'resolved',
      recommendation: 'Show a "Next available" list on the home page.',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.issues).toHaveLength(data.issues.length);
    expect(result.data.issues[index]).toEqual({
      ...original,
      status: 'resolved',
      recommendation: 'Show a "Next available" list on the home page.',
    });
    expect(result.data.findings).toBe(data.findings);
  });

  it('an unchanged save produces an identical issue', () => {
    const data = frozenSample();
    for (const issue of data.issues) {
      const result = updateIssue(data, issue.id, issueToInput(issue));
      expect(result.ok && result.data.issues.find((i) => i.id === issue.id)).toEqual(issue);
    }
  });

  it('cancelling (never calling update) changes nothing; update never mutates the original', () => {
    const data = frozenSample(); // frozen: any mutation would throw
    updateIssue(data, AVAILABILITY, { ...VALID, title: 'Draft' });
    addIssue(data, VALID);
    expect(data).toEqual(sampleStudyData);
  });

  it('reports a missing issue', () => {
    expect(updateIssue(frozenSample(), 'missing', VALID)).toMatchObject({ ok: false, message: 'This issue no longer exists.' });
  });
});

describe('affected participants after an attempt is deleted', () => {
  // P02 is recorded as affected by the availability issue and attempted T1.
  const afterDelete = () => {
    const result = deleteAttempt(frozenSample(), 'a-p-02-task-find-slot');
    if (!result.ok) throw new Error('setup failed');
    return result.data;
  };

  it('keeps the recorded participant but stops counting them in the priority score', () => {
    const before = frozenSample();
    const issue = before.issues.find((i) => i.id === AVAILABILITY)!;
    expect(calculateIssuePriority(issue, before.participants, before.attempts)).toMatchObject({
      recorded: 5,
      affected: 5,
      denominator: 8,
    });

    const data = afterDelete();
    const p = calculateIssuePriority(issue, data.participants, data.attempts);
    expect(p).toMatchObject({ recorded: 5, affected: 4, denominator: 7 });
    expect(p.score).toBeCloseTo(4 * (4 / 7));
    expect(uncountedParticipantIds(data, issue)).toEqual(['p-02']);
  });

  it('lets the evaluator save other edits without being forced to remove that record', () => {
    const data = afterDelete();
    const issue = data.issues.find((i) => i.id === AVAILABILITY)!;
    const result = updateIssue(data, AVAILABILITY, { ...issueToInput(issue), status: 'in-progress' });
    expect(result.ok && result.data.issues.find((i) => i.id === AVAILABILITY)?.affectedParticipantIds).toContain('p-02');
  });

  it('does not let that participant be newly added to another issue on the same task', () => {
    const data = afterDelete();
    const weekNav = data.issues.find((i) => i.id === WEEK_NAV)!;
    const errors = validateIssue(
      data,
      { ...issueToInput(weekNav), affectedParticipantIds: [...weekNav.affectedParticipantIds, 'p-02'] },
      WEEK_NAV,
    );
    expect(errors.affectedParticipantIds).toMatch(/P02 did not attempt T1/);
  });

  it('re-checks everyone when the linked task changes', () => {
    const data = withUnattemptedTask();
    const issue = data.issues.find((i) => i.id === AVAILABILITY)!;
    const errors = validateIssue(data, { ...issueToInput(issue), taskId: 'task-hours' }, AVAILABILITY);
    expect(errors.affectedParticipantIds).toMatch(/^P02, P04, P05, P07, P08 did not attempt T6/);
  });
});

describe('deleting issues', () => {
  it('deletes an uncited issue and leaves tasks, attempts, participants and findings alone', () => {
    const data = frozenSample();
    expect(issueDeletionImpact(data, RESCHEDULE)).toEqual({ detachedFindings: [], blockingFindings: [] });
    const result = deleteIssue(data, RESCHEDULE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.issues.map((i) => i.id)).not.toContain(RESCHEDULE);
    expect(result.data.tasks).toBe(data.tasks);
    expect(result.data.attempts).toBe(data.attempts);
    expect(result.data.participants).toBe(data.participants);
    expect(result.data.findings).toEqual(data.findings);
  });

  it('removes the link from a finding that still has other supporting issues', () => {
    const data = frozenSample();
    expect(issueDeletionImpact(data, WEEK_NAV).detachedFindings.map((f) => f.id)).toEqual(['finding-availability']);
    const result = deleteIssue(data, WEEK_NAV);
    if (!result.ok) throw new Error('expected success');
    expect(result.data.findings.find((f) => f.id === 'finding-availability')?.issueIds).toEqual([AVAILABILITY]);
    // No finding is left pointing at a deleted issue.
    const ids = new Set(result.data.issues.map((i) => i.id));
    expect(result.data.findings.every((f) => f.issueIds.every((id) => ids.has(id)))).toBe(true);
  });

  it('refuses to delete the only issue behind a finding, and changes nothing', () => {
    const data = frozenSample();
    expect(issueDeletionBlocker(data, CONFIRMATION)).toBe(
      'It is the only evidence cited by the finding “Confirmation wording creates doubt”. Deleting it would leave that finding unsupported, so it is kept.',
    );
    const result = deleteIssue(data, CONFIRMATION);
    expect(result.ok).toBe(false);
  });

  it('reports a missing issue', () => {
    expect(deleteIssue(frozenSample(), 'missing').ok).toBe(false);
  });
});

describe('recommendations reflect issue changes', () => {
  it('shows the current issue title, status, priority and findings', () => {
    const data = frozenSample();
    const edited = updateIssue(data, AVAILABILITY, {
      ...issueToInput(data.issues[0]!),
      title: 'Open times are hidden',
      status: 'in-progress',
      recommendation: 'Add a "Next available" view.',
    });
    if (!edited.ok) throw new Error('expected success');
    const row = buildRecommendations(edited.data).find((r) => r.issue.id === AVAILABILITY)!;
    expect(row.issue).toMatchObject({ title: 'Open times are hidden', status: 'in-progress', recommendation: 'Add a "Next available" view.' });
    expect(row.priority.level).toBe('high');
    expect(row.findingTitles).toEqual(['Finding open appointments is the main barrier']);
  });

  it('drops a recommendation when its text is cleared or its issue is deleted', () => {
    const data = frozenSample();
    expect(buildRecommendations(data)).toHaveLength(6);

    const cleared = updateIssue(data, RESCHEDULE, { ...issueToInput(data.issues[3]!), recommendation: '  ' });
    if (!cleared.ok) throw new Error('expected success');
    expect(buildRecommendations(cleared.data).map((r) => r.issue.id)).not.toContain(RESCHEDULE);

    const deleted = deleteIssue(data, WEEK_NAV);
    if (!deleted.ok) throw new Error('expected success');
    expect(buildRecommendations(deleted.data).map((r) => r.issue.id)).not.toContain(WEEK_NAV);
  });
});

describe('persistence', () => {
  it('issue changes survive a reload and restore-sample brings back the originals', () => {
    const storage = memoryStorage();
    const store = createStudyStore(storage);
    const current = () => store.getState().data;

    const added = addIssue(current(), VALID, () => 'issue-new');
    if (!added.ok) throw new Error('expected success');
    store.update(() => added.data);

    const edited = updateIssue(current(), AVAILABILITY, { ...issueToInput(current().issues[0]!), status: 'resolved' });
    if (!edited.ok) throw new Error('expected success');
    store.update(() => edited.data);

    const deleted = deleteIssue(current(), WEEK_NAV);
    if (!deleted.ok) throw new Error('expected success');
    store.update(() => deleted.data);

    const reloaded = createStudyStore(storage).getState();
    expect(reloaded.loadProblem).toBeNull();
    expect(reloaded.data.issues.find((i) => i.id === 'issue-new')?.title).toBe('Booking reasons are hard to scan');
    expect(reloaded.data.issues.find((i) => i.id === AVAILABILITY)?.status).toBe('resolved');
    expect(reloaded.data.issues.some((i) => i.id === WEEK_NAV)).toBe(false);
    expect(reloaded.data.findings.find((f) => f.id === 'finding-availability')?.issueIds).toEqual([AVAILABILITY]);
    // Sessions, tasks and study details are untouched.
    expect(reloaded.data.attempts).toEqual(sampleStudyData.attempts);
    expect(reloaded.data.tasks).toEqual(sampleStudyData.tasks);
    expect(reloaded.data.study).toEqual(sampleStudyData.study);

    createStudyStore(storage).restoreSample();
    expect(createStudyStore(storage).getState().data).toEqual(sampleStudyData);
  });
});
