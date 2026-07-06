# slice-users-access-4a32c37 — tests added / extended

## Iteration 1

Tests were authored by `/dev-build-application` as part of the slice. Phase 0 ran them and fixed one test-setup bug (below). No coverage gap-fill was required — the required behaviour cases are covered.

### Authored in-slice (verified running this pass)

**Database (tSQLt — authored; not executed: framework not vendored, see test-failures):**
- `test_usp_ListWorkspaceMembers.sql` — projection, soft-deleted-membership exclusion, other-workspace isolation, disabled-account inclusion.
- `test_usp_UpsertWorkspaceMembership.sql` — email-resolve add, add-by-id, level change, reactivate soft-deleted, no-match/ambiguous THROW, idempotency.
- `test_usp_DeactivateMember.sql` — disable+remove, pending-named-individual block (409 path), team-slot-does-not-block, idempotent re-deactivate.

**API (xUnit — 22/22 pass):**
- `MembersControllerTests.cs` — list/upsert/deactivate happy paths, each outcome (unresolved/ambiguous 400, blocked 409), 403 branches, cancellation propagation.
- `MembersEndpointsTests.cs` — 401-gating for GET/POST/DELETE (mounted + gated).
- `MembershipUpsertRequestTests.cs` — exactly-one-of userId/email validation (4 branches).

**Web (jest + jest-axe — 27/27 pass):**
- `api.test.ts`, `useMembers.test.tsx`, `AddMemberForm.test.tsx`, `MembersTable.test.tsx`, `DeactivateMemberDialog.test.tsx`, `UsersAccessPage.test.tsx` — behaviour + axe across each meaningfully-different state.

### Extended this pass (Phase 0 mechanical fix)
- `UsersAccessPage.test.tsx` — added a `renderPage(me)` helper that resolves the mocked `fetchMe` with the seeded `me`, fixing a test-setup bug (see test-failures + remediations).
