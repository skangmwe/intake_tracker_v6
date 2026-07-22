# Slice — Scope the workspace Fields tab to the workspace

**Branch:** `fix/scope-workspace-fields` · **Date:** 2026-07-21 · **Tier touched:** Stored procedure (DB read)

## Goal

The workspace → Fields & objects → **Fields** tab (S30) currently lists fields that are not this
workspace's: Global fields owned by *other* workspaces, and platform-defined fields. It should show
only the fields that belong to this workspace. Platform-inherited fields are surfaced on the Platform
Fields & objects screen (S34), not the workspace one.

## Decision (from brainstorming)

The workspace Fields tab shows:

- **System auto-fields** (Record ID, Name, dates, Created by) — read-only, synthesised in the API,
  unchanged.
- This workspace's own **Local** fields.
- This workspace's own **Global** fields (created here — `IsLocal = 1`).

It **excludes** Global fields owned by other workspaces and platform-defined fields
(`IsPlatformDefined = 1`). Objects and Relationships tabs already read `WHERE WorkspaceId = @Ws`
and needed no change.

## Change (one proc)

`database/procedures/fields/usp_GetWorkspaceFieldCatalog.sql` — tighten the scope WHERE from
`AND (d.WorkspaceId = @WorkspaceIdLocal OR d.Location = N'Global')` to
`AND d.WorkspaceId = @WorkspaceIdLocal AND d.IsPlatformDefined = 0`.

The filter is applied at the source so foreign-Global and platform-defined rows never enter the
payload. `BuildCatalogRows` in the API is unchanged: its `!IsLocal` / `IsPlatformDefined`
read-only handling stays as a defensive pure-function contract (still unit-tested directly), it
simply never receives those rows in production now. No migration — `CREATE OR ALTER PROCEDURE`,
applied via the procedures folder.

## Tests

`database/tests/fields/test_usp_GetWorkspaceFieldCatalog.sql` — rewritten to the new contract:
own Local + own Global returned (own Global flagged `IsLocal = 1`); foreign-Global excluded;
platform-defined excluded; foreign-Global excluded even on a key collision with an own Local;
soft-deleted excluded. API `FieldCatalogBuilderTests` and web catalog tests are unaffected (they
exercise the pure builder / mocked service, not the proc).

## Accepted consequence

A Global field created in workspace A no longer appears in workspace B's Fields admin (only on the
Platform screen). It still applies to B's records; it is just not visible/editable in B's field
admin. This is the intended "platform-inherited fields live under Platform" behaviour.

## Out of scope

- **Slice B** — rebuild the Platform Fields & objects screen into the tabbed catalog table
  (Fields / Objects / Relationships at platform scope). Deferred to a separate slice.
- The Slice B data-model decision (what "Platform Fields" contains: the central `dbo.PlatformField`
  store, the union of all Global fields, or both) is deferred to that slice's design pass.
