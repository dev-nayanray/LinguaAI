import type { Meta, StoryObj } from '@storybook/react-vite';

import { CefrBadge } from './cefr-badge';

const meta = {
  title: 'Progress/CefrBadge',
  component: CefrBadge,
  tags: ['autodocs'],
  argTypes: {
    level: { control: 'select', options: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] },
  },
} satisfies Meta<typeof CefrBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { level: 'B1' },
};

export const AllLevels: Story = {
  args: { level: 'A1' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <CefrBadge level="A1" />
      <CefrBadge level="A2" />
      <CefrBadge level="B1" />
      <CefrBadge level="B2" />
      <CefrBadge level="C1" />
      <CefrBadge level="C2" />
    </div>
  ),
};
