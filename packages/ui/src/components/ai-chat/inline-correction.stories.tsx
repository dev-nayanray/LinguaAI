import type { Meta, StoryObj } from '@storybook/react-vite';

import { InlineCorrection } from './inline-correction';

const meta = {
  title: 'AI Chat/InlineCorrection',
  component: InlineCorrection,
  tags: ['autodocs'],
} satisfies Meta<typeof InlineCorrection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parts: [
      { text: 'goed', type: 'original' },
      { text: 'went', type: 'correction' },
    ],
  },
};

export const EmbeddedInASentence: Story = {
  args: { parts: [] },
  render: () => (
    <p className="type-body-md text-text">
      I{' '}
      <InlineCorrection
        parts={[
          { text: 'goed', type: 'original' },
          { text: 'went', type: 'correction' },
        ]}
      />{' '}
      to the store yesterday.
    </p>
  ),
};
