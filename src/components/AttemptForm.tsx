import { useState, type FormEvent } from 'react';
import type { Participant, Task } from '../types';
import {
  NEW_PARTICIPANT,
  suggestParticipantCode,
  type AttemptField,
  type AttemptInput,
} from '../lib/sessionEditing';
import type { FieldErrors } from '../lib/studyEditing';
import { Field, focusFirstError } from './forms';

// In form order, so focus goes to the first problem.
const IDS: Record<AttemptField, string> = {
  participantId: 'attempt-participant',
  newParticipantCode: 'attempt-new-code',
  newParticipantProfile: 'attempt-new-profile',
  taskId: 'attempt-task',
  outcome: 'attempt-outcome-completed',
  timeSeconds: 'attempt-time',
  errorCount: 'attempt-errors',
  observation: 'attempt-observation',
  feedback: 'attempt-feedback',
};

interface Props {
  heading: string;
  submitLabel: string;
  initial: AttemptInput;
  participants: Participant[];
  tasks: Task[];
  /** Returns field errors if the save was rejected, or null on success. */
  onSave: (input: AttemptInput) => FieldErrors<AttemptField> | null;
  onCancel: () => void;
}

export function AttemptForm({ heading, submitLabel, initial, participants, tasks, onSave, onCancel }: Props) {
  // A private draft; the study data only changes when Save succeeds.
  const [values, setValues] = useState<AttemptInput>(initial);
  const [errors, setErrors] = useState<FieldErrors<AttemptField>>({});
  const creatingParticipant = values.participantId === NEW_PARTICIPANT;

  function set<K extends AttemptField>(field: K, value: AttemptInput[K]) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function chooseParticipant(value: string) {
    setValues((v) => ({
      ...v,
      participantId: value,
      // Suggest the next free code the first time "new participant" is picked.
      newParticipantCode:
        value === NEW_PARTICIPANT && v.newParticipantCode === '' ? suggestParticipantCode(participants) : v.newParticipantCode,
    }));
    setErrors((e) => ({ ...e, participantId: undefined, newParticipantCode: undefined, taskId: undefined }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = onSave(values);
    if (result) {
      setErrors(result);
      focusFirstError(IDS, result);
    }
  }

  const outcomeErrorId = errors.outcome ? 'attempt-outcome-error' : undefined;

  return (
    <form className="form form-panel" onSubmit={handleSubmit} noValidate aria-labelledby="attempt-form-heading">
      <h3 id="attempt-form-heading">{heading}</h3>

      <div className="form-grid">
        <Field id={IDS.participantId} label="Participant" error={errors.participantId}>
          {(p) => (
            <select {...p} value={values.participantId} onChange={(e) => chooseParticipant(e.target.value)} autoFocus>
              <option value="">Choose a participant</option>
              {participants.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.code}
                  {participant.profile ? ` – ${participant.profile}` : ''}
                </option>
              ))}
              <option value={NEW_PARTICIPANT}>+ New anonymised participant</option>
            </select>
          )}
        </Field>
        <Field id={IDS.taskId} label="Task" error={errors.taskId}>
          {(p) => (
            <select {...p} value={values.taskId} onChange={(e) => set('taskId', e.target.value)}>
              <option value="">Choose a task</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.code} – {task.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {creatingParticipant && (
        <div className="form-grid form-grid-code">
          <Field id={IDS.newParticipantCode} label="New participant code" hint="Anonymised, e.g. P09" error={errors.newParticipantCode}>
            {(p) => (
              <input
                {...p}
                type="text"
                value={values.newParticipantCode}
                onChange={(e) => set('newParticipantCode', e.target.value)}
              />
            )}
          </Field>
          <Field
            id={IDS.newParticipantProfile}
            label="Profile"
            optional
            hint="Broad description only, e.g. “Postgraduate”. No names or contact details."
            error={errors.newParticipantProfile}
          >
            {(p) => (
              <input
                {...p}
                type="text"
                value={values.newParticipantProfile}
                onChange={(e) => set('newParticipantProfile', e.target.value)}
              />
            )}
          </Field>
        </div>
      )}

      <fieldset className="field fieldset" aria-describedby={outcomeErrorId}>
        <legend className="field-label">Outcome</legend>
        <div className="radio-row">
          <label className="radio">
            <input
              type="radio"
              id={IDS.outcome}
              name="attempt-outcome"
              value="completed"
              checked={values.outcome === 'completed'}
              onChange={() => set('outcome', 'completed')}
              aria-invalid={Boolean(errors.outcome)}
            />
            Completed successfully
          </label>
          <label className="radio">
            <input
              type="radio"
              name="attempt-outcome"
              value="not-completed"
              checked={values.outcome === 'not-completed'}
              onChange={() => set('outcome', 'not-completed')}
              aria-invalid={Boolean(errors.outcome)}
            />
            Not completed (gave up, wrong result or timed out)
          </label>
        </div>
        {errors.outcome && (
          <span id={outcomeErrorId} className="field-error">
            {errors.outcome}
          </span>
        )}
      </fieldset>

      <div className="form-grid">
        <Field
          id={IDS.timeSeconds}
          label="Time on task (seconds)"
          optional
          hint="Leave blank if not captured. Blank is not counted as zero."
          error={errors.timeSeconds}
        >
          {(p) => (
            <input
              {...p}
              type="text"
              inputMode="decimal"
              value={values.timeSeconds}
              onChange={(e) => set('timeSeconds', e.target.value)}
            />
          )}
        </Field>
        <Field id={IDS.errorCount} label="Errors" optional hint="Leave blank if errors were not coded." error={errors.errorCount}>
          {(p) => (
            <input
              {...p}
              type="text"
              inputMode="numeric"
              value={values.errorCount}
              onChange={(e) => set('errorCount', e.target.value)}
            />
          )}
        </Field>
      </div>

      <Field id={IDS.observation} label="Observation" optional hint="What the evaluator saw." error={errors.observation}>
        {(p) => <textarea {...p} rows={2} value={values.observation} onChange={(e) => set('observation', e.target.value)} />}
      </Field>
      <Field id={IDS.feedback} label="Participant feedback" optional hint="What the participant said." error={errors.feedback}>
        {(p) => <textarea {...p} rows={2} value={values.feedback} onChange={(e) => set('feedback', e.target.value)} />}
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
