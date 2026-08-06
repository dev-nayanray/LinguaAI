import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Popover, PopoverContent, PopoverTrigger } from './popover';

describe('Popover', () => {
  it('reveals its content on trigger click', async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger>Filters</PopoverTrigger>
        <PopoverContent>Filter options go here.</PopoverContent>
      </Popover>,
    );

    expect(screen.queryByText('Filter options go here.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByText('Filter options go here.')).toBeInTheDocument();
  });
});
