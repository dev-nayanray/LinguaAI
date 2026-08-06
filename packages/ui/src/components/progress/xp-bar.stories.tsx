import type { Meta, StoryObj } from '@storybook/react-vite';

import { XpBar } from './xp-bar';

const meta = {
  title: 'Progress/XpBar',
  component: XpBar,
  tags: ['autodocs'],
} satisfies Meta<typeof XpBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { current: 1250, max: 2000 },
};

export const NearlyFull: Story = {
  args: { current: 1900, max: 2000 },
};
