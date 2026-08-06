import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button';
import { TopNav } from './top-nav';

const items = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/lessons', label: 'Lessons' },
  { href: '/profile', label: 'Profile' },
];

const meta = {
  title: 'Navigation/TopNav',
  component: TopNav,
  tags: ['autodocs'],
} satisfies Meta<typeof TopNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { items, activeHref: '/lessons' },
};

export const WithBrandAndActions: Story = {
  args: {
    items,
    activeHref: '/dashboard',
    brand: <span className="type-heading-md text-text">LinguaAI</span>,
    actions: <Button variant="secondary">Log out</Button>,
  },
};

// E3 T8 evidence requirement (§20): an interaction test exercising
// keyboard navigation. TopNav's items are plain links in a landmark, not a
// composite ARIA widget (unlike Tabs' roving tabindex) — Tab moves through
// them in document order using native browser behavior, which this test
// verifies actually holds for the rendered markup.
export const KeyboardNavigation: Story = {
  args: { items, activeHref: '/lessons' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.tab();
    expect(canvas.getByRole('link', { name: 'Dashboard' })).toHaveFocus();

    await userEvent.tab();
    expect(canvas.getByRole('link', { name: 'Lessons' })).toHaveFocus();

    await userEvent.tab();
    expect(canvas.getByRole('link', { name: 'Profile' })).toHaveFocus();
  },
};
