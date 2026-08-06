import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { RadioGroup, RadioGroupItem } from './radio-group';

describe('RadioGroup', () => {
  it('allows only one item selected at a time', async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup aria-label="Plan" defaultValue="monthly">
        <RadioGroupItem value="monthly" aria-label="Monthly" />
        <RadioGroupItem value="annual" aria-label="Annual" />
      </RadioGroup>,
    );

    const monthly = screen.getByRole('radio', { name: 'Monthly' });
    const annual = screen.getByRole('radio', { name: 'Annual' });
    expect(monthly).toBeChecked();
    expect(annual).not.toBeChecked();

    await user.click(annual);
    expect(annual).toBeChecked();
    expect(monthly).not.toBeChecked();
  });
});
