import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PronunciationComparison } from './pronunciation-comparison';

const SEGMENTS = [
  { text: 'Hola', score: 0.95 },
  { text: 'como', score: 0.6 },
  { text: 'estas', score: 0.2 },
];

describe('PronunciationComparison', () => {
  it('renders the overall accuracy percentage', () => {
    render(<PronunciationComparison segments={SEGMENTS} overallScore={0.72} />);
    expect(screen.getByText('72% accuracy')).toBeInTheDocument();
  });

  it('renders every segment as visible text', () => {
    render(<PronunciationComparison segments={SEGMENTS} overallScore={0.72} />);
    expect(screen.getByText('Hola')).toBeInTheDocument();
    expect(screen.getByText('como')).toBeInTheDocument();
    expect(screen.getByText('estas')).toBeInTheDocument();
  });

  it('gives each segment a non-color-only text-alternative status', () => {
    render(<PronunciationComparison segments={SEGMENTS} overallScore={0.72} />);
    expect(screen.getByText('(correct)', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('(needs practice)', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('(incorrect)', { exact: false })).toBeInTheDocument();
  });

  it('does not render a waveform when no samples are provided', () => {
    render(<PronunciationComparison segments={SEGMENTS} overallScore={0.72} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders a decorative, labeled waveform image when samples are provided', () => {
    render(
      <PronunciationComparison
        segments={SEGMENTS}
        overallScore={0.72}
        referenceWaveform={[0.2, 0.5, 0.8]}
        attemptWaveform={[0.1, 0.4, 0.6]}
      />,
    );
    expect(screen.getByRole('img', { name: /72 percent accuracy/ })).toBeInTheDocument();
  });
});
