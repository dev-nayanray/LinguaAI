import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, within } from 'storybook/test';

import { DateTimePicker, type DateTimePickerProps } from './date-time-picker';

function Demo(props: Partial<DateTimePickerProps>) {
  const [value, setValue] = useState(props.value ?? '');
  return <DateTimePicker label="Exam date" value={value} onChange={setValue} {...props} />;
}

const meta = {
  title: 'Commerce/DateTimePicker',
  component: Demo,
  tags: ['autodocs'],
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DateOnly: Story = {
  render: () => <Demo />,
};

export const WithTime: Story = {
  render: () => <Demo includeTime />,
};

export const WithHelpText: Story = {
  render: () => <Demo helpText="We'll remind you a week before." />,
};

export const WithError: Story = {
  render: () => <Demo error="Please choose a future date." />,
};

export const Disabled: Story = {
  render: () => <Demo disabled value="2026-09-01" />,
};

export const UpdatesOnInput: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Exam date') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '2026-09-15' } });

    expect(input).toHaveValue('2026-09-15');
  },
};
