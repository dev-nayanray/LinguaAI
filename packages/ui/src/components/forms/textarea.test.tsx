import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FormField } from './form-field';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('accepts typed text', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Bio" />);

    const textarea = screen.getByRole('textbox', { name: 'Bio' });
    await user.type(textarea, 'Hello world');
    expect(textarea).toHaveValue('Hello world');
  });

  it('picks up id/aria-invalid/aria-describedby from an ancestor FormField', () => {
    render(
      <FormField label="Bio" error="Too long">
        <Textarea />
      </FormField>,
    );
    const textarea = screen.getByLabelText('Bio');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAccessibleDescription('Too long');
  });
});
