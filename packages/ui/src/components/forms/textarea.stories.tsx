import type { Meta, StoryObj } from '@storybook/react-vite';

import { FormField } from './form-field';
import { Textarea } from './textarea';

const meta = {
  title: 'Forms/Textarea',
  component: Textarea,
  tags: ['autodocs'],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <FormField label="Bio">
      <Textarea placeholder="Tell us about yourself" />
    </FormField>
  ),
};

export const Error: Story = {
  render: () => (
    <FormField label="Bio" error="Must be under 280 characters">
      <Textarea defaultValue={'x'.repeat(300)} />
    </FormField>
  ),
};

export const Disabled: Story = {
  render: () => (
    <FormField label="Bio" disabled>
      <Textarea defaultValue="Locked while your request is reviewed" disabled />
    </FormField>
  ),
};
