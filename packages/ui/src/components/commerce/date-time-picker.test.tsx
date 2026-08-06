import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DateTimePicker, type DateTimePickerProps } from './date-time-picker';

function Demo(overrides: Partial<DateTimePickerProps> = {}) {
  const [value, setValue] = useState(overrides.value ?? '');
  return (
    <DateTimePicker
      label="Exam date"
      value={value}
      onChange={(next) => {
        setValue(next);
        overrides.onChange?.(next);
      }}
      {...overrides}
    />
  );
}

describe('DateTimePicker', () => {
  it('renders a native date input by default, labeled by its FormField label', () => {
    render(<Demo />);
    const input = screen.getByLabelText('Exam date');
    expect(input).toHaveAttribute('type', 'date');
  });

  it('renders a native datetime-local input when includeTime is set', () => {
    render(<Demo includeTime />);
    expect(screen.getByLabelText('Exam date')).toHaveAttribute('type', 'datetime-local');
  });

  it('calls onChange with the new value on user input', () => {
    const onChange = vi.fn();
    render(<Demo onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Exam date'), { target: { value: '2026-09-01' } });
    expect(onChange).toHaveBeenCalledWith('2026-09-01');
  });

  it('applies min/max constraints', () => {
    render(<Demo min="2026-01-01" max="2026-12-31" />);
    const input = screen.getByLabelText('Exam date');
    expect(input).toHaveAttribute('min', '2026-01-01');
    expect(input).toHaveAttribute('max', '2026-12-31');
  });

  it('marks the input invalid and shows the error text', () => {
    render(<Demo error="Date is required" />);
    expect(screen.getByLabelText('Exam date')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Date is required');
  });

  it('disables the input when disabled', () => {
    render(<Demo disabled />);
    expect(screen.getByLabelText('Exam date')).toBeDisabled();
  });

  it('renders help text when no error is present', () => {
    render(<Demo helpText="Used to schedule your reminder" />);
    expect(screen.getByText('Used to schedule your reminder')).toBeInTheDocument();
  });
});
