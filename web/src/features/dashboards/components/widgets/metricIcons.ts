// Metric → tile eyebrow icon. Decorative only (the eyebrow text names the widget). Kept as a typed
// module-level constant, not inline JSX (web-component-architecture.md). Unmapped metrics render no
// icon — the text stands alone.

import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import {
  CheckSquare,
  ChartBar,
  ChartBarHorizontal,
  ClockCountdown,
  SquaresFour,
  Stack,
  Swap,
  UserMinus,
  Users,
} from '@phosphor-icons/react';

import type { DashboardMetric } from '@shared/types';

export const METRIC_ICONS: Partial<Record<DashboardMetric, ComponentType<IconProps>>> = {
  'pipeline-by-category': Stack,
  'escalations-by-quarter-origin': Swap,
  'unassigned-past-intake': UserMinus,
  'closures-by-outcome': CheckSquare,
  'open-per-analyst': Users,
  'pending-signoff': CheckSquare,
  'median-time-to-triage': ClockCountdown,
  'aging-in-stage': ChartBar,
  'features-published': SquaresFour,
  'features-by-type': ChartBarHorizontal,
  'features-by-tech': Stack,
  'requests-by-origin': ChartBarHorizontal,
  'escalation-status': Swap,
};
