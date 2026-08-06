import { cn } from '@ui/lib/cn';

import { Avatar } from '../ui/avatar';

export interface LeaderboardRowProps {
  rank: number;
  name: string;
  avatarUrl?: string;
  score: number;
  /** Highlights the current user's own row — not color alone, since the rank/score text is identical either way; the visual weight difference is reinforced by `aria-current="true"` below. */
  isCurrentUser?: boolean;
  className?: string;
}

/**
 * E3 §12.2/§12.5 leaderboard row — "presentational, list semantics".
 * Renders as `<li>` so the caller wraps a set of rows in a real `<ol>`
 * (rank is order-significant, unlike `BadgeGrid`'s unordered `<ul>`).
 */
export function LeaderboardRow({
  rank,
  name,
  avatarUrl,
  score,
  isCurrentUser = false,
  className,
}: LeaderboardRowProps) {
  return (
    <li
      aria-current={isCurrentUser ? 'true' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2',
        isCurrentUser && 'bg-surface-muted',
        className,
      )}
    >
      <span className="w-6 shrink-0 type-body-sm font-semibold text-neutral-text">{rank}</span>
      <Avatar name={name} src={avatarUrl} size="sm" />
      <span className="flex-1 type-body-sm text-text">{name}</span>
      <span className="type-body-sm font-semibold text-text">{score.toLocaleString()}</span>
    </li>
  );
}
