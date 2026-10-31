import { useEffect, useState } from 'react';
import type { StudyData, Task } from '../types';
import { formatDate } from '../lib/format';
import {
  addTask,
  deleteTask,
  deletionBlocker,
  EMPTY_TASK_INPUT,
  suggestTaskCode,
  taskToInput,
  updateStudyDetails,
  updateTask,
  type StudyDetailsInput,
  type TaskInput,
} from '../lib/studyEditing';
import { Card, EmptyState, PageHeader } from '../components/ui';
import { FictionalBadge, StudyStatusBadge } from '../components/badges';
import { StudyDetailsForm } from '../components/StudyDetailsForm';
import { TaskForm } from '../components/TaskForm';

interface Props {
  data: StudyData;
  /** Replaces the current study data in the central store (which saves it). */
  onChange: (next: StudyData) => void;
}

type TaskEditor = { mode: 'add' } | { mode: 'edit'; task: Task } | null;
type Feedback = { ok: boolean; message: string } | null;

export function StudyPage({ data, onChange }: Props) {
  const { study, tasks } = data;

  const [editingStudy, setEditingStudy] = useState(false);
  const [studyFeedback, setStudyFeedback] = useState<Feedback>(null);
  const [taskEditor, setTaskEditor] = useState<TaskEditor>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [taskFeedback, setTaskFeedback] = useState<Feedback>(null);

  // Return keyboard focus to a sensible control after a form closes.
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (focusRequest) document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

  // ---------- Study details ----------

  function saveStudy(input: StudyDetailsInput) {
    const result = updateStudyDetails(data, input);
    if (!result.ok) return result.errors;
    onChange(result.data);
    setEditingStudy(false);
    setStudyFeedback({ ok: true, message: 'Study details saved.' });
    setFocusRequest({ id: 'edit-study-button' });
    return null;
  }

  function cancelStudyEdit() {
    setEditingStudy(false);
    setStudyFeedback(null);
    setFocusRequest({ id: 'edit-study-button' });
  }

  // ---------- Tasks ----------

  function openTaskEditor(editor: Exclude<TaskEditor, null>) {
    setTaskEditor(editor);
    setPendingDelete(null);
    setTaskFeedback(null);
  }

  function closeTaskEditor(message?: string) {
    setTaskEditor(null);
    setTaskFeedback(message ? { ok: true, message } : null);
    setFocusRequest({ id: 'add-task-button' });
  }

  function saveTask(input: TaskInput) {
    const result = taskEditor?.mode === 'edit' ? updateTask(data, taskEditor.task.id, input) : addTask(data, input);
    if (!result.ok) {
      if (result.message) setTaskFeedback({ ok: false, message: result.message });
      return result.errors;
    }
    onChange(result.data);
    closeTaskEditor(taskEditor?.mode === 'edit' ? `Task ${input.code.trim()} updated.` : `Task ${input.code.trim()} added.`);
    return null;
  }

  function requestDelete(task: Task) {
    setTaskEditor(null);
    const blocker = deletionBlocker(data, task.id);
    if (blocker) {
      setPendingDelete(null);
      setTaskFeedback({ ok: false, message: `Task ${task.code} cannot be deleted. ${blocker}` });
      return;
    }
    setTaskFeedback(null);
    setPendingDelete(task);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const result = deleteTask(data, pendingDelete.id);
    if (result.ok) {
      onChange(result.data);
      setTaskFeedback({ ok: true, message: `Task ${pendingDelete.code} deleted.` });
    } else {
      setTaskFeedback({ ok: false, message: result.message ?? 'The task could not be deleted.' });
    }
    setPendingDelete(null);
    setFocusRequest({ id: 'add-task-button' });
  }

  function cancelDelete() {
    setPendingDelete(null);
    setTaskFeedback({ ok: true, message: 'Deletion cancelled. The task was kept.' });
    setFocusRequest({ id: 'add-task-button' });
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Study & tasks"
        title="Study details"
        lede="The study's purpose, method and the tasks participants were asked to complete."
        meta={
          <>
            <StudyStatusBadge status={study.status} />
            {study.isSample && <FictionalBadge />}
          </>
        }
      />

      <Card
        title={editingStudy ? 'Edit study details' : study.title}
        actions={
          !editingStudy && (
            <button
              type="button"
              id="edit-study-button"
              className="button"
              onClick={() => {
                setEditingStudy(true);
                setStudyFeedback(null);
              }}
            >
              Edit details
            </button>
          )
        }
      >
        {editingStudy ? (
          <StudyDetailsForm study={study} onSave={saveStudy} onCancel={cancelStudyEdit} />
        ) : (
          <dl className="definition-list">
            <dt>Product</dt>
            <dd>{study.product}</dd>
            <dt>Purpose</dt>
            <dd>{study.purpose}</dd>
            <dt>Method</dt>
            <dd>{study.method}</dd>
            <dt>Dates</dt>
            <dd>
              {formatDate(study.startDate)} – {formatDate(study.endDate)}
            </dd>
          </dl>
        )}
        <p className={`feedback ${studyFeedback && !studyFeedback.ok ? 'feedback-error' : ''}`} role="status">
          {studyFeedback?.message}
        </p>
      </Card>

      <Card
        title="Tasks"
        subtitle={`${tasks.length} tasks`}
        actions={
          <button
            type="button"
            id="add-task-button"
            className="button"
            onClick={() => openTaskEditor({ mode: 'add' })}
          >
            Add task
          </button>
        }
        footnote="Each task has a permanent ID. Session results link to that ID, so renaming a task or changing its code never detaches its results. Tasks with linked sessions or issues cannot be deleted."
      >
        {taskEditor && (
          <TaskForm
            // A new key resets the form when switching between tasks.
            key={taskEditor.mode === 'edit' ? taskEditor.task.id : 'new'}
            heading={taskEditor.mode === 'edit' ? `Edit task ${taskEditor.task.code}` : 'New task'}
            submitLabel={taskEditor.mode === 'edit' ? 'Save task' : 'Save new task'}
            initial={
              taskEditor.mode === 'edit'
                ? taskToInput(taskEditor.task)
                : { ...EMPTY_TASK_INPUT, code: suggestTaskCode(tasks) }
            }
            onSave={saveTask}
            onCancel={() => closeTaskEditor()}
          />
        )}

        {pendingDelete && (
          <div className="confirm-panel" role="group" aria-labelledby="delete-task-title">
            <p id="delete-task-title" className="item-title">
              Delete task {pendingDelete.code} “{pendingDelete.name}”?
            </p>
            <p className="item-text">No sessions or issues refer to this task. This cannot be undone.</p>
            <div className="button-row">
              <button type="button" className="button button-danger" onClick={confirmDelete}>
                Delete task
              </button>
              <button type="button" className="button" onClick={cancelDelete} autoFocus>
                Cancel
              </button>
            </div>
          </div>
        )}

        <p className={`feedback ${taskFeedback && !taskFeedback.ok ? 'feedback-error' : ''}`} role="status">
          {taskFeedback?.message}
        </p>

        {tasks.length === 0 ? (
          <EmptyState title="No tasks yet">Add the tasks participants will attempt.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Task</th>
                  <th scope="col">Expected outcome</th>
                  <th scope="col">ID</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.code}</td>
                    <td>
                      <strong>{task.name}</strong>
                      <div className="muted">{task.description}</div>
                    </td>
                    <td>{task.expectedOutcome}</td>
                    <td className="code muted">{task.id}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="button button-small"
                          aria-label={`Edit task ${task.code}`}
                          onClick={() => openTaskEditor({ mode: 'edit', task })}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="button button-small"
                          aria-label={`Delete task ${task.code}`}
                          onClick={() => requestDelete(task)}
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
