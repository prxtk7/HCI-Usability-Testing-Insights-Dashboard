import { useState, type FormEvent } from 'react';
import type { StudyData } from '../types';
import {
  exposedParticipantIds,
  ISSUE_STATUSES,
  SEVERITY_OPTIONS,
  type IssueField,
  type IssueInput,
} from '../lib/issueEditing';
import type { FieldErrors } from '../lib/studyEditing';
import { Field, focusFirstError } from './forms';

// In form order, so focus goes to the first problem.
const IDS: Record<IssueField, string> = {
  title: 'issue-title',
  description: 'issue-description',
  taskId: 'issue-task',
  severity: 'issue-severity',
  status: 'issue-status',
  affectedParticipantIds: 'issue-affected',
  evidence: 'issue-evidence',
  recommendation: 'issue-recommendation',
};

interface Props {
  heading: string;
  submitLabel: string;
  initial: IssueInput;
  data: StudyData;
  /** Returns field errors if the save was rejected, or null on success. */
  onSave: (input: IssueInput) => FieldErrors<IssueField> | null;
  onCancel: () => void;
}

export function IssueForm({ heading, submitLabel, initial, data, onSave, onCancel }: Props) {
  // A private draft; the study data only changes when Save succeeds.
  const [values, setValues] = useState<IssueInput>(initial);
  const [errors, setErrors] = useState<FieldErrors<IssueField>>({});

  function set<K extends IssueField>(field: K, value: IssueInput[K]) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = onSave(values);
    if (result) {
      setErrors(result);
      focusFirstError(IDS, result);
    }
  }

  const task = data.tasks.find((t) => t.id === values.taskId);
  const exposed = exposedParticipantIds(data, values.taskId);
  const selected = new Set(values.affectedParticipantIds);
  // People who attempted the linked task, plus anyone already selected who did not
  // (shown so they are never hidden or silently dropped).
  const choices = data.participants.filter((p) => exposed.has(p.id) || selected.has(p.id));

  function toggle(id: string, checked: boolean) {
    set(
      'affectedParticipantIds',
      checked ? [...values.affectedParticipantIds, id] : values.affectedParticipantIds.filter((x) => x !== id),
    );
  }

  const affectedHintId = 'issue-affected-hint';
  const affectedErrorId = errors.affectedParticipantIds ? 'issue-affected-error' : undefined;

  return (
    <form className="form form-panel" onSubmit={handleSubmit} noValidate aria-labelledby="issue-form-heading">
      <h3 id="issue-form-heading">{heading}</h3>

      <Field id={IDS.title} label="Issue title" error={errors.title}>
        {(p) => <input {...p} type="text" value={values.title} onChange={(e) => set('title', e.target.value)} autoFocus />}
      </Field>
      <Field id={IDS.description} label="Description" hint="What goes wrong for participants, and where." error={errors.description}>
        {(p) => <textarea {...p} rows={2} value={values.description} onChange={(e) => set('description', e.target.value)} />}
      </Field>

      <div className="form-grid">
        <Field id={IDS.taskId} label="Linked task" error={errors.taskId}>
          {(p) => (
            <select {...p} value={values.taskId} onChange={(e) => set('taskId', e.target.value)}>
              <option value="">Whole study (not task-specific)</option>
              {data.tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} – {t.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          id={IDS.severity}
          label="Severity"
          hint="Your judgement of impact, not a measurement."
          error={errors.severity}
        >
          {(p) => (
            <select {...p} value={values.severity} onChange={(e) => set('severity', e.target.value)}>
              <option value="">Choose severity</option>
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s.value} value={String(s.value)}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id={IDS.status} label="Status" error={errors.status}>
          {(p) => (
            <select {...p} value={values.status} onChange={(e) => set('status', e.target.value)}>
              {ISSUE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <p className="field-hint">
        Severity guide: {SEVERITY_OPTIONS.map((s) => `${s.label}: ${s.hint.toLowerCase()}`).join('; ')}.
      </p>

      <fieldset
        className="field fieldset"
        aria-describedby={[affectedHintId, affectedErrorId].filter(Boolean).join(' ')}
      >
        <legend className="field-label">
          Affected participants <span className="field-optional">(optional)</span>
        </legend>
        <span id={affectedHintId} className="field-hint">
          {task
            ? `Participants who attempted ${task.code}. Only they count toward the priority score.`
            : 'All participants in the study.'}
        </span>

        {choices.length === 0 ? (
          <p className="item-text">
            {task ? `No one has attempted ${task.code} yet. Record attempts first, or link the issue to the whole study.` : 'No participants yet.'}
          </p>
        ) : (
          <>
            <div className="checkbox-grid">
              {choices.map((p, i) => (
                <label key={p.id} className="radio">
                  <input
                    type="checkbox"
                    id={i === 0 ? IDS.affectedParticipantIds : undefined}
                    checked={selected.has(p.id)}
                    onChange={(e) => toggle(p.id, e.target.checked)}
                    aria-invalid={Boolean(errors.affectedParticipantIds)}
                  />
                  {p.code}
                  {!exposed.has(p.id) && <span className="field-hint"> (no attempt at {task?.code ?? 'this task'}, not counted)</span>}
                </label>
              ))}
            </div>
            <div className="button-row">
              <button
                type="button"
                className="button button-small"
                onClick={() =>
                  set('affectedParticipantIds', [
                    ...values.affectedParticipantIds,
                    ...[...exposed].filter((id) => !selected.has(id)),
                  ])
                }
              >
                {task ? `Select all who attempted ${task.code}` : 'Select all'}
              </button>
              <button type="button" className="button button-small" onClick={() => set('affectedParticipantIds', [])}>
                Clear
              </button>
            </div>
          </>
        )}
        {errors.affectedParticipantIds && (
          <span id={affectedErrorId} className="field-error">
            {errors.affectedParticipantIds}
          </span>
        )}
      </fieldset>

      <Field
        id={IDS.evidence}
        label="Evidence"
        optional
        hint="What you observed, as recorded by the evaluator (e.g. “3 of 8 failed T1”). Not independently verified."
        error={errors.evidence}
      >
        {(p) => <textarea {...p} rows={2} value={values.evidence} onChange={(e) => set('evidence', e.target.value)} />}
      </Field>
      <Field
        id={IDS.recommendation}
        label="Suggested recommendation"
        optional
        hint="The proposed design change. Shown on the Recommendations page."
        error={errors.recommendation}
      >
        {(p) => (
          <textarea {...p} rows={2} value={values.recommendation} onChange={(e) => set('recommendation', e.target.value)} />
        )}
      </Field>

      <div className="button-row">
        <button type="submit" className="button button-primary">
          {submitLabel}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
