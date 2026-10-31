import { useState } from 'react';
import type { StudyData, UsabilityIssue } from '../types';
import { rankIssues } from '../lib/priority';
import { formatDecimal } from '../lib/format';
import {
  addIssue,
  deleteIssue,
  EMPTY_ISSUE_INPUT,
  issueDeletionBlocker,
  issueDeletionImpact,
  issueToInput,
  updateIssue,
  type IssueInput,
} from '../lib/issueEditing';
import { Card, EmptyState, PageHeader } from '../components/ui';
import { IssueStatusBadge, PriorityBadge, SeverityBadge } from '../components/badges';
import { IssueForm } from '../components/IssueForm';
import { useFocusAfterRender } from '../components/forms';
import { recordHref, useLinkedRecord } from '../navigation';

interface Props {
  data: StudyData;
  /** Replaces the current study data in the central store (which saves it). */
  onChange: (next: StudyData) => void;
}

type Editor = { mode: 'add' } | { mode: 'edit'; issue: UsabilityIssue } | null;
type Feedback = { ok: boolean; message: string } | null;

export function IssuesPage({ data, onChange }: Props) {
  const { tasks, participants, attempts, issues } = data;
  const ranked = rankIssues(issues, participants, attempts);
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const [editor, setEditor] = useState<Editor>(null);
  const [pendingDelete, setPendingDelete] = useState<UsabilityIssue | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const focusAfterRender = useFocusAfterRender();
  const linkedId = useLinkedRecord('issue-record-');

  function openEditor(next: Exclude<Editor, null>) {
    setEditor(next);
    setPendingDelete(null);
    setFeedback(null);
  }

  function closeEditor(message?: string) {
    setEditor(null);
    setFeedback(message ? { ok: true, message } : null);
    focusAfterRender('add-issue-button');
  }

  function saveIssue(input: IssueInput) {
    const result = editor?.mode === 'edit' ? updateIssue(data, editor.issue.id, input) : addIssue(data, input);
    if (!result.ok) {
      if (result.message) setFeedback({ ok: false, message: result.message });
      return result.errors;
    }
    onChange(result.data);
    closeEditor(editor?.mode === 'edit' ? `Issue “${input.title.trim()}” updated.` : `Issue “${input.title.trim()}” added.`);
    return null;
  }

  function requestDelete(issue: UsabilityIssue) {
    setEditor(null);
    const blocker = issueDeletionBlocker(data, issue.id);
    if (blocker) {
      setPendingDelete(null);
      setFeedback({ ok: false, message: `“${issue.title}” cannot be deleted. ${blocker}` });
      return;
    }
    setFeedback(null);
    setPendingDelete(issue);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const result = deleteIssue(data, pendingDelete.id);
    if (result.ok) {
      onChange(result.data);
      setFeedback({ ok: true, message: `Issue “${pendingDelete.title}” deleted.` });
    } else {
      setFeedback({ ok: false, message: result.message ?? 'The issue could not be deleted.' });
    }
    setPendingDelete(null);
    focusAfterRender('add-issue-button');
  }

  function cancelDelete() {
    setPendingDelete(null);
    setFeedback({ ok: true, message: 'Deletion cancelled. The issue was kept.' });
    focusAfterRender('add-issue-button');
  }

  const detached = pendingDelete ? issueDeletionImpact(data, pendingDelete.id).detachedFindings : [];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Issue tracker"
        title="Usability issues"
        lede="Problems observed during sessions, ranked by a simple, visible priority score."
      />

      <Card title="How priority is calculated">
        <dl className="definition-list">
          <dt>Severity (1–4)</dt>
          <dd>Evaluator's judgement: 1 Cosmetic, 2 Minor, 3 Major, 4 Critical (blocks the task). Subjective.</dd>
          <dt>Share affected</dt>
          <dd>
            Participants who hit the issue ÷ participants who attempted the linked task. Issues not linked to a
            task use all participants.
          </dd>
          <dt>Score</dt>
          <dd>Severity × share affected, from 0 to 4. High ≥ 2.0, Medium ≥ 1.0, otherwise Low.</dd>
          <dt>Safeguard</dt>
          <dd>Critical issues are never ranked below Medium, even if only one participant hit them.</dd>
        </dl>
      </Card>

      <Card
        title="All issues"
        subtitle={`${issues.length} issues`}
        actions={
          <button type="button" id="add-issue-button" className="button" onClick={() => openEditor({ mode: 'add' })}>
            Add issue
          </button>
        }
      >
        {editor && (
          <IssueForm
            // A new key resets the form when switching between issues.
            key={editor.mode === 'edit' ? editor.issue.id : 'new'}
            heading={editor.mode === 'edit' ? 'Edit issue' : 'New issue'}
            submitLabel={editor.mode === 'edit' ? 'Save issue' : 'Save new issue'}
            initial={editor.mode === 'edit' ? issueToInput(editor.issue) : EMPTY_ISSUE_INPUT}
            data={data}
            onSave={saveIssue}
            onCancel={() => closeEditor()}
          />
        )}

        {pendingDelete && (
          <div className="confirm-panel" role="group" aria-labelledby="delete-issue-title">
            <p id="delete-issue-title" className="item-title">
              Delete issue “{pendingDelete.title}”?
            </p>
            <p className="item-text">
              Its recommendation will also be removed.
              {detached.length > 0 &&
                ` It will no longer be cited by ${detached.map((f) => `“${f.title}”`).join(', ')}, which keeps its other supporting issues.`}{' '}
              Tasks, sessions and participants are not affected. This cannot be undone.
            </p>
            <div className="button-row">
              <button type="button" className="button button-danger" onClick={confirmDelete}>
                Delete issue
              </button>
              <button type="button" className="button" onClick={cancelDelete} autoFocus>
                Cancel
              </button>
            </div>
          </div>
        )}

        <p className={`feedback ${feedback && !feedback.ok ? 'feedback-error' : ''}`} role="status">
          {feedback?.message}
        </p>

        {ranked.length === 0 ? (
          <EmptyState title="No issues logged">Use “Add issue” to record the first problem you observed.</EmptyState>
        ) : (
          <ol className="stack-list">
            {ranked.map(({ issue, priority }) => {
              const task = issue.taskId ? taskById.get(issue.taskId) : undefined;
              const uncounted = priority.recorded - priority.affected;
              return (
                <li
                  key={issue.id}
                  id={`issue-record-${issue.id}`}
                  tabIndex={-1}
                  className={issue.id === linkedId ? 'linked-record' : undefined}
                >
                  <div className="item-title-row">
                    <span className="item-title">{issue.title}</span>
                    <PriorityBadge level={priority.level} />
                  </div>
                  <span className="item-text">{issue.description}</span>
                  <span className="item-text">
                    <strong>Recorded evidence:</strong> {issue.evidence || 'None recorded'}
                  </span>
                  {issue.recommendation && (
                    <span className="item-text">
                      <strong>Recommendation:</strong>{' '}
                      <a href={recordHref('recommendations', issue.id)}>{issue.recommendation}</a>
                    </span>
                  )}
                  <div className="item-meta">
                    <SeverityBadge severity={issue.severity} />
                    <IssueStatusBadge status={issue.status} />
                    <span>{task ? `${task.code} ${task.name}` : issue.taskId ? 'Deleted task' : 'Whole product'}</span>
                    <span>
                      Affected {priority.affected} of {priority.denominator}
                      {uncounted > 0 && ` (${uncounted} more recorded, not counted: no current attempt)`}
                    </span>
                    <span>Score {formatDecimal(priority.score, 2)} / 4</span>
                  </div>
                  <div className="row-actions row-actions-start">
                    <button
                      type="button"
                      className="button button-small"
                      aria-label={`Edit issue: ${issue.title}`}
                      onClick={() => openEditor({ mode: 'edit', issue })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="button button-small"
                      aria-label={`Delete issue: ${issue.title}`}
                      onClick={() => requestDelete(issue)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}
