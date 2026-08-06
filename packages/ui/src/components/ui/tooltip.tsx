import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { scaleTransition } from '@ui/lib/animation';
import { cn } from '@ui/lib/cn';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-dropdown overflow-hidden rounded-md border border-border bg-surface-elevated px-3 py-1.5 ' +
        'type-caption text-text shadow-medium',
      scaleTransition,
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
