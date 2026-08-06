import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VoiceWaveformIndicator } from './voice-waveform-indicator';

describe('VoiceWaveformIndicator', () => {
  it('exposes a role="img" text alternative for the recording state', () => {
    render(<VoiceWaveformIndicator state="recording" />);
    expect(screen.getByRole('img', { name: 'Recording' })).toBeInTheDocument();
  });

  it('exposes a distinct text alternative for the idle state', () => {
    render(<VoiceWaveformIndicator state="idle" />);
    expect(screen.getByRole('img', { name: 'Not recording' })).toBeInTheDocument();
  });

  it('accepts a custom label override', () => {
    render(<VoiceWaveformIndicator state="recording" label="Recording your answer" />);
    expect(screen.getByRole('img', { name: 'Recording your answer' })).toBeInTheDocument();
  });
});
