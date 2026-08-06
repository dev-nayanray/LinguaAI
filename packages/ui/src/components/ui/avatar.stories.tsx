import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar } from './avatar';

const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  tags: ['autodocs'],
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {
  args: { name: 'Ada Lovelace' },
};

// A tiny inline SVG data URI, not a live network request — the harness
// that runs these stories (E3 T15's Storybook test-runner) is headless
// and shouldn't depend on external network availability to pass.
const PLACEHOLDER_AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#7c3aed"/></svg>',
  );

export const Image: Story = {
  args: { name: 'Ada Lovelace', src: PLACEHOLDER_AVATAR },
};

export const Sizes: Story = {
  args: { name: 'Ada Lovelace' },
  render: (args) => (
    <div className="flex items-center gap-4">
      <Avatar {...args} size="sm" />
      <Avatar {...args} size="md" />
      <Avatar {...args} size="lg" />
    </div>
  ),
};
