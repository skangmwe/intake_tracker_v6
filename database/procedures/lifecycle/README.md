# Lifecycle & gates procedures (Slice 4 — S31)

Read procs bind to keyless projections in the API and are assembled in `LifecycleService`
(one lifecycle graph out of several flat reads, mirroring the Slice 3 fields pattern). Write
procs mutate through a single transaction each.

| Proc | Shape | Notes |
|---|---|---|
| `usp_GetWorkspaceLifecycles` | read | Lifecycles for a workspace (ordered). |
| `usp_GetWorkspaceStages` | read | All stages across the workspace's lifecycles. |
| `usp_GetWorkspaceGates` | read | All gates across the workspace's lifecycles. |
| `usp_GetWorkspaceGateSlots` | read | Gate slots with the **live** eligible-member count per role label. |
| `usp_GetRoleLabelCatalog` | read | Platform-scope role-label catalog (full CRUD is S37). |
| `usp_GetWorkspaceApproverTeams` | read | Approver-team roster (role label → member + display name). |
| `usp_SaveLifecycleConfig` | write | Full-config reconcile (OPENJSON). Upsert present, soft-retire absent. One-default + gate-stage-resolution guards THROW. |
| `usp_AddApproverTeamMember` | write | Resolves a typed name/email to a real workspace member and adds it; THROWs on no-match / ambiguous; idempotent. Returns the member. |
| `usp_RemoveApproverTeamMember` | write | Soft-clears a membership; idempotent; no result set. |

All soft-delete (no physical DELETE), so FK integrity holds across the reconcile.
