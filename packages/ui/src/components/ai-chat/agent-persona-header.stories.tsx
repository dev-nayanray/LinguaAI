import type { Meta, StoryObj } from '@storybook/react-vite';

import { AgentPersonaHeader } from './agent-persona-header';

const meta = {
  title: 'AI Chat/AgentPersonaHeader',
  component: AgentPersonaHeader,
  tags: ['autodocs'],
} satisfies Meta<typeof AgentPersonaHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { name: 'Luma', title: 'AI Language Tutor' },
};

export const NameOnly: Story = {
  args: { name: 'Luma' },
};
