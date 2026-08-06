import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormField } from './form-field';
import { Input } from './input';

describe('FormField', () => {
  it('associates the label with the nested control via a generated id', () => {
    render(
      <FormField label="Email">
        <Input />
      </FormField>,
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('wires aria-describedby to the help text when there is no error', () => {
    render(
      <FormField label="Username" helpText="3-20 characters">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Username');
    const helpText = screen.getByText('3-20 characters');
    expect(input).toHaveAttribute('aria-describedby', helpText.id);
    expect(input).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('wires aria-invalid + aria-describedby to the error text, hiding help text', () => {
    render(
      <FormField label="Username" helpText="3-20 characters" error="Username is taken">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Username');
    const errorText = screen.getByRole('alert');

    expect(errorText).toHaveTextContent('Username is taken');
    expect(screen.queryByText('3-20 characters')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', errorText.id);
  });

  it('propagates required and disabled to the nested control', () => {
    render(
      <FormField label="Country" required disabled>
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText(/Country/);
    expect(input).toBeRequired();
    expect(input).toBeDisabled();
  });
});
