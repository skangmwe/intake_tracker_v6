# fix-member-menu-descriptions-786fbcd — code review findings

**Scope:** web/src/features/users (RowActionsMenu + test, users.css)
**Ran:** 2026-07-22T02:56:49Z

## Iteration 1
No findings. Each member row-action gains a leading Phosphor icon (regular weight, 16px) + a
one-line description; destructive rows (Remove, Cancel invitation) read in `--color-error`.
Descriptions are linked via `aria-describedby` so the accessible name stays the bare action.
The two-line item layout is a private in-file `MenuItem` sub-component (web-component-architecture.md
sanctioned extraction); styles scoped to `.users-access__row-menu` so the shared account/bell menus
are unaffected. Tokens only; lint 0; tsc clean on changed files.
