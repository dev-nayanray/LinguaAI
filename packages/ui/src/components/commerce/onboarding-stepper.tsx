import { Check } from '@ui/icons';
import { cn } from '@ui/lib/cn';

export interface OnboardingStep {
  id: string;
  label: string;
}

export interface OnboardingStepperProps {
  steps: OnboardingStep[];
  /** 0-indexed position of the active step. */
  currentStep: number;
  /** Accessible name for the enclosing `<nav>` landmark. */
  label?: string;
  className?: string;
}

/**
 * E3 §12.4/§12.5 onboarding/wizard stepper — presentational, `aria-current="step"`.
 * Completed/current/upcoming status is conveyed by icon + weight + border
 * together, never color alone (§12.5's "not just layout" requirement,
 * applied here the same way `LeaderboardRow`/`AchievementCard` apply it
 * elsewhere in this category).
 */
export function OnboardingStepper({
  steps,
  currentStep,
  label = 'Onboarding progress',
  className,
}: OnboardingStepperProps) {
  return (
    <nav aria-label={label} className={cn('w-full', className)}>
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const status =
            index < currentStep ? 'complete' : index === currentStep ? 'current' : 'upcoming';

          return (
            <li key={step.id} className="flex flex-1 items-center last:flex-none">
              <div className="flex items-center gap-2">
                <span
                  aria-current={status === 'current' ? 'step' : undefined}
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-pill type-caption font-semibold',
                    status === 'complete' && 'bg-primary-solid text-white',
                    status === 'current' && 'border-2 border-primary-solid text-primary-text',
                    status === 'upcoming' && 'border border-border text-neutral-text',
                  )}
                >
                  {status === 'complete' ? (
                    <>
                      <Check aria-hidden="true" className="h-4 w-4" />
                      <span className="sr-only">Completed: </span>
                    </>
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    'type-body-sm whitespace-nowrap',
                    status === 'upcoming' ? 'text-neutral-text' : 'text-text',
                    status === 'current' && 'font-semibold',
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'mx-3 h-px flex-1',
                    status === 'complete' ? 'bg-primary-solid' : 'bg-border',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
