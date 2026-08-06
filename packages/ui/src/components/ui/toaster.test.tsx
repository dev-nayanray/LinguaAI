import { act, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it } from 'vitest';

import { Toaster } from './toaster';

describe('Toaster', () => {
  it('renders a toast dispatched via the sonner toast() function', async () => {
    render(<Toaster />);

    act(() => {
      toast('XP earned: +10');
    });

    expect(await screen.findByText('XP earned: +10')).toBeInTheDocument();
  });
});
