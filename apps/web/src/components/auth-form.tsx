import type { ReactNode } from 'react';

/**
 * App-local form primitives — not `packages/ui` components. Part 12 of the
 * E2 design doc is explicit: auth UI consumes `packages/ui`'s existing CSS
 * token set directly (Tailwind classes referencing `--color-primary`, etc.)
 * rather than inventing a new shared component library. These two are pure
 * composition over that same token set, scoped to this app's auth forms —
 * not exported outside it.
 */

const inputClassName =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-text ' +
  'placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 ' +
  'dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50';

export function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text dark:text-neutral-50">
        {label}
      </label>
      {children}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClassName} />;
}

export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p
      role="alert"
      className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
    >
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
      {message}
    </p>
  );
}
