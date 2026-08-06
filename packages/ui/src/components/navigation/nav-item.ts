import type { ReactNode } from 'react';

/**
 * Shared across TopNav/Sidebar/BottomTabBar. `href` is a plain string, not
 * a routing-library concept — `packages/ui` is presentational only (§6)
 * and takes no `next/navigation`/`next/link` dependency, so every item
 * renders as a real `<a href>`, not a framework-specific link component.
 */
export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
}
