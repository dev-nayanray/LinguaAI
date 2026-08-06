import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

describe('Tooltip', () => {
  it('appears on trigger focus, not only hover (keyboard-accessible)', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Icon button</TooltipTrigger>
          <TooltipContent>Delete this item</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.tab();

    expect(await screen.findByRole('tooltip', { name: 'Delete this item' })).toBeInTheDocument();
  });
});
