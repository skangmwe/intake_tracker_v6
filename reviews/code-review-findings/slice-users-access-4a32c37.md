# slice-users-access-4a32c37 — code review

## Iteration 1

**Scope:** slice-17 diff — DB procs (`usp_ListWorkspaceMembers` / `usp_UpsertWorkspaceMembership` / `usp_DeactivateMember`) + tSQLt, API `Users` module (`MembersController` / `MembersService` / `MembersDtos`, `Entities.cs` / `AppDbContext.cs` / `Program.cs` deltas), shared types, web `features/users`.

### Deterministic design-conformance gate — RAN, PASS
`check-design-conformance.sh --web-required` → **PASS** — `verdict=PASS files_scanned=220 violations=0`. Every colour/radius in the new `users.css` and the touched `.tsx` traces to a design token; the fidelity-property check is clean.

### Database (`database-*.md`)
- `SET NOCOUNT ON` / `SET XACT_ABORT ON`, `TRY…CATCH` + explicit `BEGIN/COMMIT/ROLLBACK`, `THROW` re-raise, parameter-sniffing locals, explicit column lists (no `SELECT *`), soft-delete filters, `ORDER BY` — all conform.
- Writes are idempotent; upsert reactivates a soft-deleted row rather than duplicating; deactivate is a no-op when already applied.
- Not access-gate procs — the controller `AccessGuard` is the authoritative check (approver-team precedent), so no result-set-shadowing risk (`database-stored-procedures.md` access-gate rule N/A).

### API (`api-*.md`)
- Controller: request/response + auth only, no business logic; `WorkspaceAdmin`-gated; 403≠404; RFC-7807 ProblemDetails with plain-language detail; `CancellationToken` threaded on every action.
- Service: `CancellationToken` + `ConfigureAwait(false)` throughout; SqlException→outcome (no exceptions for expected control flow); parameterized `EXEC`; `DateTime.SpecifyKind(Utc)` on the stored-UTC timestamp so it serializes with `Z`.
- DTO: `IValidatableObject` enforces "exactly one of userId/email"; `[EmailAddress]` + `[RegularExpression]` on level.

### Web (`web-*.md`, `accessibility.md`)
- One component per file, typed prop interfaces (no `any`, no `React.FC`); components well under the 200-line ceiling; colocated `.test.tsx` with jest-axe per meaningfully-different state.
- `UsersAccessPage` renders all three non-data states (loading / error / empty) explicitly; destructive deactivate goes through a focus-trapped confirm modal (`disclosure-surfaces.md`).
- Inline level `<select>` carries a per-row `aria-label`; the members-table scroll region is keyboard-focusable; `data-ds` handles inherited from shared primitives.
- Enumerable options (`LEVEL_OPTIONS`) are a module-level constant; no magic numbers; no `console.*`; URL built via the shared `apiFetch` client.

### Findings
| # | Severity | Fix class | Item | Disposition |
|---|---|---|---|---|
| 1 | Low | Architectural | `GET /members` is unpaginated. | **Accepted.** Consistent with the established unpaginated admin-config reads (`GET /approver-teams`, `GET /lifecycle`); workspace membership is bounded admin data, not a growing data table. Non-blocking. |
| 2 | Low | (n/a) | `MembersService.EmitAsync` builds `JsonSerializerOptions` inline rather than reusing a static field like `LifecycleService`. | **Accepted** style nit — correct and clear; not worth a churn edit (surgical-change rule). |

**No High/Critical. No mechanical fixes required in this phase.**

> Phase-0 note: one mechanical **test-setup** bug was found and fixed during unit-test execution — `UsersAccessPage.test.tsx` auto-mocked `fetchMe` to `undefined`, erroring the seeded `/users/me` query mid-test. Fixed by resolving `fetchMe` with the seeded `me` (`renderPage` helper). Source was correct. See `remediations-applied/`.
