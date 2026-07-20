# fix-s29-members-list-surface-c3f6e33 — code review

## Iteration 1
Layers in scope: database (proc), API (controller/service/DTO), frontend (users feature + shared Table/Layout).

**Design conformance (frontend):** PASS — tokens only in all changed styles.

No open findings. Notes on the checklist walk:
- **DB (`usp_SetMemberSuspension`):** `SET NOCOUNT ON`/`SET XACT_ABORT ON`; TRY/CATCH with explicit transaction + `@@TRANCOUNT` guard; `THROW` re-raise; header comment; parameters copied to locals; scoped to a live workspace membership (no firm-wide disable of a non-member); idempotent; no `SELECT *` (no result set). Mirrors `usp_DeactivateMember`.
- **API:** controller routes/validates/authorizes only (WorkspaceAdmin guard, 403-never-404, ProblemDetails); `MemberSuspensionRequest` uses `[Required] bool?` so a missing flag is a 400. Service parameterizes every value as `SqlParameter`, passes `CancellationToken`, catches the specific `50030` guard number (no exceptions for expected control flow), emits one spine event, logs no PII.
- **Frontend:** `EditMemberDialog` renders three states; `RowActionsMenu` is a portaled `role="menu"` with `aria-haspopup`/`aria-expanded`, arrow-key roving focus, Escape/outside-dismiss, viewport-clamped fixed position; `MembersPanel` stays within the component-length limit; `TableShell` `flex` flag is additive and defaults to prior behaviour; `SideNavLayout` `data-layout="wide"` is the sanctioned cap opt-out. `data-ds` retained on design-system roots.
