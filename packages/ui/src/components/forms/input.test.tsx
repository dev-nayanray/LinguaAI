import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FormField } from './form-field';
import { Input } from './input';

describe('Input', () => {
  it('accepts typed text and forwards standard input props', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Name" placeholder="Jane Doe" />);

    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAttribute('placeholder', 'Jane Doe');

    await user.type(input, 'Ada Lovelace');
    expect(input).toHaveValue('Ada Lovelace');
  });

  it('works standalone (no FormField ancestor) with explicit aria props', () => {
    render(<Input aria-label="Standalone" aria-invalid />);
    expect(screen.getByRole('textbox', { name: 'Standalone' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('lets an explicit prop override the FormField-derived value', () => {
    render(
      <FormField label="Age" disabled>
        <Input disabled={false} />
      </FormField>,
    );
    expect(screen.getByLabelText('Age')).not.toBeDisabled();
  });
});
