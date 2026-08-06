import * as React from 'react';

import { Check, ChevronDown } from '@ui/icons';
import { scaleTransition } from '@ui/lib/animation';
import { cn } from '@ui/lib/cn';

import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover';
import { useFormFieldContext } from './form-field-context';

/**
 * E3 §12.4 Combobox contract: full ARIA 1.2 combobox pattern —
 * `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`
 * with focus never leaving the input. No dedicated Radix primitive exists
 * for this (§6c); it's hand-composed on `Popover` for positioning/dismiss
 * only — `onOpenAutoFocus`/`onCloseAutoFocus` are both suppressed below so
 * Radix never moves real DOM focus into the popover content, which is what
 * the ARIA pattern requires (the "active" option is a virtual, id-referenced
 * highlight, not a focus target).
 *
 * The design document states props generically as `options: T[]`, `value`,
 * `onChange`; `getOptionLabel`/`getOptionValue` are this implementation's
 * own necessary addition — a generic `T` can't otherwise be rendered or
 * matched against a string id.
 */
export interface ComboboxProps<T> {
  options: T[];
  value: T | null;
  onChange: (value: T | null) => void;
  getOptionLabel: (option: T) => string;
  getOptionValue: (option: T) => string;
  loading?: boolean;
  /** Shown when there are zero results after filtering (not a fetch failure — see `error`). */
  emptyMessage?: string;
  /** A fetch failure, pre-parsed to a string (§6 — no `packages/validation` dependency), rendered in place of the option list. */
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Used only when this Combobox has no ancestor `FormField` to supply a label association. */
  'aria-label'?: string;
  id?: string;
  className?: string;
}

export function Combobox<T>({
  options,
  value,
  onChange,
  getOptionLabel,
  getOptionValue,
  loading = false,
  emptyMessage = 'No results',
  error,
  disabled = false,
  placeholder,
  'aria-label': ariaLabel,
  id: idProp,
  className,
}: ComboboxProps<T>) {
  const field = useFormFieldContext();
  const generatedId = React.useId();
  const id = idProp ?? field?.id ?? generatedId;
  const listboxId = `${id}-listbox`;
  const isDisabled = disabled || field?.disabled || false;
  const isInvalid = Boolean(error) || field?.invalid || false;

  const selectedLabel = value ? getOptionLabel(value) : '';
  const [inputValue, setInputValue] = React.useState(selectedLabel);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);

  // Keep the displayed text in sync with an externally-changed `value`
  // (e.g. the caller resets selection) while the popover is closed — never
  // stomp on text the user is actively typing.
  React.useEffect(() => {
    if (!open) {
      setInputValue(selectedLabel);
    }
    // Intentionally excludes `open` — this must re-sync only when the
    // committed value's label changes, not fire again on every open/close
    // toggle (that would stomp in-progress typing the moment the popover
    // opens).
  }, [selectedLabel]);

  // Once the field is "dirty" (typed text no longer matches the committed
  // selection), filter by it; otherwise show the full list — so opening
  // the list by clicking/focusing shows every option, not just the one
  // matching the already-selected label.
  const isDirty = inputValue !== selectedLabel;
  const filteredOptions = React.useMemo(() => {
    if (!isDirty || inputValue === '') return options;
    const needle = inputValue.toLowerCase();
    return options.filter((option) => getOptionLabel(option).toLowerCase().includes(needle));
  }, [options, inputValue, isDirty, getOptionLabel]);

  const showList = open && !isDisabled;
  const activeOption = activeIndex >= 0 ? filteredOptions[activeIndex] : undefined;
  const activeOptionId =
    activeOption !== undefined ? `${listboxId}-option-${getOptionValue(activeOption)}` : undefined;

  function commit(option: T) {
    onChange(option);
    setInputValue(getOptionLabel(option));
    setOpen(false);
    setActiveIndex(-1);
  }

  function revert() {
    setInputValue(selectedLabel);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (isDisabled) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(filteredOptions.length > 0 ? 0 : -1);
        return;
      }
      setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return;
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      if (open && activeOption !== undefined) {
        event.preventDefault();
        commit(activeOption);
      }
      return;
    }

    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        revert();
      }
    }
  }

  return (
    <Popover open={showList} onOpenChange={(next) => !next && revert()}>
      <PopoverAnchor asChild>
        <div className={cn('relative', className)}>
          <input
            id={id}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-invalid={isInvalid}
            aria-describedby={field?.describedBy}
            aria-label={field ? undefined : ariaLabel}
            autoComplete="off"
            disabled={isDisabled}
            required={field?.required}
            placeholder={placeholder}
            value={inputValue}
            onChange={(event) => {
              setInputValue(event.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => !isDisabled && setOpen(true)}
            onBlur={() => open && revert()}
            onKeyDown={handleKeyDown}
            className={cn(
              'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 pr-8 type-body-sm ' +
                'text-text outline-none transition-colors duration-micro placeholder:text-neutral-text ' +
                'focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ' +
                'disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled-bg ' +
                'disabled:text-disabled-text aria-[invalid=true]:border-danger-text',
            )}
          />
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className={cn(
          'z-dropdown w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-lg border ' +
            'border-border bg-surface-elevated p-1 shadow-high',
          scaleTransition,
        )}
      >
        <ul id={listboxId} role="listbox" className="max-h-60 overflow-auto">
          {loading && (
            <li className="px-2 py-1.5 type-body-sm text-neutral-text" aria-live="polite">
              Loading…
            </li>
          )}
          {!loading && error && (
            <li role="alert" className="px-2 py-1.5 type-body-sm text-danger-text">
              {error}
            </li>
          )}
          {!loading && !error && filteredOptions.length === 0 && (
            <li className="px-2 py-1.5 type-body-sm text-neutral-text">{emptyMessage}</li>
          )}
          {!loading &&
            !error &&
            filteredOptions.map((option, index) => {
              const optionValue = getOptionValue(option);
              const selected = value !== null && getOptionValue(value) === optionValue;
              return (
                <li
                  key={optionValue}
                  id={`${listboxId}-option-${optionValue}`}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => {
                    // Prevent the input's onBlur (mousedown fires first)
                    // from reverting before onClick's commit runs.
                    event.preventDefault();
                  }}
                  onClick={() => commit(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 ' +
                      'type-body-sm text-text',
                    index === activeIndex && 'bg-surface-muted',
                  )}
                >
                  <span className="flex h-3.5 w-3.5 items-center justify-center">
                    {selected && <Check className="h-4 w-4" />}
                  </span>
                  {getOptionLabel(option)}
                </li>
              );
            })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
