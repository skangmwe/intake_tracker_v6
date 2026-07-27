# Unit tests added / extended — fix-saved-view-objecttype-slugs-47af5b8

## Iteration 1

### API (xUnit) — `SavedViewUpsertValidationTests.cs`
- **Removed** `ObjectType_MalformedSlug_IsInvalid` (asserted `"Bad Slug!"` invalid via the charset regex — moot now the regex is dropped).
- **Added** `ObjectType_PunctuationSlug_IsValid` — `o'brien-vendors` validates (the item-1 fix; the old regex 400'd it).
- **Added** `ObjectType_TooLong_IsInvalid` — 65-char value rejected by `[MaxLength(64)]`.
- Kept `CustomSlug_IsValid` (`vendor`), `BuiltIn_IsValid` (`Request`), `Empty_IsInvalid` (`[Required]`).
- Run: `dotnet test --filter "FullyQualifiedName~SavedView"` → **20 passed / 20**.

### Database (tSQLt) — `test_SavedViews.sql`
- **Added** `SavedViewTests.[test_UpsertAndListPreserveLongCustomObjectSlug]` — a 24-char slug survives the upsert write (full value stored, not truncated to 16) and round-trips through `usp_ListSavedViews`. Widened the test's `#Rows` temp table `ObjectType NVARCHAR(16)→64` so the harness can't mask truncation.
- Execution: **CI-only** in this environment. TDD: RED against un-widened procs (write assertion fails on the 16-char truncation), GREEN against the widened procs.
