# slice-task-due-date-4765474 — code-review findings

## Iteration 1

No blocking findings. Database + API middle-tier + web checklists applied to the diff.

- Migrations 088/089 idempotent (`COL_LENGTH`/`NOT EXISTS` guards) with rollbacks; verified apply → rollback → re-apply on LocalDB. 089 mirrors the 075 Global read-only catalog seed.
- All five `TaskRow`-binding procs (`usp_CreateTask`, `usp_PatchTask`, `usp_ApplyTaskBundle`, `usp_GetTasksForRequest`, `usp_GetTaskById`) include `DueDate` in their projection; C# `EXEC` token order matches the new proc param positions. Live round-trip confirms.
- Service threads `CancellationToken` + `ConfigureAwait(false)`; sparse patch semantics correct (present→set, empty→clear, omitted→unchanged); DTO camelCase; no single-letter names.
- Web: `data-ds` present, tokens only (0 conformance violations), formatDate reused.

**Noted (pre-existing, not a slice finding):** `TaskRow.tsx` is 292 lines (limit 250). It was already 282 on dev before this slice; the diff adds 11 lines (the due-date chip). Per code discipline, a pre-existing over-length component is left as-is, not refactored out of scope.
