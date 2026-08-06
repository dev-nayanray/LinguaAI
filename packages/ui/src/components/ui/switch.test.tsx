import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Switch } from './switch';

describe('Switch', () => {
  it('toggles on click', async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Notifications" />);

    const toggle = screen.getByRole('switch', { name: 'Notifications' });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    expect(toggle).toBeChecked();
  });
});
