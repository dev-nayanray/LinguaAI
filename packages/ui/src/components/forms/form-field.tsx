import * as React from 'react';

import { cn } from '@ui/lib/cn';

import { FormFieldProvider, type FormFieldContextValue } from './form-field-context';

export interface FormFieldProps {
  /** Rendered as a `<label>` wired to the nested control via `htmlFor`. */
  label?: string;
  /** Shown below the control. Hidden while `error` is set — see composition rule below. */
  helpText?: string;
  /** A pre-parsed, already-user-facing message (§6 of the E3 design document — `packages/ui` takes no `packages/validation` dependency; the caller resolves Zod errors to a string first). Setting this also marks the nested control `aria-invalid`. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Overrides the generated id. Only needed when something outside this `FormField` (e.g. a second, unrelated label) must reference the control's id directly. */
  id?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Composition rule: exactly one focusable control is expected as `children`
 * — Input/Textarea/Combobox all read their id/aria-invalid/aria-describedby
 * from this component's context automatically (`useFormFieldContext`).
 * `helpText` and `error` are mutually exclusive in the rendered output
 * (error takes priority) to avoid stacking two caption lines under every
 * field; the error's text still fully replaces the help text's meaning
 * when present, so nothing described by the help text is silently lost —
 * it becomes visible again once `error` clears.
 */
export function FormField({
  label,
  helpText,
  error,
  required = false,
  disabled = false,
  id: idProp,
  className,
  children,
}: FormFieldProps) {
  const generatedId = React.useId();
  const id = idProp ?? generatedId;
  // Ids are only defined when the corresponding paragraph actually renders
  // below (error takes priority over help text) — `aria-describedby` must
  // never reference an id that isn't in the DOM.
  const helpTextId = helpText && !error ? `${id}-help` : undefined;
  const errorTextId = error ? `${id}-error` : undefined;
  const describedBy = [errorTextId, helpTextId].filter(Boolean).join(' ') || undefined;

  const contextValue = React.useMemo<FormFieldContextValue>(
    () => ({ id, describedBy, invalid: Boolean(error), disabled, required }),
    [id, describedBy, error, disabled, required],
  );

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={id}
          className={cn('type-body-sm font-medium text-text', disabled && 'opacity-50')}
        >
          {label}
          {required && (
            <span aria-hidden="true" className="text-danger-text">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      <FormFieldProvider value={contextValue}>{children}</FormFieldProvider>
      {helpText && !error && (
        <p id={helpTextId} className="type-caption text-neutral-text">
          {helpText}
        </p>
      )}
      {error && (
        <p id={errorTextId} role="alert" className="type-caption text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
