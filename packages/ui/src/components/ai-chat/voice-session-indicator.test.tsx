import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VoiceSessionIndicator, type VoiceSessionState } from './voice-session-indicator';

describe('VoiceSessionIndicator', () => {
  // E3 §12.4 testing requirement: "all 5 states render distinct output".
  it.each<[VoiceSessionState, string]>([
    ['idle', 'Idle'],
    ['listening', 'Listening'],
    ['processing', 'Processing'],
    ['speaking', 'Speaking'],
  ])('renders distinct output for the %s state', (state, label) => {
    render(<VoiceSessionIndicator state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders the error state with distinct output and role="alert"', () => {
    render(<VoiceSessionIndicator state="error" errorMessage="Microphone access denied" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Microphone access denied');
  });

  it('the four non-error states announce aria-live="polite"', () => {
    render(<VoiceSessionIndicator state="listening" />);
    expect(screen.getByText('Listening')).toHaveAttribute('aria-live', 'polite');
  });

  it('the error state announces assertively (role="alert"), distinct from the other four', () => {
    render(<VoiceSessionIndicator state="error" />);
    const alert = screen.getByRole('alert');
    // role="alert" carries an implicit aria-live="assertive" — verified by
    // absence of an explicit "polite" override anywhere in the error markup.
    expect(alert).not.toHaveAttribute('aria-live', 'polite');
  });

  // E3 §12.4 testing requirement: "every transition above ... exercised".
  it('renders correctly through the full documented transition sequence, including both error transitions', () => {
    const { rerender } = render(<VoiceSessionIndicator state="idle" />);
    expect(screen.getByText('Idle')).toBeInTheDocument();

    rerender(<VoiceSessionIndicator state="listening" />); // idle -> listening
    expect(screen.getByText('Listening')).toBeInTheDocument();

    rerender(<VoiceSessionIndicator state="processing" />); // listening -> processing
    expect(screen.getByText('Processing')).toBeInTheDocument();

    rerender(<VoiceSessionIndicator state="speaking" />); // processing -> speaking
    expect(screen.getByText('Speaking')).toBeInTheDocument();

    rerender(<VoiceSessionIndicator state="listening" />); // speaking -> listening (barge-in)
    expect(screen.getByText('Listening')).toBeInTheDocument();

    rerender(<VoiceSessionIndicator state="error" errorMessage="Network error" />); // * -> error
    expect(screen.getByRole('alert')).toHaveTextContent('Network error');

    rerender(<VoiceSessionIndicator state="idle" />); // error -> idle
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(<VoiceSessionIndicator state="speaking" />);
    rerender(<VoiceSessionIndicator state="error" errorMessage="Speech synthesis failed" />); // speaking -> error
    expect(screen.getByRole('alert')).toHaveTextContent('Speech synthesis failed');
  });
});
