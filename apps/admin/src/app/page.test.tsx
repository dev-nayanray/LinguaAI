import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import StatusPage from './page';

describe('StatusPage', () => {
  it('renders the app name and a running-status indicator', () => {
    render(<StatusPage />);

    expect(screen.getByRole('heading', { name: 'LinguaAI Admin' })).toBeInTheDocument();
    expect(screen.getByText('apps/admin is running')).toBeInTheDocument();
  });

  it('renders a packages/ui Button component', () => {
    render(<StatusPage />);

    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('bg-primary');
  });
});
