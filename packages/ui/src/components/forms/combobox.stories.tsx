import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { FormField } from './form-field';
import { Combobox } from './combobox';

interface Language {
  code: string;
  name: string;
}

const LANGUAGES: Language[] = [
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
];

function ControlledCombobox(props: {
  initial?: Language | null;
  loading?: boolean;
  error?: string;
}) {
  const [value, setValue] = useState<Language | null>(props.initial ?? null);
  return (
    <FormField label="Language">
      <Combobox<Language>
        options={LANGUAGES}
        value={value}
        onChange={setValue}
        getOptionLabel={(l) => l.name}
        getOptionValue={(l) => l.code}
        loading={props.loading}
        error={props.error}
        placeholder="Choose a language"
      />
    </FormField>
  );
}

const meta = {
  title: 'Forms/Combobox',
  component: ControlledCombobox,
  tags: ['autodocs'],
} satisfies Meta<typeof ControlledCombobox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Selected: Story = {
  args: { initial: LANGUAGES[0] },
};

export const Loading: Story = {
  args: { loading: true },
};

export const ErrorState: Story = {
  args: { error: 'Failed to load languages' },
};

// E3 T5 evidence requirement (§20): a @storybook/test-runner interaction
// test for Combobox — exercises the documented ARIA 1.2 keyboard model
// (§12.4): typeahead filtering, arrow-key movement of the active option
// without moving DOM focus, and committing a selection.
export const TypeaheadAndSelect: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox', { name: 'Language' });

    // The option list renders through a Radix Portal into `document.body`,
    // not inside `canvasElement` — `screen` (whole-document) is required
    // for anything inside it; `canvas` stays scoped to the input itself.
    await userEvent.type(input, 'ja');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    expect(screen.getByRole('option', { name: 'Japanese' })).toBeInTheDocument();

    await userEvent.keyboard('{ArrowDown}');
    const option = screen.getByRole('option', { name: 'Japanese' });
    await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant', option.id));
    expect(input, 'focus stays on the input, per the ARIA 1.2 pattern').toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(input).toHaveValue('Japanese'));
    expect(input).toHaveAttribute('aria-expanded', 'false');
  },
};
