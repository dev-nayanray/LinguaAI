import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar } from './avatar';

describe('Avatar', () => {
  it('renders initials derived from name when no image is given', () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toHaveClass('sr-only');
  });

  it('renders a single initial for a one-word name', () => {
    render(<Avatar name="Cher" />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders an image with the name as alt text when src is given', () => {
    render(<Avatar name="Ada Lovelace" src="https://example.com/ada.png" />);
    const img = screen.getByRole('img', { name: 'Ada Lovelace' });
    expect(img).toHaveAttribute('src', 'https://example.com/ada.png');
  });
});
