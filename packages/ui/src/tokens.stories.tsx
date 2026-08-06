import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Renders every design token declared in styles/tokens.css
 * (DESIGN_SYSTEM.md §2/§2.1/§2.2/§3; E3 design document §12.1/§12.1a) as a
 * visual reference — the canonical "does the token pipeline actually work"
 * proof, and the easiest way to spot-check both themes via Storybook's own
 * theme-switcher toolbar (see .storybook/preview.tsx).
 */

const brandAnchors = [
  { name: 'primary', className: 'bg-primary', label: 'Lingua Blue (decorative only)' },
  { name: 'ai', className: 'bg-ai', label: 'AI Purple (decorative only)' },
  { name: 'accent', className: 'bg-accent', label: 'Cyan (decorative only)' },
  { name: 'success', className: 'bg-success', label: 'Success Green (decorative only)' },
  { name: 'warning', className: 'bg-warning', label: 'Warning Amber (decorative only)' },
];

const surfaceTokens = [
  { name: 'bg', className: 'border border-border bg-bg' },
  { name: 'surface', className: 'border border-border bg-surface' },
  { name: 'surface-muted', className: 'border border-border bg-surface-muted' },
  { name: 'surface-elevated', className: 'border border-border bg-surface-elevated shadow-medium' },
];

const textTokens = [
  { name: 'text', className: 'text-text' },
  { name: 'primary-text', className: 'text-primary-text' },
  { name: 'ai-text', className: 'text-ai-text' },
  { name: 'accent-text', className: 'text-accent-text' },
  { name: 'success-text', className: 'text-success-text' },
  { name: 'warning-text', className: 'text-warning-text' },
  { name: 'danger-text', className: 'text-danger-text' },
  { name: 'info-text', className: 'text-info-text' },
  { name: 'neutral-text', className: 'text-neutral-text' },
];

const solidFillTokens = [
  { name: 'primary-solid', className: 'bg-primary-solid' },
  { name: 'ai-solid', className: 'bg-ai-solid' },
  { name: 'accent-solid', className: 'bg-accent-solid' },
  { name: 'success-solid', className: 'bg-success-solid' },
  { name: 'warning-solid', className: 'bg-warning-solid' },
  { name: 'danger-solid', className: 'bg-danger-solid' },
];

const structuralTokens = [
  { name: 'border', className: 'border-2 border-border' },
  { name: 'focus-ring', className: 'ring-2 ring-focus-ring' },
  { name: 'disabled-bg / disabled-text', className: 'bg-disabled-bg text-disabled-text' },
];

const radiusTokens = [
  { name: 'sm (4px)', className: 'rounded-sm' },
  { name: 'md (8px)', className: 'rounded-md' },
  { name: 'lg (12px)', className: 'rounded-lg' },
  { name: 'pill (9999px)', className: 'rounded-pill' },
];

const shadowTokens = [
  { name: 'flat', className: 'shadow-flat' },
  { name: 'low', className: 'shadow-low' },
  { name: 'medium', className: 'shadow-medium' },
  { name: 'high', className: 'shadow-high' },
  { name: 'overlay', className: 'shadow-overlay' },
];

const zIndexTokens = ['base', 'dropdown', 'sticky', 'overlay', 'modal', 'toast'];

const durationTokens = [
  { name: 'micro (150ms)', className: 'duration-micro' },
  { name: 'standard (250ms)', className: 'duration-standard' },
  { name: 'celebratory (600ms)', className: 'duration-celebratory' },
];

const typographyTokens = [
  { name: 'type-caption', className: 'type-caption' },
  { name: 'type-body-sm', className: 'type-body-sm' },
  { name: 'type-body-md', className: 'type-body-md' },
  { name: 'type-body-lg', className: 'type-body-lg' },
  { name: 'type-heading-md', className: 'type-heading-md' },
  { name: 'type-heading-lg', className: 'type-heading-lg' },
  { name: 'type-heading-xl', className: 'type-heading-xl' },
  { name: 'type-display-lg', className: 'type-display-lg' },
  { name: 'type-display-xl', className: 'type-display-xl' },
];

function TokenPalette() {
  return (
    <div className="flex flex-col gap-8 bg-bg p-6 font-sans text-text">
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Brand identity anchors (§2) — decorative only
        </h2>
        <div className="flex flex-wrap gap-4">
          {brandAnchors.map((token) => (
            <div key={token.name} className="flex flex-col items-center gap-2">
              <div className={`h-16 w-16 rounded-md ${token.className}`} />
              <span className="text-xs">
                {token.name}
                <br />
                {token.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Surfaces (E3 §12.1)</h2>
        <div className="flex flex-wrap gap-4">
          {surfaceTokens.map((token) => (
            <div key={token.name} className="flex flex-col items-center gap-2">
              <div className={`h-16 w-16 rounded-md ${token.className}`} />
              <span className="text-xs">{token.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Semantic text tokens (E3 §12.1, ≥4.5:1)</h2>
        <div className="flex flex-wrap gap-4">
          {textTokens.map((token) => (
            <div
              key={token.name}
              className={`rounded-md border border-border bg-surface px-3 py-2 text-sm ${token.className}`}
            >
              {token.name}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Solid-fill tokens (E3 §12.1, white text ≥4.5:1)
        </h2>
        <div className="flex flex-wrap gap-4">
          {solidFillTokens.map((token) => (
            <div
              key={token.name}
              className={`rounded-md px-3 py-2 text-sm text-white ${token.className}`}
            >
              {token.name}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Border, focus, disabled (E3 §12.1)</h2>
        <div className="flex flex-wrap gap-4">
          {structuralTokens.map((token) => (
            <div
              key={token.name}
              className={`rounded-md border border-border bg-surface px-3 py-2 text-sm ${token.className}`}
            >
              {token.name}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Border radius (§2.1)</h2>
        <div className="flex flex-wrap gap-4">
          {radiusTokens.map((token) => (
            <div key={token.name} className="flex flex-col items-center gap-2">
              <div className={`h-16 w-16 bg-primary-solid ${token.className}`} />
              <span className="text-xs">{token.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Elevation / shadow (§2.1)</h2>
        <div className="flex flex-wrap gap-6">
          {shadowTokens.map((token) => (
            <div key={token.name} className="flex flex-col items-center gap-2">
              <div className={`h-16 w-16 rounded-md bg-surface ${token.className}`} />
              <span className="text-xs">{token.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Z-index scale (§2.1)</h2>
        <div className="flex flex-wrap gap-4">
          {zIndexTokens.map((name) => (
            <div
              key={name}
              className={`z-${name} rounded-md border border-border px-3 py-2 text-xs`}
            >
              {name}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Motion durations (§2.2)</h2>
        <div className="flex flex-wrap gap-4">
          {durationTokens.map((token) => (
            <div
              key={token.name}
              className={`ease-entrance ${token.className} rounded-md bg-primary-solid px-3 py-2 text-xs text-white transition-colors hover:bg-ai-solid`}
            >
              {token.name} — hover me
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Typography (E3 §12.1a)</h2>
        <div className="flex flex-col gap-2">
          {typographyTokens.map((token) => (
            <p key={token.name} className={token.className}>
              {token.name} — The quick brown fox jumps over the lazy dog
            </p>
          ))}
        </div>
        <p className="mt-4 font-display text-base">Manrope — display typeface (font-display)</p>
      </section>
    </div>
  );
}

const meta = {
  title: 'Foundations/Tokens',
  component: TokenPalette,
} satisfies Meta<typeof TokenPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Palette: Story = {
  parameters: {
    // `--color-disabled-bg`/`--color-disabled-text` are WCAG's own stated
    // exemption for inactive controls (tokens.css's comment on those two
    // tokens; mirrored in tokens.test.ts's exemption list, E3 §17). axe
    // has no way to know a low-contrast pair is an intentional, documented
    // exemption rather than a bug, so this swatch alone is excluded from
    // the automated check (E3 T15) — every other swatch on this page stays
    // checked.
    a11y: {
      context: {
        exclude: '.bg-disabled-bg',
      },
    },
  },
};
