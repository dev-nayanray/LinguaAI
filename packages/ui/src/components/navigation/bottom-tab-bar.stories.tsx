import type { Meta, StoryObj } from '@storybook/react-vite';

import { BottomTabBar } from './bottom-tab-bar';

const items = [
  { href: '/dashboard', label: 'Home' },
  { href: '/lessons', label: 'Lessons' },
  { href: '/progress', label: 'Progress' },
  { href: '/profile', label: 'Profile' },
];

const meta = {
  title: 'Navigation/BottomTabBar',
  component: BottomTabBar,
  tags: ['autodocs'],
} satisfies Meta<typeof BottomTabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

// `fixed inset-x-0 bottom-0` (the real mobile behavior) docks to
// Storybook's own preview iframe edge here, same as it would to the
// browser viewport in a real app — expected, not a story bug.
export const Default: Story = {
  args: { items, activeHref: '/lessons' },
};
