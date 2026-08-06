import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Button } from '../button';
import { StreamingTokenRenderer } from './streaming-token-renderer';

const TOKENS = ['The ', 'capital ', 'of ', 'France ', 'is ', 'Paris.'];

function StreamingDemo(props: { error?: boolean }) {
  const [index, setIndex] = useState(0);
  const content = TOKENS.slice(0, index).join('');

  return (
    <div className="flex flex-col gap-4">
      <StreamingTokenRenderer
        content={content}
        throttleMs={0}
        error={props.error ? { message: 'Connection lost', onRetry: () => setIndex(0) } : undefined}
      />
      <Button
        variant="secondary"
        className="w-fit"
        onClick={() => setIndex((i) => Math.min(i + 1, TOKENS.length))}
        disabled={index >= TOKENS.length}
      >
        Append next token
      </Button>
    </div>
  );
}

const meta = {
  title: 'AI Chat/StreamingTokenRenderer',
  component: StreamingDemo,
  tags: ['autodocs'],
} satisfies Meta<typeof StreamingDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const ErrorState: Story = {
  args: { error: true },
};

// E3 T10 evidence requirement (§20, §15): "a render-count assertion in
// its interaction test" — proves the append-only contract holds against
// the real component, not just the Vitest unit tests.
export const AppendOnlyRenderCount: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const appendButton = canvas.getByRole('button', { name: 'Append next token' });

    await userEvent.click(appendButton);
    // Scoped to the chunk itself — the sr-only live region mirrors the
    // same text, so an unscoped text query matches both.
    const firstChunk = canvasElement.querySelector('[data-chunk-index="0"]');
    expect(firstChunk).not.toBeNull();
    expect(firstChunk).toHaveTextContent('The');
    expect(firstChunk).toHaveAttribute('data-render-count', '1');

    await userEvent.click(appendButton);
    await userEvent.click(appendButton);

    // The first chunk is still on screen and still only rendered once —
    // appending later tokens did not re-render it.
    expect(firstChunk).toHaveAttribute('data-render-count', '1');
  },
};
