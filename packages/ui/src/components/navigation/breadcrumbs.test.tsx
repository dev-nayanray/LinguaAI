import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Breadcrumbs } from './breadcrumbs';

describe('Breadcrumbs', () => {
  it('renders every non-final item as a link and the final item as current, not a link', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Lessons', href: '/lessons' },
          { label: 'Greetings' },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Lessons' })).toHaveAttribute('href', '/lessons');
    expect(screen.queryByRole('link', { name: 'Greetings' })).not.toBeInTheDocument();

    const current = screen.getByText('Greetings');
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('treats the last item as current even if it has an href', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Lessons', href: '/lessons' },
        ]}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Lessons' })).not.toBeInTheDocument();
    expect(screen.getByText('Lessons')).toHaveAttribute('aria-current', 'page');
  });

  it('exposes a "Breadcrumb" navigation landmark', () => {
    render(<Breadcrumbs items={[{ label: 'Home' }]} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });
});
