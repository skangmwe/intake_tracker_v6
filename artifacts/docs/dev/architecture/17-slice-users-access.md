---
slice: 17-users-access
capability: A workspace admin manages membership — assigns Viewer/Member/WorkspaceAdmin level and deactivates users (S29).
spec-section: BS §4.2 (access levels), §6.8 (deactivation and reassignment)
started: 2026-07-06T07:15:11-04:00
ended: 2026-07-06T07:43:52-04:00
duration: 00:28:41
---

# Slice 17 — Users & access admin (S29)

S29 is a `[deferred]` screen (no prototype), built from the blueprint spec and styled from the
design system. No new tables — it reuses `WorkspaceMembership`, `Users`, and `ApprovalRequests`.
Three procs, a `Users`-module `MembersController`/`MembersService`, and the web surface (members
table + add-by-email form + destructive-confirm deactivate). Routed at `/admin/users`.

## Decisions

1. **`MembershipUpsertRequest` refined to `{ userId?, email?, level }` (exactly one).** The locked
   contract was `{ userId, level }`, but R1 ships **no user-directory endpoint**, so the S29 "Add
   member" affordance cannot produce a `userId` for a new member. The `email` path resolves a typed
   email → a real active platform user server-side (`usp_UpsertWorkspaceMembership`, unresolved →
   `400`/50020, ambiguous → `400`/50021), mirroring `usp_AddApproverTeamMember` (slice 4). The
   `userId` path still changes an existing member's level. `api-contracts.md §2` and the shared type
   were updated before build; a self-validating `IValidatableObject` rejects both-or-neither.

2. **Deactivate disables the account firm-wide AND removes the workspace membership**
   (analyst-confirmed). Per BS §6.8 ("the account is disabled immediately"), `usp_DeactivateMember`
   sets `Users.IsDisabled = 1` (firm-wide — the slice-12 fan-out already suppresses notifications to
   disabled accounts, which makes that acceptance criterion demonstrable) and soft-deletes the
   member's membership **in this workspace** (WorkspaceAdmin authority is local; other-workspace
   memberships remain, but the disabled account can't sign in or be notified). Idempotent.

3. **The §6.8 `409` block is honoured but never fires in Phase 1.** BS §6.8 blocks deactivating a
   user with a *pending named-individual sign-off*. In the **team-only slot model** (slice 4
   reconciliation) no gate slot names an individual, so `usp_DeactivateMember` scans
   `ApprovalRequests.FrozenApproverSet` for a slot `namedUserId` marker (OPENJSON) — a structure that
   is present and tested (a crafted frozen set proves the `409`), but that no real Phase-1 gate
   produces. **Being a sole eligible team member does not block** deactivation (api-contracts §2:
   "Team-slot sign-offs don't block"). If named-individual slots are ever added, the guard already
   works.

## Notes

- The whole surface is **WorkspaceAdmin-only** (the S29 audience; the list exposes member PII), so
  `GET /members` was added and gated at WorkspaceAdmin alongside the contract's POST/DELETE.
- Procs are **not access-gate procs** — the controller `AccessGuard` is the authoritative check
  (approver-team precedent); each write proc runs in one transaction and the service emits one
  event (`membership.updated` / `member.deactivated`) on the spine for the audit consumer.
- Pre-existing 13 `tsc` errors in slice 6/8/11/12 **test** files are unchanged (0 new); left per the
  slice-15/16 cleanup deferral. API + API.Tests build clean.
