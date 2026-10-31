// Form field wrapper: label, optional hint, and an error message linked to the
// input via aria-describedby so screen readers announce it.

import { useEffect, useState, type ReactNode } from 'react';

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  /** Renders the control. Spread the given props onto the input element. */
  children: (control: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}

export function Field({ id, label, error, hint, optional, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
        {optional && <span className="field-optional"> (optional)</span>}
      </label>
      {hint && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error && (
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

/** Moves focus to the first field with an error, in form order. */
export function focusFirstError(fieldIds: Record<string, string>, errors: Record<string, string | undefined>): void {
  const first = Object.keys(fieldIds).find((key) => errors[key]);
  if (first) document.getElementById(fieldIds[first]!)?.focus();
}

/**
 * Moves keyboard focus to an element (by id) after the next render, e.g. back
 * to the button that opened a form once the form closes.
 */
export function useFocusAfterRender(): (id: string) => void {
  const [request, setRequest] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (request) document.getElementById(request.id)?.focus();
  }, [request]);
  return (id) => setRequest({ id });
}
