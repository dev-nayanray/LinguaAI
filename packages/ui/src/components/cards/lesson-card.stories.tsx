import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button';
import { LessonCard } from './lesson-card';

const meta = {
  title: 'Cards/LessonCard',
  component: LessonCard,
  tags: ['autodocs'],
  argTypes: {
    status: { control: 'select', options: ['not-started', 'in-progress', 'completed'] },
  },
} satisfies Meta<typeof LessonCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotStarted: Story = {
  args: {
    title: 'Greetings',
    description: 'Say hello and introduce yourself',
    status: 'not-started',
  },
};

export const InProgress: Story = {
  args: {
    title: 'Ordering food',
    description: 'Ask for a table and order a meal',
    status: 'in-progress',
  },
};

export const Completed: Story = {
  args: {
    title: 'Numbers 1-20',
    description: 'Count and use numbers in conversation',
    status: 'completed',
  },
};

export const WithFooterAction: Story = {
  args: {
    title: 'Greetings',
    description: 'Say hello and introduce yourself',
    status: 'not-started',
    footer: <Button variant="primary">Start lesson</Button>,
  },
};

export const Loading: Story = {
  args: { title: 'Greetings', status: 'not-started', loading: true },
};
