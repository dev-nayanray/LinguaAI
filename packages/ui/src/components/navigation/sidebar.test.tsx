import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sidebar } from './sidebar';

const items = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/lessons', label: 'Lessons' },
];

describe('Sidebar', () => {
  it('exposes a "Sidebar" navigation landmark with every item linked', () => {
    render(<Sidebar items={items} activeHref="/dashboard" />);
    const nav = screen.getByRole('navigation', { name: 'Sidebar' });
    expect(nav).toBeInTheDocument();
    for (const item of items) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
    }
  });

  it('marks only the active item with aria-current="page"', () => {
    render(<Sidebar items={items} activeHref="/dashboard" />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Lessons' })).not.toHaveAttribute('aria-current');
  });

  it('renders optional header and footer slots', () => {
    render(
      <Sidebar
        items={items}
        activeHref="/dashboard"
        header={<span>LinguaAI</span>}
        footer={<span>v1.0</span>}
      />,
    );
    expect(screen.getByText('LinguaAI')).toBeInTheDocument();
    expect(screen.getByText('v1.0')).toBeInTheDocument();
  });
});
