import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';

describe('Select', () => {
  it('opens on trigger click and updates the displayed value on item selection', async () => {
    const user = userEvent.setup();
    render(
      <Select>
        <SelectTrigger aria-label="Language">
          <SelectValue placeholder="Choose a language" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Popular</SelectLabel>
            <SelectItem value="es">Spanish</SelectItem>
            <SelectItem value="fr">French</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectItem value="de">German</SelectItem>
        </SelectContent>
      </Select>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Language' }));
    const option = await screen.findByRole('option', { name: 'Spanish' });
    await user.click(option);

    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveTextContent('Spanish');
  });
});
