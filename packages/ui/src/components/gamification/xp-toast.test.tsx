import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Toaster } from '../ui/toaster';
import { celebrateXp, XpToastContent } from './xp-toast';

describe('XpToastContent', () => {
  it('renders the XP amount', () => {
    render(<XpToastContent xp={50} />);
    expect(screen.getByText('+50 XP')).toBeInTheDocument();
  });

  it('renders the optional message', () => {
    render(<XpToastContent xp={50} message="Lesson complete!" />);
    expect(screen.getByText('Lesson complete!')).toBeInTheDocument();
  });

  it('omits the message line when not provided', () => {
    render(<XpToastContent xp={50} />);
    expect(screen.queryByText('Lesson complete!')).not.toBeInTheDocument();
  });
});

describe('celebrateXp', () => {
  it('dispatches an XpToastContent through the mounted Toaster', async () => {
    render(<Toaster />);

    act(() => {
      celebrateXp({ xp: 25, message: 'Streak bonus!' });
    });

    expect(await screen.findByText('+25 XP')).toBeInTheDocument();
    expect(screen.getByText('Streak bonus!')).toBeInTheDocument();
  });
});
