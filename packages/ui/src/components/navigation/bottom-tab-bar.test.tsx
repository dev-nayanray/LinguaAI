import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BottomTabBar } from './bottom-tab-bar';

const items = [
  { href: '/dashboard', label: 'Home' },
  { href: '/lessons', label: 'Lessons' },
  { href: '/profile', label: 'Profile' },
];

describe('BottomTabBar', () => {
  it('exposes a "Bottom navigation" landmark with every item linked', () => {
    render(<BottomTabBar items={items} activeHref="/dashboard" />);
    expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeInTheDocument();
    for (const item of items) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
    }
  });

  it('marks only the active item with aria-current="page"', () => {
    render(<BottomTabBar items={items} activeHref="/profile" />);
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Lessons' })).not.toHaveAttribute('aria-current');
  });
});
