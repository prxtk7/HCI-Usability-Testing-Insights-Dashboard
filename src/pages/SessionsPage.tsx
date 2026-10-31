import { useState } from 'react';
import type { StudyData, TaskAttempt } from '../types';
import { isValidCount, isValidSeconds } from '../lib/metrics';
import { EMPTY, formatDuration } from '../lib/format';
import {
  addAttempt,
  attemptToInput,
  deleteAttempt,
  EMPTY_ATTEMPT_INPUT,
  filterAttempts,
  isFiltered,
  NO_FILTERS,
  updateAttempt,
  type AttemptFilters,
  type AttemptInput,
} from '../lib/sessionEditing';
import { Card, EmptyState, PageHeader } from '../components/ui';
import { AttemptForm } from '../components/AttemptForm';
import { useFocusAfterRender } from '../components/forms';

interface Props {
  data: StudyData;
  /** Replaces the current study data in the central store (which saves it). */
  onChange: (next: StudyData) => void;
}

type Editor = { mode: 'add' } | { mode: 'edit'; attempt: TaskAttempt } | null;
type Feedback = { ok: boolean; message: string } | null;

export function SessionsPage({ data, onChange }: Props) {
  const { tasks, participants, attempts, study } = data;
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const participantById = new Map(participants.map((p) => [p.id, p]));
  const label = (a: TaskAttempt) =>
    `${participantById.get(a.participantId)?.code ?? 'Unknown'} · ${taskById.get(a.taskId)?.code ?? 'Deleted task'}`;

  const [filters, setFilters] = useState<AttemptFilters>(NO_FILTERS);
  const [editor, setEditor] = useState<Editor>(null);
  const [pendingDelete, setPendingDelete] = useState<TaskAttempt | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const focusAfterRender = useFocusAfterRender();

  // Filtering only chooses which rows to show; the stored attempts are untouched.
  const visible = filterAttempts(attempts, filters);
  const filtered = isFiltered(filters);

  function openEditor(next: Exclude<Editor, null>) {
    setEditor(next);
    setPendingDelete(null);
    setFeedback(null);
  }

  function closeEditor(message?: string) {
    setEditor(null);
    setFeedback(message ? { ok: true, message } : null);
    focusAfterRender('record-attempt-button');
  }

  function saveAttempt(input: AttemptInput) {
    const result = editor?.mode === 'edit' ? updateAttempt(data, editor.attempt.id, input) : addAttempt(data, input);
    if (!result.ok) {
      if (result.message) setFeedback({ ok: false, message: result.message });
      return result.errors;
    }
    onChange(result.data);
    const savedId = editor?.mode === 'edit' ? editor.attempt.id : result.data.attempts.at(-1)?.id;
    const saved = result.data.attempts.find((a) => a.id === savedId);
    const p = saved ? result.data.participants.find((x) => x.id === saved.participantId)?.code : undefined;
    const t = saved ? result.data.tasks.find((x) => x.id === saved.taskId)?.code : undefined;
    const what = p && t ? `${p} · ${t}` : 'Attempt';
    closeEditor(editor?.mode === 'edit' ? `Attempt ${what} updated.` : `Attempt ${what} recorded.`);
    return null;
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const result = deleteAttempt(data, pendingDelete.id);
    if (result.ok) {
      onChange(result.data);
      setFeedback({ ok: true, message: `Attempt ${label(pendingDelete)} deleted. Metrics have been recalculated.` });
    } else {
      setFeedback({ ok: false, message: result.message ?? 'The attempt could not be deleted.' });
    }
    setPendingDelete(null);
    focusAfterRender('record-attempt-button');
  }

  function cancelDelete() {
    setPendingDelete(null);
    setFeedback({ ok: true, message: 'Deletion cancelled. The attempt was kept.' });
    focusAfterRender('record-attempt-button');
  }

  const pendingParticipant = pendingDelete ? participantById.get(pendingDelete.participantId)?.code : undefined;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Participant sessions"
        title="Task attempts"
        lede="One row per participant per task. A participant appears once for each task they attempted."
      />

      <Card
        title="All attempts"
        subtitle={`${attempts.length} attempts from ${new Set(attempts.map((a) => a.participantId)).size} participants${study.isSample ? ' (fictional)' : ''}`}
        actions={
          <button
            type="button"
            id="record-attempt-button"
            className="button"
            onClick={() => openEditor({ mode: 'add' })}
          >
            Record task attempt
          </button>
        }
        footnote="“—” means the value was not recorded. Missing values are excluded from averages rather than counted as zero."
      >
        {editor && (
          <AttemptForm
            // A new key resets the form when switching between records.
            key={editor.mode === 'edit' ? editor.attempt.id : 'new'}
            heading={editor.mode === 'edit' ? `Edit attempt ${label(editor.attempt)}` : 'Record task attempt'}
            submitLabel={editor.mode === 'edit' ? 'Save attempt' : 'Save new attempt'}
            initial={editor.mode === 'edit' ? attemptToInput(editor.attempt) : EMPTY_ATTEMPT_INPUT}
            participants={participants}
            tasks={tasks}
            onSave={saveAttempt}
            onCancel={() => closeEditor()}
          />
        )}

        {pendingDelete && (
          <div className="confirm-panel" role="group" aria-labelledby="delete-attempt-title">
            <p id="delete-attempt-title" className="item-title">
              Delete attempt {label(pendingDelete)}?
            </p>
            <p className="item-text">
              Completion rates, times, error totals and issue priority scores will be recalculated without it.
              Participant {pendingParticipant ?? ''} is kept. This cannot be undone.
            </p>
            <div className="button-row">
              <button type="button" className="button button-danger" onClick={confirmDelete}>
                Delete attempt
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

        {attempts.length > 0 && (
          <div className="filter-bar" role="group" aria-label="Filter attempts">
            <label className="filter">
              <span className="field-label">Participant</span>
              <select
                value={filters.participantId}
                onChange={(e) => setFilters((f) => ({ ...f, participantId: e.target.value }))}
              >
                <option value="">All participants</option>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span className="field-label">Task</span>
              <select value={filters.taskId} onChange={(e) => setFilters((f) => ({ ...f, taskId: e.target.value }))}>
                <option value="">All tasks</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} – {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <span className="field-label">Outcome</span>
              <select
                value={filters.outcome}
                onChange={(e) => setFilters((f) => ({ ...f, outcome: e.target.value as AttemptFilters['outcome'] }))}
              >
                <option value="">All outcomes</option>
                <option value="completed">Completed</option>
                <option value="not-completed">Not completed</option>
              </select>
            </label>
            {filtered && (
              <button type="button" className="button button-small" onClick={() => setFilters(NO_FILTERS)}>
                Reset filters
              </button>
            )}
            <span className="filter-count" aria-live="polite">
              {filtered ? `Showing ${visible.length} of ${attempts.length} attempts` : `Showing all ${attempts.length} attempts`}
            </span>
          </div>
        )}

        {attempts.length === 0 ? (
          <EmptyState title="No attempts recorded">Use “Record task attempt” to add the first result.</EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState title="No attempts match these filters">
            <button type="button" className="button button-small" onClick={() => setFilters(NO_FILTERS)}>
              Reset filters
            </button>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Participant</th>
                  <th scope="col">Task</th>
                  <th scope="col">Outcome</th>
                  <th scope="col" className="num">Time</th>
                  <th scope="col" className="num">Errors</th>
                  <th scope="col">Observation</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.id}>
                    <td>{participantById.get(a.participantId)?.code ?? 'Unknown'}</td>
                    <td>{taskById.get(a.taskId)?.code ?? 'Deleted task'}</td>
                    <td>
                      <span className={`badge ${a.completed ? 'badge-low' : 'badge-high'}`}>
                        {a.completed ? 'Completed' : 'Not completed'}
                      </span>
                    </td>
                    <td className="num">{isValidSeconds(a.timeSeconds) ? formatDuration(a.timeSeconds) : EMPTY}</td>
                    <td className="num">{isValidCount(a.errorCount) ? a.errorCount : EMPTY}</td>
                    <td className="muted">
                      {a.observation || EMPTY}
                      {a.feedback && <div>Feedback: {a.feedback}</div>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="button button-small"
                          aria-label={`Edit attempt ${label(a)}`}
                          onClick={() => openEditor({ mode: 'edit', attempt: a })}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="button button-small"
                          aria-label={`Delete attempt ${label(a)}`}
                          onClick={() => {
                            setEditor(null);
                            setFeedback(null);
                            setPendingDelete(a);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
