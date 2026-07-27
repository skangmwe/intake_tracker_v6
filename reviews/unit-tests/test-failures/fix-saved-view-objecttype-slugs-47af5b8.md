# Unit-test failures / coverage gaps — fix-saved-view-objecttype-slugs-47af5b8

## Iteration 1

**None.**

- API (xUnit, SavedView scope): 20/20 passed.
- Database (tSQLt): the new long-slug round-trip case is authored; runs CI-only (not executable locally) — no local failure to record.
- No web changes (the `SavedViewObjectType` TS type already admits any slug via its `(string & {})` arm) — nothing to run.
