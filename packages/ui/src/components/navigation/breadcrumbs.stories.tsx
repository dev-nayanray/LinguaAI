import type { Meta, StoryObj } from '@storybook/react-vite';

import { Breadcrumbs } from './breadcrumbs';

const meta = {
  title: 'Navigation/Breadcrumbs',
  component: Breadcrumbs,
  tags: ['autodocs'],
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items: [
      { label: 'Home', href: '/' },
      { label: 'Lessons', href: '/lessons' },
      { label: 'Greetings' },
    ],
  },
};

export const TwoLevels: Story = {
  args: {
    items: [{ label: 'Home', href: '/' }, { label: 'Profile' }],
  },
};
