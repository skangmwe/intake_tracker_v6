# slice/relationships-schema — code-review findings

**Label:** slice-relationships-schema (first-run; no watermark)
**Scope:** full uncommitted diff on `slice/relationships-schema`
**Iteration:** 1
**Reviewer:** /dev-review-and-remediate (skill-run)

## Iteration 1

### Blocking (High)

| # | File | Rule | Fix class | Finding |
|---|------|------|-----------|---------|
| C-1 | `web/src/features/relationships/RelationshipsSidePanel.tsx` | web-testing.md#component-tests | **Architectural (scope decision)** | Component has no `.test.tsx`. Every component that loads remote data must ship jest + jest-axe tests covering loading / error / empty / populated states. The component shipped without them; the slice doc explicitly defers them to the follow-up cut. |
| C-2 | `web/src/features/relationships/useRelationshipTabs.ts` | web-testing.md#hook-tests | **Architectural (scope decision)** | Hook has no test. `useEffect` cleanup path (`controller.abort()`) is unverified in isolation. Deferred per the slice doc. |
| C-3 | `web/src/features/relationships/api.ts` | web-coding-standards.md#url-utility | **Architectural (scope decision)** | Uses `new URLSearchParams` per function rather than the shared URL builder utility. Consistent with the pattern in `web/src/features/typed-links/api.ts` (also uses direct URL assembly), but flagged for future consolidation. |
| C-4 | `api/Api/Modules/Relationships/RelationshipsService.cs` | api-testing-guidelines.md#service-tests | **Architectural (scope decision)** | Service has no xUnit test class. Every service class must ship happy-path + permanent-failure (no-retry) + cancellation cases. Deferred per the slice doc. |
| C-5 | `api/Api/Modules/Relationships/RelationshipsController.cs` | api-testing-guidelines.md#integration | **Architectural (scope decision)** | Six endpoints; no integration test coverage. Every endpoint needs at least one integration test. Deferred per the slice doc. |
| C-6 | `api/Api/Modules/Relationships/RecordLinksController.cs` | api-testing-guidelines.md#integration | **Architectural (scope decision)** | Three endpoints; no integration test coverage. Deferred per the slice doc. |
| C-7 | `artifacts/docs/dev/architecture/data-model.md` | living-arch-docs | **Architectural (scope decision)** | The Relationships entity + FieldDefinition extensions + RecordLinks table are landed in the DB but not reflected in data-model.md. Slice doc calls this out; needs update before slice completion. |
| C-8 | `artifacts/docs/dev/architecture/api-contracts.md` | living-arch-docs | **Architectural (scope decision)** | The new §Relationships endpoints (including the `/relationship-links` path decision) are not documented. Needs update before slice completion. |
| C-9 | `artifacts/docs/dev/architecture/module-boundaries.md` | living-arch-docs | **Architectural (scope decision)** | The new Relationships module (§27) status update from "planned" to "in progress" is not reflected. Update belongs with the completion of the slice. |
| C-10 | `artifacts/docs/dev/architecture/shared-inventory.md` | living-arch-docs | **Architectural (scope decision)** | `useRelationshipTabs`, `RelationshipsSidePanel`, `GenericRelatedRecordsTab` (still to be written) not recorded. Needs update. |

### Design-conformance gate

- **Result: PASS** — `bash .claude/hooks/check-design-conformance.sh --web-required` completed with `DESIGN-CONFORMANCE-RESULT: verdict=PASS files_scanned=340 violations=0`. Every colour and radius across the 340 scanned `web/src/**/*.css|scss|tsx|jsx` files traces to a design token. The Slice 25 additions in `web/src/features/relationships/` (which use design-system class names `mws-card`, `mws-empty__body`, `mws-badge`, `mws-alert`, `mws-list*`) contribute no raw literals — consistent with the pass.

### Design-fidelity — render & compare

- **Blocking procedural gap:** the design-fidelity walk requires a running Chromium/Edge headless browser to invoke `bash .claude/hooks/render-screenshot.sh` and a running local dev server (via `/local-testing` skill). Neither is available in this session — no `chrome`/`edge` binary reachable, no populated `node_modules` in `web/`. Per the review skill's own contract, "If the render hook exits non-zero for any in-scope screen ... the step is a **blocking failure** under `design-fidelity-web.md#render-failed`: set status OPEN — the gate never skips to a pass on a render it couldn't take."
- **Status: OPEN.** The prototype covers S30, S4, S5 (all in Slice 25's scope-tag). The web changes shipped in this cut are strictly *additive-adjacent* (a new side-panel component, an api client, a hook) — the S4/S5 tab-bar refactor and the S30 Relationships admin tab are the pieces that would actually render differently vs the prototype, and both are deferred to the follow-up cut per the slice doc. So the *material* design-fidelity delta is nil for this cut; the gate still needs to run when the infra is available.

### Non-blocking (Low)

None recorded. The reviewed source is consistent with the module conventions established by Slices 3, 5, 10, 13, and 24.

## Summary (Iteration 1)

- **Blocking findings:** 10 (all architectural — scope decisions carried over from the slice doc).
- **Auto-remediated:** 0 (nothing mechanical this pass).
- **Requires developer decision:** 10 → captured in the batched architectural prompt below.

---

## Iteration 2 (2026-07-16, second-session cut)

**Reviewer:** fresh general-purpose sub-agent (independent of the code's author), scoped to the slice's diff (`git diff HEAD` + untracked in the slice worktree).

### Update on Iteration 1 findings
- **C-1..C-6 (missing tests): RESOLVED.** All six web components + the two API controllers now have colocated test files. `dotnet test`: 548/548 pass (21s). `jest --testPathPattern="(relationships|fields|requests)"`: 1133/1133 pass (~100s) after fixing one asserton (see "auto-remediated" below).
- **C-7..C-10 (missing docs): RESOLVED.** `data-model.md` (§Relationship + §RecordLinks + FieldDefinition v2 columns), `api-contracts.md` (§21 Relationships + two new common.ts error codes), `module-boundaries.md` (§23 Relationships), `shared-inventory.md` (Slice 25 section) all landed. Verified via `git diff HEAD --stat`.

### New findings surfaced this iteration

Findings are ranked severity-first. Every finding cites the concrete failure scenario and lists a proposed fix. All are **Architectural** (require a design decision on how to fix, not just a mechanical apply); none were auto-applied.

#### F-1 [CRITICAL — Correctness] `web/src/features/relationships/RelationshipsAdminTab.tsx:~71` — 409-with-count force-confirm flow is unreachable

**Rule:** `web-coding-standards.md#error-handling` (unhandled promise rejections must not swallow user-facing UX branches)
**Fix class:** Architectural

The retire flow relies on `onSuccess` receiving the 409 response body with `linkCount` so it can swap the dialog to the force-confirm variant. But `apiFetch` throws `ApiError` on any non-2xx status — including 409. That means:

- Admin clicks Retire on a relationship with live RecordLinks
- Server returns 409 with `{ retired: false, linkCount: N, relationshipId }`
- `apiFetch` throws → `useMutation` transitions to error state → `onSuccess` never fires
- Dialog stays on "Retire this relationship?" with `linkCount: null`
- Second click sends `force=false` again → 409 loop; the `force=true` path is unreachable

**Failure scenario:** Any workspace admin trying to retire a Relationship with existing links can never actually retire it via the UI. The whole 409-with-count → force-confirm flow — the primary reason we introduced the retire-response mechanism — doesn't work.

**Proposed fix (needs decision):**
- Option A: `retireRelationship` in `api.ts` wraps `apiFetch`, catches `ApiError` with `status === 409`, and returns `error.problem` cast to `RelationshipRetireResponse` as if it were a success (so `onSuccess` fires with the body).
- Option B: Handle inside `RelationshipsAdminTab`'s mutation `onError` — inspect `error instanceof ApiError && error.status === 409`, extract `error.problem`, `setRetireTarget({ ..., linkCount })` there manually.
- Option C: Enhance `apiFetch` (or introduce `apiFetchExpecting`) to accept a set of "expected non-2xx" statuses that resolve rather than throw. Cleanest but touches shared infra.

Recommendation: **Option A** — smallest surface area, keeps the special-case where it belongs (the retire endpoint's contract is unusual — 409 carries a data payload), and needs no changes to the mutation hook or the component.

#### F-2 [HIGH — Security + Correctness] `api/Api/Modules/Relationships/RecordLinksController.cs:111` — DELETE ignores the recordId path parameter

**Rule:** `api-validation.md#authorization-aware-validation` — "Never trust client-supplied IDs for authorization — always verify ownership server-side before processing."
**Fix class:** Architectural

The DELETE handler explicitly discards `{recordId}` (`_ = recordId; // path-scoping only`) and gates only on Member+ of the query-string workspaceId. Any workspace Member can delete any RecordLink in the workspace by knowing that link's GUID, regardless of which records the link connects.

**Failure scenario:** Member calls `DELETE /records/FAKE-RECORD/relationship-links/{realLinkId}?workspaceId=X` where `realLinkId` belongs to a completely different record in the same workspace. Workspace-membership check passes, path recordId is discarded, proc soft-deletes the link on the unrelated record. Enables silent link deletion across records the caller has no per-record visibility on (if per-record ACLs are ever introduced, this bypasses them).

**Proposed fix (needs decision):**
- Option A: Extend `usp_DeleteRecordLink` to accept `@RecordId` and validate the link's `FromRecordId = @RecordId OR ToRecordId = @RecordId`. Reject with error 50065 on mismatch → 404 at controller.
- Option B: Accept the current shape (workspace-only gating IS the R1 access model per module-boundaries.md; per-record ACL isn't in scope yet). Remove the misleading `path-scoping only` comment; add a note that the recordId is present only for URL semantics, not enforcement.

Recommendation: **Option A** — the current shape violates `api-validation.md` and creates a real cross-record deletion capability. The route says "the link on THIS record" — the API should enforce that.

#### F-3 [HIGH — Security] `database/procedures/relationships/usp_UpsertRecordLink.sql:~51` — A01 IDOR; FromRecordId and ToRecordId are not validated against the workspace

**Rule:** OWASP A01 (Broken Access Control) + `api-validation.md#authorization-aware-validation`
**Fix class:** Architectural

`usp_UpsertRecordLink` validates that the Relationship belongs to `@WorkspaceId` but never validates that `@FromRecordId` or `@ToRecordId` reference records in that workspace (or exist at all). The controller passes both strings through unchecked.

**Failure scenario:** An attacker who is Member of workspace A calls `POST /api/v1/records/REQ-FOREIGN-999/relationship-links?workspaceId=A` with body `{ relationshipId: <A's relationship>, toRecordId: REQ-OTHER-777 }`. The proc accepts arbitrary FromRecordId/ToRecordId strings — including recordIds that live in workspace B or don't exist — and inserts a RecordLinks row scoped to workspace A referencing foreign/nonexistent records. Pollutes workspace A's link space with references to records in other workspaces (data-integrity attack); `usp_ListRecordLinks` LEFT JOINs Requests on WorkspaceId to hydrate display names, so the foreign RecordId strings surface back in list responses; enables silent enumeration of record IDs.

**Proposed fix (needs decision):**
- Option A: Add a check inside `usp_UpsertRecordLink`: `IF NOT EXISTS (SELECT 1 FROM dbo.Requests WHERE RecordId IN (@FromRecordId, @ToRecordId) AND WorkspaceId = @WorkspaceId AND IsDeleted = 0 HAVING COUNT(*) = 2) THROW 50067, 'A record referenced by this link is not in the workspace.', 1;`. FromObjectType/ToObjectType from the Relationship should also be checked (Task/Feature etc.).
- Option B: Push the validation into the controller — resolve `RequestsService.GetByIdAsync` for both ids before calling the service; 404 if either is missing/inaccessible. Simpler but requires two extra round-trips.

Recommendation: **Option A** — one round-trip, atomic; matches the pattern in the crossing-map + escalation procs.

#### F-4 [MEDIUM — Correctness + Security] `api/Api/Modules/Relationships/RelationshipsService.cs:211` — RetireAsync silently swallows NotFound + System-block into 200

**Rule:** `api-error-handling.md` — "Return 404 for missing resources; return 409 for blocked state transitions"
**Fix class:** Mechanical (structural — needs a small type change)

RetireAsync catches ErrNotFound (50060) and ErrSystem (50062) into the same `RelationshipRetireResponse(id, 0, false)`. The controller's mapping (`if (!Retired && LinkCount > 0) 409 else Ok`) returns 200 OK with `retired:false` for both cases. Attempts to retire nonexistent or system relationships look identical to a successful no-op.

**Failure scenario:** WorkspaceAdmin POSTs `/relationships/{unknownOrSystemId}/retire` → 200 OK. No way for the client (or audit log) to distinguish "relationship missing / cross-workspace" from "retired successfully" from "system-blocked". Violates api-error-handling.md.

**Proposed mechanical fix:** Change RetireAsync to return `(RelationshipMutationResult, RelationshipRetireResponse?)` — controller branches on Outcome for 404/409/200 and keeps the retire-specific response shape for the successful/409-with-count path. Or: add distinct SqlException translations that populate a `Detail` field the controller can inspect.

#### F-5 [MEDIUM — Correctness] `api/Api/Modules/Relationships/RelationshipsController.cs:~99` — PATCH doesn't validate tabLabel-when-showAsTab invariant

**Rule:** `api-validation.md` — validation invariants must be consistent between Create and Update
**Fix class:** Mechanical (extract to shared method)

Create's `ValidateCreate` (line 181–213) checks that `showOnFromAsTab=true` requires a non-empty `tabLabel`. Update (PATCH) doesn't run this check — a caller can PATCH `{ showOnFromAsTab: true, tabLabel: '' }` and slip through, rendering a tab whose label silently falls back to fromSideLabel via `useRelationshipTabs`.

**Failure scenario:** Admin PATCHes `{ showOnFromAsTab: true, tabLabel: '' }`. Persists; useRelationshipTabs maps `tabLabel: undefined → fromSideLabel`; the invariant "if a tab is opted in, it must have a distinct label" is silently broken.

**Proposed mechanical fix:** Extract the tabLabel-required check to a private static helper `ValidateShowAsTabHasLabel(bool? show, string? label)` and call from both Create and Update.

#### F-6 [LOW — Correctness] `web/src/features/relationships/useRelationshipTabs.ts:53` — .then handler doesn't check abort signal

**Rule:** `web-component-architecture.md` — "Fetch calls in useEffect must use AbortController to cancel in-flight requests when the component unmounts or dependencies change. When a dependency changes and triggers a new fetch, the previous response must be ignored."
**Fix class:** Mechanical (one-line guard)

The `.catch` and `.finally` handlers check `controller.signal.aborted`, but the `.then` handler does not. A stale-but-successful fetch can overwrite a newer effect's state.

**Failure scenario:** User rapidly switches workspaceId from A to B while A's fetch is in flight. Effect cleanup aborts A's signal, but A's response is already queued in the microtask; A's `.then` still runs, setting the tab bar to A's relationships against B's record.

**Proposed mechanical fix:** Add `if (controller.signal.aborted) return;` at the top of the `.then` handler. Same treatment as `.catch` already has.

### Design-conformance gate (Iteration 2)

**Status:** **INCOMPLETE — infrastructure blocker.** `bash .claude/hooks/check-design-conformance.sh --web-required` was launched twice in this session; both attempts hung at "scanning 347 non-exempt file(s)" for 15+ minutes and were killed. This is a Windows shell performance issue — the hook spawns a subprocess (`sed`, `printf`, `tr`, `grep`) per matched line on Windows Git Bash, where each `fork` is 50–200ms; scanning 347 style-bearing files against 4 regex passes multiplies to tens of thousands of subprocess starts. The hook is not a slice-25 defect — Iteration 1 recorded it as PASS, so it worked at least once before. Likely accumulated files since then have pushed it over the practical limit on this OS.

**Slice-25 scoped verification:** `grep -rEn` for raw hex, `rgb()`/`hsl()` forms, and `border*-radius` across the slice-25-changed files (`web/src/features/relationships/`, `web/src/features/fields/components/SystemProvisionedFieldBand.tsx`) returned **zero matches**. Slice 25 introduced no new CSS files and used only design-system class names in TSX; there is no design-token drift attributable to this slice.

**Recommendation:** Escalate the whole-tree scan performance to a slice-30 (or similar) infra task — either scope the hook to the diff, or port the pattern to a single-pass `awk` script.

### Design-fidelity render + compare (Iteration 2)

**Status: OPEN — NOT ATTEMPTED.** Same reasoning as Iteration 1. LocalDB + dev server + headless Chrome infrastructure not available in this session. The material design-fidelity delta from Iteration 1 (side panel + hook only) is now amplified — this iteration lands the S30 Relationships admin tab + `SystemProvisionedFieldBand` on S30 + the S4/S5 tab-bar refactor + `GenericRelatedRecordsTab`. All three prototyped screens in scope (S4, S5, S30) have new visual surface. This step needs to run when infrastructure allows.

## Summary (Iteration 2)

- **Blocking findings surfaced:** 6 (1 Critical, 2 High, 2 Medium, 1 Low).
- **Auto-remediated (Phase 0 test bug):** 1 — `GenericRelatedRecordsTab.test.tsx:115` asserted `findByRole('heading')` on a `<header>` element; changed to `findByText('Attachments')` + `findByText(/no attachments yet/i)`. Re-ran → 6/6 pass.
- **Requires developer decision:** 6 findings above.
- **Infrastructure blocked:** design-conformance whole-tree scan (Windows shell perf); design-fidelity render+compare (no LocalDB/dev-server/Chrome in this session).

