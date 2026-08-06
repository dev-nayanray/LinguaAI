import type { Meta, StoryObj } from '@storybook/react-vite';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

const meta = {
  title: 'Cards/Card',
  component: Card,
  tags: ['autodocs'],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Spanish A1</CardTitle>
        <CardDescription>Beginner course — 12 lessons</CardDescription>
      </CardHeader>
      <CardContent>Start with greetings and everyday phrases.</CardContent>
      <CardFooter>Continue</CardFooter>
    </Card>
  ),
};
