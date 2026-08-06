import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InlineCorrection } from './inline-correction';

describe('InlineCorrection', () => {
  it('renders original parts as <del> and correction parts as <ins>', () => {
    render(
      <InlineCorrection
        parts={[
          { text: 'I goed', type: 'original' },
          { text: 'I went', type: 'correction' },
          { text: ' to the store', type: 'original' },
        ]}
      />,
    );

    const deletions = document.querySelectorAll('del');
    const insertions = document.querySelectorAll('ins');
    expect(deletions).toHaveLength(2);
    expect(insertions).toHaveLength(1);
    expect(deletions[0]).toHaveTextContent('I goed');
    expect(insertions[0]).toHaveTextContent('I went');
  });

  it('renders parts via structured props only, never interpreting text as HTML', () => {
    render(
      <InlineCorrection parts={[{ text: '<script>alert(1)</script>', type: 'correction' }]} />,
    );
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).not.toBeInTheDocument();
  });
});
