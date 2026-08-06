import type { Meta, StoryObj } from '@storybook/react-vite';

import { FormField } from './form-field';
import { Input } from './input';

const meta = {
  title: 'Forms/Input',
  component: Input,
  tags: ['autodocs'],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: 'you@example.com' },
  render: (args) => (
    <FormField label="Email">
      <Input {...args} />
    </FormField>
  ),
};

export const WithHelpText: Story = {
  render: () => (
    <FormField label="Username" helpText="3-20 characters, letters and numbers only">
      <Input placeholder="ada_lovelace" />
    </FormField>
  ),
};

export const Error: Story = {
  render: () => (
    <FormField label="Username" helpText="3-20 characters" error="This username is taken">
      <Input defaultValue="taken_name" />
    </FormField>
  ),
};

export const Disabled: Story = {
  render: () => (
    <FormField label="Plan" disabled>
      <Input defaultValue="Enterprise" disabled />
    </FormField>
  ),
};

export const Required: Story = {
  render: () => (
    <FormField label="Full name" required>
      <Input placeholder="Jane Doe" />
    </FormField>
  ),
};
