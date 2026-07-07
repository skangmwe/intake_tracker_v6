// Shared prop shape for every dashboard widget. A widget receives its resolved DTO plus the
// drill-through affordance from the surface. When `onDrill` is absent the widget is non-interactive
// (the S16 bound viewer suppresses drill-through, driven by the API's supportsDrillThrough=false).

import type {
  DashboardDrillFilter,
  DashboardObjectType,
  DashboardWidgetDto,
} from '@shared/types';

export interface WidgetProps {
  widget: DashboardWidgetDto;
  /** The dashboard's default object type (records-grid + feature metrics inherit it). */
  objectType: DashboardObjectType;
  /** The active drill filter (drives the records-grid pill). */
  drill?: DashboardDrillFilter | undefined;
  /** Present only on the drill-enabled surface (S6). Absent → widget renders read-only (S16). */
  onDrill?: ((filter: DashboardDrillFilter) => void) | undefined;
  /** Clears the active drill (records-grid pill × ). */
  onClearDrill?: (() => void) | undefined;
}
