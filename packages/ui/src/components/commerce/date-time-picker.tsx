import * as React from 'react';

import { cn } from '@ui/lib/cn';

import { FormField } from '../forms/form-field';
import { Input } from '../forms/input';

export interface DateTimePickerProps {
  /** The field's accessible name — also its visible `<label>` text (FormField). */
  label: string;
  /** ISO `yyyy-mm-dd` (date-only) or `yyyy-mm-ddThh:mm` (`includeTime`) — the native `<input>` value format either way. */
  value: string;
  onChange: (value: string) => void;
  /** Renders a single native `datetime-local` input instead of `date`. Default `false` — most callers (exam date, goal date) want a date only. */
  includeTime?: boolean;
  min?: string;
  max?: string;
  helpText?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
}

/**
 * E3 §12.4/§12.5 date/time picker — "native-input-backed where possible."
 * Built on the browser's own `date`/`datetime-local` input rather than a
 * hand-rolled ARIA date-picker (the contract's fallback pattern, only
 * needed when a native control can't satisfy the requirement): native
 * inputs already carry full keyboard support, locale-aware formatting, and
 * platform screen-reader support with zero bespoke ARIA, so no manual
 * screen-reader check is required (§12.5's table marks this row "No").
 */
export function DateTimePicker({
  label,
  value,
  onChange,
  includeTime = false,
  min,
  max,
  helpText,
  error,
  disabled = false,
  required = false,
  id,
  className,
}: DateTimePickerProps) {
  return (
    <FormField
      label={label}
      helpText={helpText}
      error={error}
      disabled={disabled}
      required={required}
      id={id}
      className={className}
    >
      <Input
        type={includeTime ? 'datetime-local' : 'date'}
        value={value}
        min={min}
        max={max}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        className={cn('w-full')}
      />
    </FormField>
  );
}
