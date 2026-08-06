import { cn } from '@ui/lib/cn';

import { Avatar } from '../ui/avatar';

export interface AgentPersonaHeaderProps {
  name: string;
  /** e.g. "AI Language Tutor" */
  title?: string;
  avatarUrl?: string;
  className?: string;
}

/** E3 §12.4/§12.5 agent persona header — static, composed from the hand-rolled `Avatar` primitive. */
export function AgentPersonaHeader({ name, title, avatarUrl, className }: AgentPersonaHeaderProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Avatar name={name} src={avatarUrl} size="md" />
      <div className="flex flex-col">
        <span className="type-body-sm font-semibold text-text">{name}</span>
        {title && <span className="type-caption text-neutral-text">{title}</span>}
      </div>
    </div>
  );
}
