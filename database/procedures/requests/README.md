# Requests procedures

Stored procedures for the Requests core (slice 5). Data access for anything beyond
single-table EF CRUD goes through these (per `api-data-access.md`). All are
`CREATE OR ALTER`, re-applied on every migrations-runner pass.

| Proc | Purpose |
|---|---|
| `usp_CreateRequest` | Mint ID + insert one Request row (single transaction, resolves Origin). |
| `usp_GetRequestByIdForUser` | Access-baked read of one record for a user (0 rows = 403). |
| `usp_QueryRequests` | Requests list (S2) — filtered/sorted/paginated page + total count. |
| `usp_PatchRequest` | Name/description/field-map update with RowVer ETag concurrency (THROW 50040 stale). |
| `usp_SetRequestStage` | Move stage; validates the target is on the record's lifecycle (THROW 50041). No gates (slice 8). |
| `usp_SetRequestHold` | Set/clear the Hold flag in the field map. |
| `usp_SaveDraft` | Upsert a personal Draft (owner-scoped). |
| `usp_GetDraftsForUser` | List the caller's own Drafts (S26). |
| `usp_GetDraftById` | Read one owner-scoped Draft. |
| `usp_DeleteDraft` | Hard-delete a Draft (sole exception to the no-hard-delete floor). |
| `usp_EscalateRequest` | Escalate a PG record (slice 9) — one-time/one-way guard, snapshot + lock crossing fields, adopt the shared ID onto a new AI-side row at Intake. |
| `usp_GetBridgeForRecord` | Escalation-bridge inputs for a record (slice 9) — caller-side membership-gated, AI-side system read for the mirror; 0 rows = not escalated / not visible. |
| `usp_GetCrossingFields` | The workspace's Request crossing fields ([S]) (slice 9) — read off `FieldDefinition` for the snapshot + AI-side map. |

Error numbers: `50040` stale ETag, `50041` invalid stage, `50043` request not found,
`50044` already escalated, `50045` no AI Solutions workspace, `50046` cannot escalate an AI record,
`50047` AI lifecycle/stage misconfigured.
