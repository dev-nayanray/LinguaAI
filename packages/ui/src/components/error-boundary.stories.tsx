import type { Meta, StoryObj } from '@storybook/react-vite';
import { createLogger } from '@linguaai/observability';

import { ErrorBoundary } from './error-boundary';

// Uses the real createLogger (not a mock) so this story also proves the
// whole pipeline — packages/ui bundled for the browser, importing and
// calling into packages/observability's pino-based logger — actually
// works end to end, not just under vitest/jsdom with a mocked logger.
const logger = createLogger({ serviceName: 'storybook-ui' });

function Bomb(): never {
  throw new Error('Intentional error for the ErrorBoundary story');
}

const meta = {
  title: 'Components/ErrorBoundary',
  component: ErrorBoundary,
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recovered: Story = {
  args: {
    logger,
    children: <p>No error — this is the normal, recovered state.</p>,
  },
};

export const Caught: Story = {
  args: {
    logger,
    children: <Bomb />,
  },
};
