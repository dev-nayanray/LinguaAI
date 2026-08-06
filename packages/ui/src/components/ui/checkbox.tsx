import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';

import { Check } from '@ui/icons';
import { cn } from '@ui/lib/cn';

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-border shadow-low outline-none ' +
        'transition-colors duration-micro focus-visible:ring-2 focus-visible:ring-focus-ring ' +
        'focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ' +
        'data-[state=checked]:border-primary-solid data-[state=checked]:bg-primary-solid ' +
        'data-[state=checked]:text-white',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="h-3.5 w-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
