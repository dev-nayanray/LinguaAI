import * as React from 'react';

import { cn } from '@ui/lib/cn';

export interface VoiceWaveformIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  state: 'recording' | 'idle';
  /** Overrides the default text alternative ("Recording" / "Not recording"). */
  label?: string;
}

// Fixed heights (not randomized) so the idle state is deterministic and
// the recording state's animation-delay stagger is reproducible in tests
// and Storybook snapshots, not a new random shape on every render.
const BAR_HEIGHTS = [40, 70, 100, 60, 85, 50, 75] as const;

/**
 * E3 §12.4/§12.5 voice waveform/recording indicator — `role="img"` with a
 * text alternative (never conveyed by animation alone); hand-rolled, no
 * waveform-rendering dependency.
 */
export function VoiceWaveformIndicator({
  state,
  label,
  className,
  ...props
}: VoiceWaveformIndicatorProps) {
  const isRecording = state === 'recording';
  const text = label ?? (isRecording ? 'Recording' : 'Not recording');

  return (
    <span
      role="img"
      aria-label={text}
      className={cn('flex h-8 items-end gap-1', className)}
      {...props}
    >
      {BAR_HEIGHTS.map((height, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            'w-1 rounded-pill bg-ai-text',
            isRecording ? 'animate-pulse' : 'opacity-40',
          )}
          style={{
            height: `${height}%`,
            animationDelay: isRecording ? `${index * 100}ms` : undefined,
          }}
        />
      ))}
    </span>
  );
}
