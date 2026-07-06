// Public API of the audit feature (S33 Workspace audit, slice 18). Only exports intended for the
// router / other features go here.
export { WorkspaceAuditPage } from './components/WorkspaceAuditPage';

// Reusable audit-log building blocks — promoted to the barrel when the firm-wide audit (S39, slice 19)
// became a second consumer (web-file-structure.md: cross-feature use goes through the barrel).
export { eventGroup, eventTypeLabel, EVENT_TYPE_OPTIONS } from './constants';
export type { EventGroup } from './constants';
