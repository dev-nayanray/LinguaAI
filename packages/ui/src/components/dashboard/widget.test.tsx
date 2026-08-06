import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Widget } from './widget';

describe('Widget', () => {
  it('renders its children', () => {
    render(<Widget>Stat card goes here</Widget>);
    expect(screen.getByText('Stat card goes here')).toBeInTheDocument();
  });

  it('merges a caller-provided className without dropping min-w-0', () => {
    render(
      <Widget className="my-widget" data-testid="widget">
        content
      </Widget>,
    );
    const widget = screen.getByTestId('widget');
    expect(widget.className).toContain('my-widget');
    expect(widget.className).toContain('min-w-0');
  });
});
