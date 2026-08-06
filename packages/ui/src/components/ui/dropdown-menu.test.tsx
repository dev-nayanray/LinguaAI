import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from './dropdown-menu';

describe('DropdownMenu', () => {
  it('opens on trigger click and fires onSelect for a clicked item', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>
            Rename
            <DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    const item = await screen.findByRole('menuitem', { name: /Rename/ });

    await user.click(item);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('toggles a checkbox item, closing the menu on selection (Radix default)', async () => {
    const onCheckedChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>View</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Display</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked={false} onCheckedChange={onCheckedChange}>
            Show hidden files
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByText('Display')).toBeInTheDocument();

    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Show hidden files' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('reflects the active choice in a radio group, separated from the items above it', async () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>View</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value="grid">
            <DropdownMenuRadioItem value="grid">Grid</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="list">List</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const gridOption = await screen.findByRole('menuitemradio', { name: 'Grid' });
    const listOption = screen.getByRole('menuitemradio', { name: 'List' });
    expect(gridOption).toHaveAttribute('aria-checked', 'true');
    expect(listOption).toHaveAttribute('aria-checked', 'false');
  });
});
