import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Label } from './label';

describe('Label', () => {
  it('associates with a form control via htmlFor, so clicking the label focuses/checks the control', () => {
    render(
      <>
        <Label htmlFor="email">Email</Label>
        <input id="email" type="email" />
      </>,
    );

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });
});
