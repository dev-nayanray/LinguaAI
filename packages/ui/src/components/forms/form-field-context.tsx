import * as React from 'react';

/**
 * Carries `FormField`'s generated id/aria wiring down to whichever control
 * is nested inside it (Input/Textarea/Combobox), so `aria-invalid`/
 * `aria-describedby` are wired automatically for the common case instead
 * of every consumer re-deriving them by hand (E3 §12.5: "wiring... is a T5
 * deliverable, not left implicit"). A control used outside any `FormField`
 * gets `undefined` here and falls back to whatever aria props it was given
 * directly — nothing requires a `FormField` ancestor.
 */
export interface FormFieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  disabled: boolean;
  required: boolean;
}

const FormFieldContext = React.createContext<FormFieldContextValue | undefined>(undefined);

export const FormFieldProvider = FormFieldContext.Provider;

export function useFormFieldContext(): FormFieldContextValue | undefined {
  return React.useContext(FormFieldContext);
}
