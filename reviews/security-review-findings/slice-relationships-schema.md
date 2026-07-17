# slice/relationships-schema — security-review findings

**Label:** slice-relationships-schema
**Scope:** full uncommitted diff on `slice/relationships-schema`
**Iteration:** 1
**Reviewer:** /dev-review-and-remediate (skill-run)

## Iteration 1

### Blocking (Critical / High)

None identified in the reviewed slice.

### Reviewed and passing (no finding)

| Area | Notes |
|---|---|
| SQL injection | Every stored-procedure invocation from `RelationshipsService` uses `SqlParameter` binding — no string interpolation or concatenation into the SQL string. Confirms with `api-data-access.md`'s mandatory parameterization rule. |
| Authorization | Every controller endpoint gates access via `IAccessGuard.HasWorkspaceLevelAsync` at the correct level (`Viewer` for reads, `WorkspaceAdmin` for definition mutations, `Member` for record-link mutations). The Access-Denied response returns `403` with ProblemDetails — never `404` (BS §22.6 boundary rule). |
| Access-denied vs not-found | `RelationshipsService.GetByIdAsync` returns null on both "workspace not accessible" and "id not present" — the controller collapses both into `NotFound()` after the access-guard has already gated the workspace. That matches the api-error-handling contract: if the caller can't see the workspace at all, they get `403` from the access-guard; if they can see the workspace but the id is not present in it, they get `404` (which is legitimate — existence isn't hidden within an accessible workspace). |
| SQL injection in Migration DDL | Migrations 055–059 use plain DDL literals only; no dynamic SQL. |
| Cross-workspace leakage | `RecordLinks.WorkspaceId` is stored per-side (like Watcher / Comment / AuditEntry) — an escalated record's two shared-RecordId rows keep distinct link rosters. `usp_ListRecordLinks` filters by the caller's `WorkspaceId`, so the PG side never sees the AI side's links (BS §6.1 no-second-linked-path floor). |
| Rate limiting | Endpoints inherit the global rate-limiter registered in `Program.cs`. No per-endpoint bypass. |
| PII in logs | New procs and service methods use only `WorkspaceId`, `RecordId` (prefix-sequence string, not PII), and the `sub`-derived `ActorUserId`. No display names, emails, or free text logged. Consistent with `api-pii-handling.md`. |
| Idempotency & concurrency | `usp_UpsertRecordLink` is idempotent on the (relationship, from, to) triple (unique-filtered index UX_RecordLinks_RelFromTo + explicit pre-select). `usp_UpsertRelationship` uses a single explicit `BEGIN TRANSACTION` for the auto-provisioning insert — atomic across Relationship + FieldDefinition rows. |
| Managed Identity for storage/keyvault | Slice does not touch storage or Key Vault. Nothing to review. |
| Input validation | `RelationshipsController.ValidateCreate` returns `400 ValidationProblemDetails` on missing/invalid fields (Cardinality enum, required labels, tab-label-when-tab-enabled). `RecordLinksController` validates `toRecordId` non-empty + non-self-referential. |
| SQL Server error-code mapping | Service catches `SqlException` only for the reserved 50060–50063 range; anything else propagates to the global exception handler (which does not leak stack traces per api-error-handling.md). |

### Design-conformance gate

Same procedural gap as the code-review findings — the hook didn't complete within the session budget. Not a security issue; noted for cross-reference.

## Summary (Iteration 1)

- **Blocking security findings:** 0.
- **All identified security concerns:** already handled by the shipped implementation.
- **Non-blocking observations:** the `web/src/features/relationships/api.ts` client uses `apiFetch` (bearer-authenticated wrapper); the credential path is inherited unchanged.

---

## Iteration 2 (2026-07-16, second-session cut)

**Reviewer:** fresh general-purpose sub-agent (independent of the code's author), scoped to the same files as Iteration 1 plus the new S30 admin surface + config-driven tab bar refactor.

Iteration 2 surfaces two blocking security findings that Iteration 1 did not (Iteration 1 reviewed the earlier state of the same files; new adversarial pass caught them). See also `code-review-findings/slice-relationships-schema.md` — F-2 and F-3 there are the same access-control issues from the correctness angle.

### Blocking (Critical / High)

#### S-1 [HIGH — A01 Broken Access Control] `database/procedures/relationships/usp_UpsertRecordLink.sql:~51`

**OWASP:** A01 (IDOR)
**Rule:** `api-validation.md#authorization-aware-validation`; `api-record-access.md`
**Fix class:** Architectural

`usp_UpsertRecordLink` validates the Relationship belongs to `@WorkspaceId` but does not validate that `@FromRecordId` or `@ToRecordId` reference records that exist in that workspace. `RecordLinksController.Create` takes `recordId` as an unvalidated `[FromRoute] string` and `toRecordId` from the request body — both flow through untouched.

**Attack scenario:** An attacker who is Member of workspace A sends `POST /api/v1/records/REQ-FOREIGN-999/relationship-links?workspaceId=A` with body `{ relationshipId: <A's relationship>, toRecordId: REQ-OTHER-777 }`. The proc accepts arbitrary FromRecordId/ToRecordId strings — including recordIds that live in workspace B or don't exist — and inserts a `RecordLinks` row scoped to workspace A referencing foreign/nonexistent records. Pollutes workspace A's link space with references to records in other workspaces (data-integrity attack); because `usp_ListRecordLinks` LEFT JOINs Requests on WorkspaceId to hydrate display names, the foreign RecordId strings surface back in list responses; enables silent enumeration of record IDs by observing which POSTs succeed.

**Proposed fix:** Add existence + workspace-scope guards to `usp_UpsertRecordLink` — reject with 50067 if either recordId is missing or in a different workspace. Should also validate that the record's object-type matches the Relationship's From/ToObjectType.

#### S-2 [MEDIUM — A01 Broken Access Control] `api/Api/Modules/Relationships/RecordLinksController.cs:111`

**OWASP:** A01 (Broken Access Control — path-scope bypass)
**Rule:** `api-validation.md#authorization-aware-validation`
**Fix class:** Architectural

The DELETE handler explicitly ignores `{recordId}` (`_ = recordId; // path-scoping only;`) and gates only on Member+ of the query-string workspaceId. Any Member of the workspace can delete any RecordLink in that workspace by supplying that link's linkId — the URL's recordId is decorative.

**Attack scenario:** A Member of workspace A discovers a linkId belonging to two records they should not be allowed to unlink (via GET on records they can see, or by enumeration). They call `DELETE /api/v1/records/ANY-RECORD/relationship-links/{targetLinkId}?workspaceId=A`. Because the controller doesn't verify that `{targetLinkId}.FromRecordId` or `.ToRecordId` matches the route recordId, the delete proceeds. If per-record permissions ever tighten below workspace-Member (or a future ObjectVisibility rule is added), this bypasses them silently.

**Proposed fix:** Same as F-2 in `code-review-findings/slice-relationships-schema.md`. Option A extends `usp_DeleteRecordLink` with a `@RecordId` param and validates the link's endpoints match; Option B accepts the current shape as R1's documented access model and removes the misleading comment.

### Reviewed and passing (Iteration 2 — carrying forward)

Same as Iteration 1's list, plus:
- **PATCH endpoints** now correctly gate on WorkspaceAdmin (verified in `RelationshipsControllerTests`).
- **The new `SystemProvisionedFieldBand`** is a pure display surface with no server writes — no OWASP concerns.
- **The `RelationshipsAdminTab`** submits through `useCreateRelationship` / `usePatchRelationship` / `useRetireRelationship` / `useRestoreRelationship` — all bearer-authenticated via the standard `apiFetch` path; no new credential surface.
- **The config-driven tab bar** in `RecordDetailPage` reads relationships via `useRelationshipTabs` (scoped to the record's workspace by construction) — no cross-workspace read possible.

## Summary (Iteration 2)

- **Blocking security findings:** 2 (S-1 High + S-2 Medium — both A01 / IDOR).
- **Auto-remediated:** 0 (both are architectural — need design decisions).
- **Requires developer decision:** batched with code-review findings F-1..F-6 in the architectural prompt.
