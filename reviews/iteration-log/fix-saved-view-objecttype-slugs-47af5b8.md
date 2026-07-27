# fix-saved-view-objecttype-slugs-47af5b8 — iteration log

**Label:** fix-saved-view-objecttype-slugs-47af5b8
**Scope source:** uncommitted working tree (backlog items 1 + 2 — saved views accept any custom-object slug: any charset, any length ≤ 64)
**Files reviewed:** 5 (2 API [1 source, 1 test], 3 DB [2 procs, 1 test])
- `api/Api/Modules/SavedViews/SavedViewDtos.cs` (API — source)
- `api/Api.Tests/SavedViewUpsertValidationTests.cs` (API — test)
- `database/procedures/saved-views/usp_UpsertSavedView.sql` (DB — proc)
- `database/procedures/saved-views/usp_ListSavedViews.sql` (DB — proc)
- `database/tests/saved-views/test_SavedViews.sql` (DB — test)
**Layers in scope:** API + Database. **No frontend files** — design-conformance and design-fidelity gates do not apply.
**Started:** 2026-07-27T13:10:00Z
**Ended:** 2026-07-27T13:26:00Z
**Final status:** CLEAN

## Iteration 1 — 0 code findings, 0 security findings

### Phase 0 — unit tests
- **API (xUnit):** `dotnet test --filter "FullyQualifiedName~SavedView"` → **20 passed / 20** (includes new `ObjectType_PunctuationSlug_IsValid` — the item-1 fix — and `ObjectType_TooLong_IsInvalid` — MaxLength coverage; existing SavedViews controller/list tests unaffected).
- **Database (tSQLt):** `SavedViewTests.[test_UpsertAndListPreserveLongCustomObjectSlug]` added — CI-only (cannot run locally). Authored TDD: RED against the un-widened procs (a 24-char slug truncates to 16 at the `NVARCHAR(16)` param boundary → the write assertion fails), GREEN against the widened procs. Widened the test's `#Rows` temp table `ObjectType NVARCHAR(16)→64` so the test itself can't mask the fix.
- **Gap-fill:** none. Existing `ObjectType_MalformedSlug_IsInvalid` was removed (moot after dropping the charset regex) and replaced by the two cases above.

### Phase 1 — code review (0 findings)
- `SavedViewDtos.cs`: enumerating `[RegularExpression]` dropped → `[Required] [MaxLength(64)]`, mirroring `FieldDefinitionUpsertRequest.ObjectType` (Slice 2a). The ObjectKey slug generator keeps apostrophes/punctuation (only whitespace/`_`/`&`/`/` → `-`), so a charset regex wrongly 400'd legitimate slugs like `o'brien-vendors`; length remains bounded; validity is app-enforced (a stray view is inert, BS §22.4).
- `usp_UpsertSavedView` / `usp_ListSavedViews`: `@ObjectType` param + `@ObjType` local `NVARCHAR(16)→64` to match the `SavedView.ObjectType` column (widened by migration 086). **No new migration** — the column is already 64; this is a `CREATE OR ALTER` proc-body change only. `SET NOCOUNT`/`XACT_ABORT` intact, fully parameterized, headers updated.
- `SavedViewsService` passes `new SqlParameter("@ObjectType", value)` with **no explicit `Size`** → length inferred from the value, no C#-side truncation. No service change needed.

### Phase 2 — security review (0 findings introduced)
- A03 injection: `@ObjectType` flows only as a bound `SqlParameter` into parameterized `EXEC` — never concatenated; loosening the charset regex is safe (opaque data, still ≤64). A01: no access-logic change; a stray/garbage ObjectType view matches no real surface and never widens access. Input validation stays `[Required]`+`[MaxLength]` per `api-validation.md`.
- **Out-of-scope (non-blocking, not introduced by this slice):** `Api.Tests` `NU1903` (`System.Security.Cryptography.Xml 10.0.7`) transitive advisory — pre-existing on `dev`; no `.csproj`/dependency touched here.

- Auto-applied: none. Architectural surfaced: none. Developer decisions: none.
- End-of-iteration open set: {} (empty)

## Final Status: CLEAN
- Total iterations: 1
- Total findings fixed: 0
- Architectural deferred/rejected: 0
