# Unit tests added / extended — fix-scope-workspace-fields-786fbcd

## Iteration 1

`database/tests/fields/test_usp_GetWorkspaceFieldCatalog.sql` — rewritten to the new scope contract:

- `test_ReturnsOwnLocalAndOwnGlobalExcludesForeignAndPlatform` (rewrite of the former
  `test_ReturnsLocalAndGlobalAcrossObjects`) — own Local + own Global returned (own Global flagged
  `IsLocal = 1`); a Global owned by another workspace and a platform-defined field are both excluded.
- `test_ExcludesForeignGlobalCollisionAndSoftDeleted` (rewrite of the former
  `test_PrefersLocalOverGlobalOnKeyCollisionAndExcludesDeleted`) — a foreign Global sharing a key
  with an own Local no longer surfaces (collision resolves to the own row); soft-deleted excluded.
- `test_WorkspaceOwningNoFieldsReturnsEmpty` (new — required empty-input case per
  `database-testing.md`) — a workspace owning no fields returns zero rows; foreign Globals do not leak in.

All three run green against LocalDB `AiSolutionsTracker` (3/3 Success).
