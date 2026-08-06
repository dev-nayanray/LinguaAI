import type { Meta, StoryObj } from '@storybook/react-vite';

import { Sidebar } from './sidebar';

const items = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/lessons', label: 'Lessons' },
  { href: '/progress', label: 'Progress' },
  { href: '/profile', label: 'Profile' },
];

const meta = {
  title: 'Navigation/Sidebar',
  component: Sidebar,
  tags: ['autodocs'],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { items, activeHref: '/lessons' },
};

export const WithHeaderAndFooter: Story = {
  args: {
    items,
    activeHref: '/dashboard',
    header: <span className="type-heading-md text-text">LinguaAI</span>,
    footer: <span className="type-caption text-neutral-text">v1.0</span>,
  },
};
