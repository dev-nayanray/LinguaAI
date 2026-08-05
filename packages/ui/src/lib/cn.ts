import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Standard Shadcn utility: merges conditional class lists (`clsx`) and then
 * resolves conflicting Tailwind classes so the last one wins (`tailwind-merge`)
 * — e.g. `cn('px-2', condition && 'px-4')` correctly yields `px-4`, not both.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
