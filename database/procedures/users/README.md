# Users & access procedures (Slice 17 — S29)

Membership admin for a single workspace. Reads bind to a keyless projection assembled in
`MembersService`; writes mutate through one transaction each. None are access-gate procs —
the controller's WorkspaceAdmin `AccessGuard` is the authoritative server-side check
(approver-team precedent).

| Proc | Shape | Notes |
|---|---|---|
| `usp_ListWorkspaceMembers` | read | Members of a workspace: identity + level + disabled + last-active. Excludes soft-deleted memberships; disabled accounts are still listed (admin must see them to reassign, BS §6.8). |
| `usp_UpsertWorkspaceMembership` | write | Add / change level. Resolves `@Email` → a real active user (THROWs 50020 no-match / 50021 ambiguous, reusing the approver-team numbers) when no `@TargetUserId`. Idempotent (reactivate / update / insert). Returns the resolved `(UserId, Level, WasAdded)`. |
| `usp_DeactivateMember` | write | BS §6.8 safety floor: THROW 50030 on a pending named-individual sign-off (→ 409); else set `Users.IsDisabled = 1` and soft-delete this workspace's membership. Idempotent. |

The `usp_DeactivateMember` block honours a slot's `namedUserId` marker in `ApprovalRequests.FrozenApproverSet`. In the team-only slot model (slice 4) no slot names an individual, so the block is structurally present but never fires in Phase 1 — team-slot eligibility never blocks (api-contracts §2).
