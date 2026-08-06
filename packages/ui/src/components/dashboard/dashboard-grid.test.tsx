import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardGrid } from './dashboard-grid';
import { Widget } from './widget';

describe('DashboardGrid', () => {
  // E3 §12.4 testing requirement: "renders 1/2/3-column layouts at each
  // breakpoint token". `columns` can't become a Tailwind class name at
  // runtime (not statically analyzable), so it's written to CSS custom
  // properties consumed by static arbitrary-value classes — asserted at
  // both levels: the variable values and the class names referencing them.
  it('defaults to the {1,2,3} column layout across mobile/tablet/desktop', () => {
    render(
      <DashboardGrid data-testid="grid">
        <Widget>a</Widget>
      </DashboardGrid>,
    );
    const grid = screen.getByTestId('grid');

    expect(grid.style.getPropertyValue('--dg-cols-mobile')).toBe('1');
    expect(grid.style.getPropertyValue('--dg-cols-tablet')).toBe('2');
    expect(grid.style.getPropertyValue('--dg-cols-desktop')).toBe('3');
    expect(grid.className).toContain('grid-cols-[repeat(var(--dg-cols-mobile),minmax(0,1fr))]');
    expect(grid.className).toContain(
      'tablet:grid-cols-[repeat(var(--dg-cols-tablet),minmax(0,1fr))]',
    );
    expect(grid.className).toContain(
      'desktop:grid-cols-[repeat(var(--dg-cols-desktop),minmax(0,1fr))]',
    );
  });

  it('applies a caller-supplied column layout per breakpoint', () => {
    render(
      <DashboardGrid columns={{ mobile: 1, tablet: 3, desktop: 4 }} data-testid="grid">
        <Widget>a</Widget>
      </DashboardGrid>,
    );
    const grid = screen.getByTestId('grid');

    expect(grid.style.getPropertyValue('--dg-cols-mobile')).toBe('1');
    expect(grid.style.getPropertyValue('--dg-cols-tablet')).toBe('3');
    expect(grid.style.getPropertyValue('--dg-cols-desktop')).toBe('4');
  });

  it('maps the gap prop to the corresponding gap utility', () => {
    const { rerender } = render(
      <DashboardGrid gap="sm" data-testid="grid">
        <Widget>a</Widget>
      </DashboardGrid>,
    );
    expect(screen.getByTestId('grid').className).toContain('gap-2');

    rerender(
      <DashboardGrid gap="lg" data-testid="grid">
        <Widget>a</Widget>
      </DashboardGrid>,
    );
    expect(screen.getByTestId('grid').className).toContain('gap-6');
  });

  describe('dev-mode composition check', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    // E3 §12.4: "dev-mode warning fires for a non-Widget direct child".
    it('warns when a direct child is not a Widget, naming the host element tag', () => {
      render(
        <DashboardGrid>
          <div>stray div</div>
        </DashboardGrid>,
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('<div>');
    });

    it('warns when a direct child is a non-Widget custom component, naming the component', () => {
      function StrayComponent() {
        return <div>not a widget</div>;
      }
      render(
        <DashboardGrid>
          <StrayComponent />
        </DashboardGrid>,
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('<StrayComponent>');
    });

    // E3 §12.4: "does not fire for a Widget wrapped in a conditional or
    // fragment" — plus the doc's own stated non-exhaustiveness: it does
    // NOT recurse into a Fragment's own children, so a fragment wrapping
    // non-Widget content is expected to pass silently too.
    it('does not warn for a plain Widget child', () => {
      render(
        <DashboardGrid>
          <Widget>ok</Widget>
        </DashboardGrid>,
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn for a conditionally-rendered Widget', () => {
      const show = true;
      render(<DashboardGrid>{show && <Widget>ok</Widget>}</DashboardGrid>);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn for a Widget wrapped in a Fragment', () => {
      render(
        <DashboardGrid>
          <>
            <Widget>ok</Widget>
          </>
        </DashboardGrid>,
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn for null/false/string children', () => {
      render(
        <DashboardGrid>
          {null}
          {false}
          {'plain text'}
          <Widget>ok</Widget>
        </DashboardGrid>,
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('stated limitation: does not recurse into a Fragment, so non-Widget content inside one passes silently', () => {
      render(
        <DashboardGrid>
          <>
            <div>not a widget, but inside a fragment</div>
          </>
        </DashboardGrid>,
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
