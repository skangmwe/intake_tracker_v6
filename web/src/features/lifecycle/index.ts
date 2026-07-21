// Public API for the Lifecycle & gates feature (S31). Only the route-level page is exported.
export { LifecyclePage } from './components/LifecyclePage';
// Read the workspace lifecycle config — the dashboard composer (slice 28) sources its stage scope
// options from the default lifecycle's stages.
export { useLifecycleConfig } from './useLifecycle';
// Approver-team roster + team-lifecycle mutations — the S29 Users & access → Approver teams editor
// manages the roster (add / remove members) and the teams themselves (create / rename / delete).
export {
  useAddApproverMember,
  useRemoveApproverMember,
  useCreateApproverTeam,
  useRenameApproverTeam,
  useDeleteApproverTeam,
} from './useLifecycle';
