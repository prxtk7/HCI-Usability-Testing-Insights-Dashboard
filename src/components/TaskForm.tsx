import { useState, type FormEvent } from 'react';
import type { FieldErrors, TaskField, TaskInput } from '../lib/studyEditing';
import { Field, focusFirstError } from './forms';

const IDS: Record<TaskField, string> = {
  code: 'task-code',
  name: 'task-name',
  description: 'task-description',
  expectedOutcome: 'task-outcome',
};

interface Props {
  heading: string;
  submitLabel: string;
  initial: TaskInput;
  /** Returns field errors if the save was rejected, or null on success. */
  onSave: (input: TaskInput) => FieldErrors<TaskField> | null;
  onCancel: () => void;
}

export function TaskForm({ heading, submitLabel, initial, onSave, onCancel }: Props) {
  const [values, setValues] = useState<TaskInput>(initial);
  const [errors, setErrors] = useState<FieldErrors<TaskField>>({});

  function set(field: TaskField, value: string) {
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

  return (
    <form className="form form-panel" onSubmit={handleSubmit} noValidate aria-labelledby="task-form-heading">
      <h3 id="task-form-heading">{heading}</h3>

      <div className="form-grid form-grid-code">
        <Field id={IDS.code} label="Code" hint="Short label, e.g. T6" error={errors.code}>
          {(p) => <input {...p} type="text" value={values.code} onChange={(e) => set('code', e.target.value)} autoFocus />}
        </Field>
        <Field id={IDS.name} label="Task name" error={errors.name}>
          {(p) => <input {...p} type="text" value={values.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
      </div>
      <Field id={IDS.description} label="Description" hint="Instructions given to participants" optional error={errors.description}>
        {(p) => <textarea {...p} rows={2} value={values.description} onChange={(e) => set('description', e.target.value)} />}
      </Field>
      <Field id={IDS.expectedOutcome} label="Expected outcome" hint="What counts as success?" error={errors.expectedOutcome}>
        {(p) => (
          <textarea {...p} rows={2} value={values.expectedOutcome} onChange={(e) => set('expectedOutcome', e.target.value)} />
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
