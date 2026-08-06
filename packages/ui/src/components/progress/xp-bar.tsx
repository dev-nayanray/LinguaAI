import { ProgressBar } from './progress-bar';

export interface XpBarProps {
  current: number;
  max: number;
  className?: string;
}

/** E3 §12.2 XP bar — composed from the base `ProgressBar`, not reimplemented (same pattern as Cards/Dashboard's "composed differently per context"). */
export function XpBar({ current, max, className }: XpBarProps) {
  return (
    <ProgressBar
      value={current}
      max={max}
      label={`${current} of ${max} XP`}
      showValueText
      className={className}
    />
  );
}
