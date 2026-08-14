import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme } from './theme-provider';

function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Toggle</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to light when there is no stored preference and the OS has none either', async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('light'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('respects a previously persisted theme choice over the OS preference', async () => {
    window.localStorage.setItem('linguaai-theme', 'dark');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggling persists the new choice and updates the document attribute', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('theme-value')).toHaveTextContent('light'));

    await user.click(screen.getByRole('button', { name: 'Toggle' }));

    expect(screen.getByTestId('theme-value')).toHaveTextContent('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('linguaai-theme')).toBe('dark');
  });

  it('useTheme throws outside of a ThemeProvider', () => {
    const OutsideProbe = () => {
      useTheme();
      return null;
    };
    expect(() => render(<OutsideProbe />)).toThrow('useTheme must be used within a ThemeProvider');
  });
});
