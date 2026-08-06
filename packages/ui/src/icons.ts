/**
 * Single indirection point for every icon used in `packages/ui` (ADR-025).
 * Components import icons from here, never from `lucide-react` directly —
 * a future library swap is then a one-file change, not a per-component one.
 * Add an icon here only when a component actually needs it; this is not a
 * place to pre-export lucide's full set "just in case."
 */
export {
  X,
  Check,
  ChevronDown,
  Circle,
  TrendingUp,
  TrendingDown,
  Minus,
  Bot,
  Flame,
  Star,
  Calendar,
  Clock,
  Upload,
  File,
  AlertCircle,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
