import * as React from 'react';

import { cn } from '@ui/lib/cn';

import { useFormFieldContext } from './form-field-context';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Same `FormField` auto-wiring as `Input` — see its doc comment. */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
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
      <textarea
        ref={ref}
        id={id ?? field?.id}
        disabled={disabled ?? field?.disabled}
        required={required ?? field?.required}
        aria-invalid={ariaInvalid ?? field?.invalid}
        aria-describedby={ariaDescribedBy ?? field?.describedBy}
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-border bg-surface px-3 py-2 ' +
            'type-body-sm text-text outline-none transition-colors duration-micro ' +
            'placeholder:text-neutral-text focus-visible:ring-2 focus-visible:ring-focus-ring ' +
            'focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border ' +
            'disabled:bg-disabled-bg disabled:text-disabled-text aria-[invalid=true]:border-danger-text',
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';
