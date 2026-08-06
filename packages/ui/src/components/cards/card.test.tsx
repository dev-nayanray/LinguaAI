import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('composes header/title/description/content/footer slots', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Spanish A1</CardTitle>
          <CardDescription>Beginner course</CardDescription>
        </CardHeader>
        <CardContent>12 lessons</CardContent>
        <CardFooter>Continue</CardFooter>
      </Card>,
    );

    expect(screen.getByRole('heading', { name: 'Spanish A1' })).toBeInTheDocument();
    expect(screen.getByText('Beginner course')).toBeInTheDocument();
    expect(screen.getByText('12 lessons')).toBeInTheDocument();
    expect(screen.getByText('Continue')).toBeInTheDocument();
  });

  it('merges a caller-provided className without dropping the base styling', () => {
    render(<Card className="my-card" data-testid="card" />);
    const card = screen.getByTestId('card');
    expect(card.className).toContain('my-card');
    expect(card.className).toContain('border-border');
  });
});
