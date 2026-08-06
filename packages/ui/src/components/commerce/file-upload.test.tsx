import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileUpload } from './file-upload';

function makeFile(name: string, type = 'image/png') {
  return new File(['content'], name, { type });
}

describe('FileUpload', () => {
  it('renders the drop zone labeled by its label prop', () => {
    render(<FileUpload label="Upload avatar" onFilesSelected={vi.fn()} />);
    expect(screen.getByText('Upload avatar')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload avatar')).toHaveAttribute('type', 'file');
  });

  it('calls onFilesSelected when a file is chosen via the native input', async () => {
    const onFilesSelected = vi.fn();
    const user = userEvent.setup();
    render(<FileUpload label="Upload avatar" onFilesSelected={onFilesSelected} />);

    const file = makeFile('avatar.png');
    await user.upload(screen.getByLabelText('Upload avatar'), file);

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('calls onFilesSelected with dropped files', () => {
    const onFilesSelected = vi.fn();
    render(<FileUpload label="Upload avatar" onFilesSelected={onFilesSelected} />);

    const file = makeFile('avatar.png');
    fireEvent.drop(screen.getByText('Upload avatar').closest('label')!, {
      dataTransfer: { files: [file] },
    });

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('shows a progress bar while progress is defined', () => {
    render(<FileUpload label="Upload avatar" onFilesSelected={vi.fn()} progress={40} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  });

  it('does not show a progress bar when idle', () => {
    render(<FileUpload label="Upload avatar" onFilesSelected={vi.fn()} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('disables the input and shows the error message on failure', () => {
    render(<FileUpload label="Upload avatar" onFilesSelected={vi.fn()} error="File too large" />);
    expect(screen.getByRole('alert')).toHaveTextContent('File too large');
    expect(screen.getByLabelText('Upload avatar')).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables the input when the disabled prop is set', () => {
    render(<FileUpload label="Upload avatar" onFilesSelected={vi.fn()} disabled />);
    expect(screen.getByLabelText('Upload avatar')).toBeDisabled();
  });

  it('disables the input while uploading', () => {
    render(<FileUpload label="Upload avatar" onFilesSelected={vi.fn()} progress={10} />);
    expect(screen.getByLabelText('Upload avatar')).toBeDisabled();
  });

  it('renders help text when no error is present', () => {
    render(
      <FileUpload
        label="Upload avatar"
        onFilesSelected={vi.fn()}
        helpText="PNG or JPG, up to 5MB."
      />,
    );
    expect(screen.getByText('PNG or JPG, up to 5MB.')).toBeInTheDocument();
  });

  it('hides help text once an error is present', () => {
    render(
      <FileUpload
        label="Upload avatar"
        onFilesSelected={vi.fn()}
        helpText="PNG or JPG, up to 5MB."
        error="File too large"
      />,
    );
    expect(screen.queryByText('PNG or JPG, up to 5MB.')).not.toBeInTheDocument();
  });

  it('highlights the drop zone on drag-over and clears on drag-leave', () => {
    render(<FileUpload label="Upload avatar" onFilesSelected={vi.fn()} />);
    const dropZone = screen.getByText('Upload avatar').closest('label')!;

    fireEvent.dragOver(dropZone);
    expect(dropZone.className).toContain('border-primary-solid');

    fireEvent.dragLeave(dropZone);
    expect(dropZone.className).not.toContain('border-primary-solid');
  });

  it('ignores drag-over highlighting while disabled', () => {
    render(<FileUpload label="Upload avatar" onFilesSelected={vi.fn()} disabled />);
    const dropZone = screen.getByText('Upload avatar').closest('label')!;

    fireEvent.dragOver(dropZone);
    expect(dropZone.className).not.toContain('border-primary-solid');
  });

  it('ignores drop while disabled', () => {
    const onFilesSelected = vi.fn();
    render(<FileUpload label="Upload avatar" onFilesSelected={onFilesSelected} disabled />);

    fireEvent.drop(screen.getByText('Upload avatar').closest('label')!, {
      dataTransfer: { files: [makeFile('avatar.png')] },
    });

    expect(onFilesSelected).not.toHaveBeenCalled();
  });
});
