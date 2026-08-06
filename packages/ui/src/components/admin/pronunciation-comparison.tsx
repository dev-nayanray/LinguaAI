import { cn } from '@ui/lib/cn';

export interface PronunciationSegment {
  text: string;
  /** 0–1 accuracy score for this word/phoneme — drives both the waveform-diff color coding and the text-equivalent summary below it. */
  score: number;
}

export interface PronunciationComparisonProps {
  segments: PronunciationSegment[];
  /** Overall accuracy, 0–1. */
  overallScore: number;
  /**
   * Reference (target) and attempt waveform amplitude samples, each 0–1.
   * Purely decorative (§12.2's "waveform diff" pattern name) — the segment
   * list below is the required accessible content either way, so both are
   * optional and independent of each other's presence.
   */
  referenceWaveform?: number[];
  attemptWaveform?: number[];
  className?: string;
}

function scoreStatus(score: number): { label: string; className: string } {
  if (score >= 0.8) return { label: 'correct', className: 'text-success-text' };
  if (score >= 0.5) return { label: 'needs practice', className: 'text-warning-text' };
  return { label: 'incorrect', className: 'text-danger-text' };
}

/**
 * E3 §12.4/§12.5 pronunciation comparison UI — waveform diff + text-
 * equivalent summary. No manual screen-reader check required (§12.5): the
 * waveform bars are `aria-hidden` decoration; the segment list is real,
 * always-present text conveying the same information a sighted user reads
 * off the waveform's color coding — the same "never rely on the visual
 * alone" precedent `VoiceWaveformIndicator` (T10) and `StreakFlame` (T11)
 * already establish in this codebase.
 */
export function PronunciationComparison({
  segments,
  overallScore,
  referenceWaveform,
  attemptWaveform,
  className,
}: PronunciationComparisonProps) {
  const overallPercent = Math.round(overallScore * 100);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="type-body-sm font-semibold text-text">{overallPercent}% accuracy</p>

      {referenceWaveform && attemptWaveform && (
        <div
          role="img"
          aria-label={`Pronunciation waveform comparison, ${overallPercent} percent accuracy`}
          className="flex flex-col gap-1"
        >
          <Waveform samples={referenceWaveform} className="text-neutral-text" />
          <Waveform samples={attemptWaveform} className="text-primary-solid" />
        </div>
      )}

      <ul className="flex flex-wrap gap-x-1.5 gap-y-1">
        {segments.map((segment, index) => {
          const status = scoreStatus(segment.score);
          return (
            <li key={`${segment.text}-${index}`} className={cn('type-body-sm', status.className)}>
              {segment.text}
              <span className="sr-only"> ({status.label})</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Waveform({ samples, className }: { samples: number[]; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('flex h-8 items-end gap-0.5', className)}>
      {samples.map((sample, index) => {
        const clamped = Math.min(1, Math.max(0, sample));
        return (
          <span
            key={index}
            className="w-1 rounded-sm bg-current"
            style={{ height: `${Math.max(clamped * 100, 8)}%` }}
          />
        );
      })}
    </div>
  );
}
