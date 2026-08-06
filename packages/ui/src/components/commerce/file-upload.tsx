import * as React from 'react';

import { AlertCircle, Upload } from '@ui/icons';
import { cn } from '@ui/lib/cn';

import { ProgressBar } from '../progress/progress-bar';

export interface FileUploadProps {
  /** The drop zone's accessible name — also the hidden native input's `<label>` text. */
  label: string;
  accept?: string;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  /**
   * `0`–`100` while an upload is in flight; `undefined` (the default) when
   * idle. The caller owns the actual upload request — this component only
   * renders whatever progress it's given.
   */
  progress?: number;
  /** A failed-upload message, e.g. "File too large." Replaces the drop zone's idle prompt. */
  error?: string;
  helpText?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * E3 §12.4/§12.5 file/image upload — native `<input type="file">` +
 * drag-and-drop enhancement, with upload progress/error states. No manual
 * screen-reader check required (§12.5): the interactive surface is a
 * native file input wrapped in its own `<label>`, so drag-and-drop is a
 * pointer-only enhancement layered on top of an already-accessible control,
 * not a replacement for it.
 */
export function FileUpload({
  label,
  accept,
  multiple = false,
  onFilesSelected,
  progress,
  error,
  helpText,
  disabled = false,
  id,
  className,
}: FileUploadProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const [isDragging, setIsDragging] = React.useState(false);
  const uploading = progress !== undefined;

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (disabled || uploading) return;
    onFilesSelected(Array.from(event.dataTransfer.files));
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onFilesSelected(Array.from(event.target.files ?? []));
    // Allows re-selecting the same file consecutively (e.g. retry after an error).
    event.target.value = '';
  }

  const helpTextId = helpText && !error ? `${inputId}-help` : undefined;
  const errorTextId = error ? `${inputId}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !uploading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed p-6 text-center',
          'transition-colors duration-micro',
          isDragging && !disabled && !uploading
            ? 'border-primary-solid bg-surface-muted'
            : 'border-border',
          error && 'border-danger-text',
          (disabled || uploading) && 'cursor-not-allowed opacity-50',
        )}
      >
        <input
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled || uploading}
          onChange={handleChange}
          aria-describedby={[errorTextId, helpTextId].filter(Boolean).join(' ') || undefined}
          aria-invalid={Boolean(error)}
          className="sr-only"
        />
        {error ? (
          <AlertCircle aria-hidden="true" className="h-6 w-6 text-danger-text" />
        ) : (
          <Upload aria-hidden="true" className="h-6 w-6 text-neutral-text" />
        )}
        <span className="type-body-sm text-text">{label}</span>
      </label>

      {progress !== undefined && (
        <ProgressBar value={progress} label={`Uploading ${label}`} showValueText />
      )}

      {helpText && !error && (
        <p id={helpTextId} className="type-caption text-neutral-text">
          {helpText}
        </p>
      )}
      {error && (
        <p id={errorTextId} role="alert" className="type-caption text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
