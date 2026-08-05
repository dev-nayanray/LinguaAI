import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import StatusPage from './page';

describe('StatusPage', () => {
  it('renders the app name and a running-status indicator', () => {
    render(<StatusPage />);

    expect(screen.getByRole('heading', { name: 'LinguaAI' })).toBeInTheDocument();
    expect(screen.getByText('apps/web is running')).toBeInTheDocument();
  });

  it('renders a packages/ui Button component', () => {
    render(<StatusPage />);

    const button = screen.getByRole('button', { name: 'Get started' });
    expect(button).toBeInTheDocument();
    // Proves the token pipeline is live, not just that some button exists.
    expect(button.className).toContain('bg-primary');
  });
});
