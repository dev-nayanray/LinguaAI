import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OnboardingStepper } from './onboarding-stepper';

const STEPS = [
  { id: 'profile', label: 'Profile' },
  { id: 'goals', label: 'Goals' },
  { id: 'level', label: 'Level' },
];

describe('OnboardingStepper', () => {
  it('renders every step label', () => {
    render(<OnboardingStepper steps={STEPS} currentStep={0} />);
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Goals')).toBeInTheDocument();
    expect(screen.getByText('Level')).toBeInTheDocument();
  });

  it('marks exactly the current step aria-current="step"', () => {
    render(<OnboardingStepper steps={STEPS} currentStep={1} />);
    expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it('renders a check icon (visually hidden "Completed:" prefix) for steps before the current one', () => {
    render(<OnboardingStepper steps={STEPS} currentStep={2} />);
    expect(screen.getAllByText('Completed:', { exact: false })).toHaveLength(2);
  });

  it('renders no completed steps when currentStep is 0', () => {
    render(<OnboardingStepper steps={STEPS} currentStep={0} />);
    expect(screen.queryByText('Completed:', { exact: false })).not.toBeInTheDocument();
  });

  it('renders inside a labeled nav landmark', () => {
    render(<OnboardingStepper steps={STEPS} currentStep={0} label="Sign-up progress" />);
    expect(screen.getByRole('navigation', { name: 'Sign-up progress' })).toBeInTheDocument();
  });
});
