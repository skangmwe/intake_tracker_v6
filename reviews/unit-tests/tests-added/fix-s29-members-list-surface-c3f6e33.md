# fix-s29-members-list-surface-c3f6e33 — tests added / extended

## Iteration 1
- **DB:** `test_usp_SetMemberSuspension.sql` (tSQLt, 5 cases: suspend disables-but-keeps-membership, reactivate, suspend-signoff-block, reactivate-not-blocked, no-membership-no-op). Authored; unrun locally (framework not vendored — Deferred environment gate).
- **API:** `MembersControllerTests` — `SetSuspension` 204 (theory true/false), 409 blocked, 403 not-admin. `MembersEndpointsTests` — suspension endpoint 401 without token. **35 members tests pass.**
- **Web:** new `membersView.test.ts` (sort/filter/paginate incl. text/date branches), `RowActionsMenu.test.tsx` (status-dependent actions + keyboard + axe), `EditMemberDialog.test.tsx` (edit/save/cancel/pending + axe); extended `MembersTable`/`MembersPanel`/`DeactivateMemberDialog`/`api` tests for the new menu + suspension + remove-relabel. **80 users tests pass; jest-axe across menu/dialog/filter/keyboard states.**
