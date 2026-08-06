import * as React from 'react';

import { cn } from '@ui/lib/cn';

import { useFormFieldContext } from './form-field-context';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Reads id/aria-invalid/aria-describedby/disabled/required from an
 * ancestor `FormField` automatically when nested inside one (falls back to
 * whatever was passed directly otherwise) — see FormField's composition
 * rule.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      id,
      disabled,
      required,
      'aria-invalid': ariaInvalid,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref,
  ) => {
    const field = useFormFieldContext();

    return (
      <input
        ref={ref}
        id={id ?? field?.id}
        disabled={disabled ?? field?.disabled}
        required={required ?? field?.required}
        aria-invalid={ariaInvalid ?? field?.invalid}
        aria-describedby={ariaDescribedBy ?? field?.describedBy}
        className={cn(
          'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 type-body-sm ' +
            'text-text outline-none transition-colors duration-micro placeholder:text-neutral-text ' +
            'focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ' +
            'disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg ' +
            'disabled:text-disabled-text aria-[invalid=true]:border-danger-text',
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
