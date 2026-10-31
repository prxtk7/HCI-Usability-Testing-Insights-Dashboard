import { useState, type FormEvent } from 'react';
import type { Study } from '../types';
import {
  STUDY_STATUSES,
  studyToInput,
  type FieldErrors,
  type StudyDetailsInput,
  type StudyField,
} from '../lib/studyEditing';
import { Field, focusFirstError } from './forms';

const IDS: Record<StudyField, string> = {
  title: 'study-title',
  product: 'study-product',
  purpose: 'study-purpose',
  method: 'study-method',
  status: 'study-status',
  startDate: 'study-start',
  endDate: 'study-end',
};

interface Props {
  study: Study;
  /** Returns field errors if the save was rejected, or null on success. */
  onSave: (input: StudyDetailsInput) => FieldErrors<StudyField> | null;
  onCancel: () => void;
}

export function StudyDetailsForm({ study, onSave, onCancel }: Props) {
  // A private copy of the values; nothing outside changes until Save succeeds.
  const [values, setValues] = useState<StudyDetailsInput>(() => studyToInput(study));
  const [errors, setErrors] = useState<FieldErrors<StudyField>>({});

  function set(field: StudyField, value: string) {
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
    <form className="form" onSubmit={handleSubmit} noValidate aria-label="Edit study details">
      <Field id={IDS.title} label="Study title" error={errors.title}>
        {(p) => <input {...p} type="text" value={values.title} onChange={(e) => set('title', e.target.value)} autoFocus />}
      </Field>
      <Field id={IDS.product} label="Product or service" error={errors.product}>
        {(p) => <input {...p} type="text" value={values.product} onChange={(e) => set('product', e.target.value)} />}
      </Field>
      <Field id={IDS.purpose} label="Purpose" error={errors.purpose}>
        {(p) => <textarea {...p} rows={3} value={values.purpose} onChange={(e) => set('purpose', e.target.value)} />}
      </Field>
      <Field id={IDS.method} label="Method" hint="For example: moderated remote testing, 8 participants." error={errors.method}>
        {(p) => <textarea {...p} rows={2} value={values.method} onChange={(e) => set('method', e.target.value)} />}
      </Field>

      <div className="form-grid">
        <Field id={IDS.status} label="Status" error={errors.status}>
          {(p) => (
            <select {...p} value={values.status} onChange={(e) => set('status', e.target.value)}>
              {STUDY_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id={IDS.startDate} label="Start date" error={errors.startDate}>
          {(p) => <input {...p} type="date" value={values.startDate} onChange={(e) => set('startDate', e.target.value)} />}
        </Field>
        <Field id={IDS.endDate} label="End date" optional error={errors.endDate}>
          {(p) => <input {...p} type="date" value={values.endDate} onChange={(e) => set('endDate', e.target.value)} />}
        </Field>
      </div>

      <div className="button-row">
        <button type="submit" className="button button-primary">
          Save study details
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
