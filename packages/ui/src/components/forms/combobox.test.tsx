import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Combobox } from './combobox';

interface Language {
  code: string;
  name: string;
}

function requireElement(element: HTMLElement | undefined): HTMLElement {
  if (!element) throw new Error('Expected element to exist');
  return element;
}

const LANGUAGES: Language[] = [
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
];

function renderCombobox(overrides: Partial<ComponentProps<typeof Combobox<Language>>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <Combobox<Language>
      options={LANGUAGES}
      value={null}
      onChange={onChange}
      getOptionLabel={(l) => l.name}
      getOptionValue={(l) => l.code}
      aria-label="Language"
      {...overrides}
    />,
  );
  return { onChange, ...utils };
}

describe('Combobox', () => {
  it('renders a combobox input, closed by default', () => {
    renderCombobox();
    const input = screen.getByRole('combobox', { name: 'Language' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens on focus and shows the full option list', async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.click(screen.getByRole('combobox', { name: 'Language' }));

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filters options by typed text (typeahead)', async () => {
    const user = userEvent.setup();
    renderCombobox();

    await user.type(screen.getByRole('combobox', { name: 'Language' }), 'fr');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('French');
  });

  it('moves aria-activedescendant with the arrow keys without moving DOM focus off the input', async () => {
    const user = userEvent.setup();
    renderCombobox();

    const input = screen.getByRole('combobox', { name: 'Language' });
    await user.click(input);
    await user.keyboard('{ArrowDown}');

    const firstOption = requireElement(screen.getAllByRole('option')[0]);
    expect(input).toHaveAttribute('aria-activedescendant', firstOption.id);
    expect(input).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    const secondOption = requireElement(screen.getAllByRole('option')[1]);
    expect(input).toHaveAttribute('aria-activedescendant', secondOption.id);
    expect(input).toHaveFocus();
  });

  it('opens on ArrowDown from a closed, focused input, and ArrowUp moves the active option back', async () => {
    const user = userEvent.setup();
    renderCombobox();

    const input = screen.getByRole('combobox', { name: 'Language' });
    input.focus();
    await user.keyboard('{ArrowDown}');

    const options = screen.getAllByRole('option');
    const first = requireElement(options[0]);
    const second = requireElement(options[1]);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', first.id);

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', second.id);

    await user.keyboard('{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', first.id);
  });

  it('commits the active option on Enter and closes the list', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    const input = screen.getByRole('combobox', { name: 'Language' });
    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith(LANGUAGES[0]);
    expect(input).toHaveValue('Spanish');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('commits a clicked option', async () => {
    const user = userEvent.setup();
    const { onChange } = renderCombobox();

    await user.click(screen.getByRole('combobox', { name: 'Language' }));
    await user.click(screen.getByRole('option', { name: 'German' }));

    expect(onChange).toHaveBeenCalledWith(LANGUAGES[2]);
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('German');
  });

  it('Escape closes the list and reverts typed text without clearing the current value', async () => {
    const user = userEvent.setup();
    renderCombobox({ value: LANGUAGES[0] });

    const input = screen.getByRole('combobox', { name: 'Language' });
    expect(input).toHaveValue('Spanish');

    await user.click(input);
    await user.keyboard('xyz');
    expect(input).toHaveValue('Spanishxyz');

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Spanish');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('reopens with ArrowDown after Escape closed it, while the input stays focused throughout', async () => {
    const user = userEvent.setup();
    renderCombobox();

    const input = screen.getByRole('combobox', { name: 'Language' });
    await user.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the empty message when filtering yields no results', async () => {
    const user = userEvent.setup();
    renderCombobox({ emptyMessage: 'No languages found' });

    await user.type(screen.getByRole('combobox', { name: 'Language' }), 'zz');

    expect(screen.getByText('No languages found')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('renders a loading row in place of the option list', async () => {
    const user = userEvent.setup();
    renderCombobox({ loading: true });

    await user.click(screen.getByRole('combobox', { name: 'Language' }));

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('renders the error message in place of the option list and marks the input invalid', async () => {
    const user = userEvent.setup();
    renderCombobox({ error: 'Failed to load languages' });

    const input = screen.getByRole('combobox', { name: 'Language' });
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.click(input);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load languages');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('does not open or accept interaction when disabled', async () => {
    const user = userEvent.setup();
    renderCombobox({ disabled: true });

    const input = screen.getByRole('combobox', { name: 'Language' });
    expect(input).toBeDisabled();

    await user.click(input);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
