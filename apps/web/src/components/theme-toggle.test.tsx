import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ThemeProvider } from './theme-provider';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('switches the theme and its own accessible label when clicked', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = await screen.findByRole('button', { name: 'Switch to dark theme' });
    await user.click(button);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument(),
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
