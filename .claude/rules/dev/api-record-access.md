# Record-Level Access — API Rules (Tier 1)

Tier 1 apps may control who sees which rows using any of the patterns below, alone or
combined. They all run on the standard stack (controllers + EF Core + SQL) — no extra
infrastructure. These rules are about doing it **safely**, not about restricting which
pattern you pick.

## Supported patterns (use any, or combine)

- **Role-wide** — a role sees all rows of a resource (e.g. every Reviewer sees all).
- **Ownership** — a user sees rows they created (`CreatedBy`).
- **Role-scoped** — a role sees rows matching a record attribute (e.g. a PG Leader sees
  rows where `PracticeGroup` = theirs). Deterministic from role + a column.
- **Assignment** — an admin assigns specific users to specific rows via a join table
  (e.g. `RecordAssignments`); two users with the same role can see different rows.

They **compose as OR**: a caller sees a row if any applicable rule grants it (owns it, OR
their role-scope matches, OR they're assigned). A user with multiple roles sees the union.

## Out of scope — escalate to the higher tier

Access derived from **external client-matter / ethical-wall membership** — row visibility
that comes from a client/matter relationship in another firm system, or privileged-content
walls. That is the genuinely sensitive case and stays out of Tier 1.

## Guardrails (mandatory — row-level access is where leaks happen)

- **One authoritative access check, server-side, on every read path** — list, detail, AND
  every related resource (child rows, attachments, comments). No endpoint trusts the UI or
  a prior check.
- **List/query endpoints filter in the query** (WHERE / join) to the caller's allowed set —
  never fetch-all-then-hide.
- **Detail / by-id and every mutation re-apply the same check** — an inaccessible row
  returns **403, never 404**, and is never mutated.
- **Access source is app-managed** — `CreatedBy`, a role/claim, or an in-app assignment
  table. Never derived from an external client/matter system (that is the escalation case
  above).
- **Assignment changes are admin-only and audited** (the six audit columns).
- **Field-level visibility**, if required, is enforced at the API — not just hidden in the UI.

## Tests

- Per role/pattern: a user sees exactly the rows the rule grants, and gets **403** on one it
  does not (list excludes it; by-id rejects it).
- A same-role user with a different assignment/scope sees a different set.
