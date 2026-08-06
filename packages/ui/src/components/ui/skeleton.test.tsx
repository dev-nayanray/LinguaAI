import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders as an aria-hidden decorative block sized by the caller', () => {
    const { container } = render(<Skeleton className="h-8 w-16" />);
    const el = container.firstElementChild;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el?.className).toContain('h-8');
    expect(el?.className).toContain('w-16');
    expect(el?.className).toContain('animate-pulse');
  });
});
