/**
 * App-local — not a `packages/ui` component. `FormField`/`TextInput` used
 * to live here; both moved onto `packages/ui`'s real Form components (E3
 * T6, `@linguaai/ui/forms`). What's left is a form-level status banner —
 * the whole form's result (login failure), distinct from `FormField`'s own
 * per-field error slot — which DESIGN_SYSTEM.md §4's Forms category
 * doesn't define a component for.
 */

export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    // Same precedent as packages/ui/src/components/error-boundary.tsx: no
    // danger-tinted *background* token exists in the approved set, so a
    // neutral surface + the danger-hue text/border token is used instead
    // of inventing one.
    <p
      role="alert"
      className="rounded-md border border-danger-text bg-surface px-3 py-2 text-sm text-danger-text"
    >
      {message}
    </p>
  );
}
