import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Renders every design token declared in styles/tokens.css
 * (DESIGN_SYSTEM.md §2/§2.1/§2.2/§3) as a visual reference — the canonical
 * "does the token pipeline actually work" proof for T10's acceptance
 * criteria ("Storybook boots locally showing at least the token palette").
 */

const colorTokens = [
  { name: 'primary', className: 'bg-primary', label: 'Lingua Blue' },
  { name: 'ai', className: 'bg-ai', label: 'AI Purple' },
  { name: 'accent', className: 'bg-accent', label: 'Cyan' },
  { name: 'success', className: 'bg-success', label: 'Success Green' },
  { name: 'warning', className: 'bg-warning', label: 'Warning Amber' },
  { name: 'bg', className: 'border border-neutral-300 bg-bg', label: 'Background' },
  { name: 'bg-dark', className: 'bg-bg-dark', label: 'Dark Background' },
  { name: 'text', className: 'bg-text', label: 'Primary Text' },
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

function TokenPalette() {
  return (
    <div className="flex flex-col gap-8 p-6 font-sans">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Colors (§2)</h2>
        <div className="flex flex-wrap gap-4">
          {colorTokens.map((token) => (
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
        <h2 className="mb-3 text-lg font-semibold">Border radius (§2.1)</h2>
        <div className="flex flex-wrap gap-4">
          {radiusTokens.map((token) => (
            <div key={token.name} className="flex flex-col items-center gap-2">
              <div className={`h-16 w-16 bg-primary ${token.className}`} />
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
              <div className={`h-16 w-16 rounded-md bg-bg ${token.className}`} />
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
              className={`z-${name} rounded-md border border-neutral-300 px-3 py-2 text-xs`}
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
              className={`ease-entrance ${token.className} rounded-md bg-primary px-3 py-2 text-xs text-white transition-colors hover:bg-ai`}
            >
              {token.name} — hover me
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Typography (§3)</h2>
        <p className="font-sans text-base">Inter — primary UI typeface (font-sans)</p>
        <p className="font-display text-base">Manrope — display typeface (font-display)</p>
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

export const Palette: Story = {};
