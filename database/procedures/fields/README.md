# Field-schema procedures (Slice 3 — Fields & objects)

Stored procedures for the workspace field schema engine (BS §2.3, §3, §17). The API's
Fields module (`api/Api/Modules/Fields/`) calls these; joins/writes go through procs per
`api-data-access.md`, single-table reads stay in EF.

| Proc | Purpose |
|---|---|
| `usp_GetWorkspaceFields` | Field definitions for a (workspace, object), DerivedField header folded in. |
| `usp_GetWorkspaceFieldOptions` | Select options keyed by field. |
| `usp_GetWorkspaceFieldRules` | Condition-engine rules keyed by target field. |
| `usp_GetWorkspaceFieldDependencies` | Dependency edges for the acyclic + depth≤3 check (run in the ConditionEngine). |
| `usp_UpsertFieldDefinition` | Insert/update a field + replace its options/rules/derived/edges (transactional). |
| `usp_RetireFieldDefinition` | Retire a field (IsRetired) with the platform-defined + dependency guards. |

Platform-field procs (S34) live in `../platform/`.
