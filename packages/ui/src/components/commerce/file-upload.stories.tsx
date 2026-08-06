import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { FileUpload } from './file-upload';

const meta = {
  title: 'Commerce/FileUpload',
  component: FileUpload,
  tags: ['autodocs'],
  args: {
    label: 'Drag an image here or click to browse',
    onFilesSelected: () => {},
  },
} satisfies Meta<typeof FileUpload>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHelpText: Story = {
  args: { helpText: 'PNG or JPG, up to 5MB.' },
};

export const Uploading: Story = {
  args: { progress: 60 },
};

export const WithError: Story = {
  args: { error: 'File too large — max 5MB.' },
};

export const Disabled: Story = {
  args: { disabled: true },
};

function SelectionDemo() {
  const [fileNames, setFileNames] = useState<string[]>([]);
  return (
    <div>
      <FileUpload
        label="Upload avatar"
        accept="image/*"
        onFilesSelected={(files) => setFileNames(files.map((f) => f.name))}
      />
      <p data-testid="selected-files">{fileNames.join(', ')}</p>
    </div>
  );
}

export const FileSelection: StoryObj<typeof SelectionDemo> = {
  render: () => <SelectionDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Upload avatar') as HTMLInputElement;

    const file = new File(['content'], 'avatar.png', { type: 'image/png' });
    await userEvent.upload(input, file);

    expect(canvas.getByTestId('selected-files')).toHaveTextContent('avatar.png');
  },
};
