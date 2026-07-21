# Announcements screen reconciliation — design spec

**Date:** 2026-07-21
**Owner:** (dev) · reconciles the built Announcements admin surface toward the Claude Design prototype
**Depth:** C — full lifecycle with a scheduler
**Status:** approved design → building slice 1 (DB + API)

---

## 1. Context

The workspace-settings **Announcements** screen (`ManageAnnouncementsPage`) and its editor
(`AnnouncementEditor`) diverged from the approved prototype. The prototype shows:

- **List:** a data table with columns **ANNOUNCEMENT · POSTED BY · POSTED · STATUS** (per-column
  filter affordance) and a pagination footer. Status badges: **Active** (pale green), **Scheduled**
  (pale blue), **Archived** (bordered/neutral).
- **Editor modal:** a text body, a **POSTED BY** person dropdown, a **STATUS** dropdown, and an
  **AUTO-ARCHIVE AFTER 30 DAYS** toggle with a computed "moves to Archived on {date}" helper.
  Footer **CANCEL / ADD**.

The current build instead renders an `.ann-list` `<ul>` and an editor with Title / Body / Audience /
Roles / People / Expiry / Pin. The backend is also thinner than the shared TS types imply:

- `dbo.Announcements.Status` CHECK allows only `{Draft, Published, Retired}` — `Scheduled` /
  `Archived` are **not** stored states.
- No `AutoArchive` / `ScheduledPublishAt` / `AutoArchiveAt` columns.
- `usp_CreateAnnouncement` sets `AuthorUserId = actor` (you cannot post as anyone else).
- `AnnouncementDto` (C#) / `Map()` never populate the aspirational v2 fields.
- No scheduler exists for announcements.

So the prototype's Scheduled/Archived statuses, auto-archive, status-at-create, and person-selectable
"posted by" are **net-new full-stack work**, not a reskin.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Scope | **Both** screens (list table + editor modal) |
| Depth | **C** — full lifecycle + scheduler |
| Editor field set | Match prototype: **drop Audience + Expiry**; **keep Title + Body** (2 fields); **keep Pin** |
| Posted by | **Real** — choose the poster from workspace members |
| Status vocabulary | **Collapse to 3**: Scheduled / Active (=Published) / Archived. Drop Draft; manual retire → "Archive now" |
| Scheduler | **Worker timer sweep** calling `usp_TickAnnouncements` (~60s). No new dependency |

**Consequences accepted:** Audience dropped → new posts are workspace-wide (`everyone`); existing
scoped announcements keep their stored audience but can't be re-narrowed via the new modal. Expiry
dropped → superseded by auto-archive. **Pin kept** → Home pinned-announcements authoring stays; a
subtle pin marker shows in the ANNOUNCEMENT cell.

## 3. Data model — migration `20260721_072_AlterAnnouncements_Lifecycle`

`ALTER dbo.Announcements`:

- `ScheduledPublishAt DATETIME2 NULL` — when set and stored status `Scheduled`, a future post.
- `AutoArchive BIT NOT NULL CONSTRAINT DF_Announcements_AutoArchive DEFAULT 1`.
- `AutoArchiveAt DATETIME2 NULL` — set on publish = `PublishedAt + 30d` (scheduled: `ScheduledPublishAt + 30d`).
- Extend `CK_Announcements_Status` to `{Draft, Scheduled, Published, Retired, Archived}` — legacy
  `Draft`/`Retired` stay valid for existing rows; new writes use only `Scheduled` / `Published` /
  `Archived`.
- Indexes: filtered indexes on `(Status, ScheduledPublishAt) WHERE IsDeleted = 0` and
  `(Status, AutoArchiveAt) WHERE IsDeleted = 0` to keep the tick sweep SARGable (justified by the
  tick query pattern).

Idempotent (`IF NOT EXISTS` / `COL_LENGTH` guards) with a rollback that drops the columns/indexes and
restores the prior CHECK. **Legacy `Draft`/`Retired` rows are display-mapped to Archived** (never
public / withdrawn); not creatable anew. No data migration flips stored values (read-time mapping
handles display).

## 4. Status model (read-time derived)

Reuses the existing precedent (a Published announcement past `ExpiresOn` is treated as Retired at read
time). The Worker tick makes stored state catch up; read-time derivation guarantees correctness
between ticks.

| Display | Condition |
|---|---|
| **Scheduled** | stored `Scheduled` and `ScheduledPublishAt` in the future |
| **Active** | stored `Published` (or `Scheduled` already past its time, pre-tick) and not past `AutoArchiveAt` |
| **Archived** | stored `Archived`; or `Published` past `AutoArchiveAt` (pre-tick); or legacy `Draft`/`Retired` |

## 5. Backend

- **`usp_TickAnnouncements`** (new, `database/procedures/announcements/`): set-based, idempotent.
  1. `Published → Archived` where `AutoArchive = 1 AND AutoArchiveAt <= SYSUTCDATETIME()` (archived
     first, so a row published this same tick is never archived in the same sweep).
  2. `Scheduled → Published` where `ScheduledPublishAt <= SYSUTCDATETIME()`: set
     `PublishedAt = ScheduledPublishAt`, `AutoArchiveAt = PublishedAt + 30d` (when `AutoArchive=1`), and
     **return the newly-published rows** as a single result set (id / workspace / author).
  **Fan-out is NOT done in SQL.** The tick returns the newly-published ids; slice 2's Worker emits exactly
  one `announcement.published` event per row through the same `IEventSpine` path manual publish uses, so
  audit + bell fan-out stay single-sourced in the API and are never duplicated. Wrapped in
  `TRY/CATCH` + transaction; only `dbo.Announcements` is touched (consistent access order — deadlock rule).
- **Worker** (`api/Worker`): a new `AnnouncementSchedulerService : BackgroundService` with a ~60s
  timer that executes `usp_TickAnnouncements`. Handles cancellation; logs `DurationMs` and
  rows-flipped at `Information`; no PII. `PeriodSeconds` bound via `IOptions<T>` (non-secret config).
- **`usp_CreateAnnouncement`**: add `@AuthorUserId` (chosen poster), `@Status`
  (`Published` | `Scheduled`), `@ScheduledPublishAt`, `@AutoArchive`. Compute `PublishedAt` /
  `AutoArchiveAt`. `@CreatedBy` stays the **actor string** (audit integrity — the actor is who did it;
  `AuthorUserId` is who it's attributed to). On `@Status = Published`, publish immediately and let the
  existing publish/fan-out path run.
- **`usp_UpdateAnnouncement`**: accept the new editable fields (author, status transitions per the
  collapsed lifecycle, scheduledPublishAt, autoArchive, pin). Keep audience/pin columns.
- **`usp_QueryAnnouncementsForManage`**: join `dbo.Users` → add `AuthorName`; add `PostedAt`
  (`PublishedAt` when present else `ScheduledPublishAt` else `CreatedAt`) and the stored lifecycle
  timestamps needed for read-time status derivation.
- **DTOs** (`AnnouncementDtos.cs` + `shared/types/announcements.ts` — keep mirrored):
  - `AnnouncementDto`: add `scheduledPublishAt?`, `autoArchive`, `autoArchiveAt?` (populate in `Map()`).
  - `AnnouncementCreateRequest` / `AnnouncementPatchRequest`: add `author` (UserId), `status`,
    `scheduledPublishAt?`, `autoArchive`. Audience/Pin stay in the contract (defaulted).
  - `AnnouncementListRow`: add `authorName`, `postedAt`, plus lifecycle timestamps for derivation.
- **Controller**: validate the chosen `author` is a member of the target workspace (403/400 per
  `api-validation.md`); WorkspaceAdmin gate unchanged. Explicit `Cache-Control` per standards.
- **Read-time status derivation** lives in the service `Map()` / list builder (single source),
  mirrored by a small frontend helper only for optimistic display.

## 6. Frontend

- **List → data table** (`AnnouncementsManageTable`, mirrors `AuditLogTable`): `data-ds="table"`,
  scoped `<th>`, 1px row rules, focusable scroll shell (`role="region"`, keyboardable), em-dash for
  empties. Columns **ANNOUNCEMENT · POSTED BY · POSTED · STATUS**; funnel filter affordance on
  headers; `StatusPill` badges (Active→success, Scheduled→info, Archived→neutral) — never colour
  alone. Subtle pin marker in the ANNOUNCEMENT cell when pinned. Pagination footer ("1–N of M",
  Page x of y, prev/next). Row → existing edit/preview.
- **Editor modal** (`AnnouncementEditor` reworked): fields **Title**, **Body**, **Posted by**
  (`Select` sourced from `useMembers(workspaceId)`), **Status** (Active / Scheduled — Scheduled reveals
  a date-time field), **Auto-archive after 30 days** toggle + computed "moves to Archived on {date}"
  helper, **Pin** checkbox. Remove Audience / Roles / People / Expiry. Footer **Cancel / Add** (create)
  · **Cancel / Save changes** (edit). Validation on submit (forms-and-input.md): Scheduled requires a
  future date-time.
- **Hooks/api** (`useAnnouncements.ts`, `api.ts`): thread `author`, `status`, `scheduledPublishAt`,
  `autoArchive` through create/update; consume `authorName`/`postedAt` in the table.
- `ManageAnnouncementRow` (list-item) is replaced by table rows; delete once unused.
- `announcements.css`: table styles reusing tokens; remove now-dead `.ann-row*` rules.

## 7. Testing

- **DB (tSQLt):** `usp_TickAnnouncements` — Scheduled→Published at/after time (+ fan-out rows),
  Published→Archived at/after AutoArchiveAt, no-op when nothing due, idempotent re-run;
  `usp_CreateAnnouncement` with chosen author + status + auto-archive; manage query returns AuthorName.
- **API (xUnit):** create-as-another-member (author attribution + CreatedBy=actor), author-not-a-member
  → 400/403, status/scheduled/auto-archive round-trip, read-time status derivation, cancellation.
  Worker service: tick invoked on timer, cancellation exits cleanly.
- **Web (jest + jest-axe):** table renders each status badge + empty/loading/error; axe on each
  meaningful state; editor validation (Scheduled needs future date), posted-by from members, toggle
  helper text; pagination. Playwright: create Active + create Scheduled + verify table.

## 8. Slicing (each → project gate + `/dev-ship`)

1. **DB + API** — migration 072, procs (`usp_TickAnnouncements`, create/update/manage-query changes),
   DTOs (C# + shared TS mirrored), service read-time derivation, controller validation, tests.
2. **Worker tick** — `AnnouncementSchedulerService` (BackgroundService + options), wiring, tests.
3. **Frontend** — table + reworked modal + hooks/api + css, tests.

Slice 1 is the foundation; slice 2 depends on the tick proc from slice 1; slice 3 depends on the DTO
shape from slice 1. Ship in order.

## 9. Out of scope

- Physically rewriting stored `Draft`/`Retired` rows (read-time mapping covers display).
- Per-column filter *logic* beyond the affordance (the prototype shows the icon; wire real filtering
  only if requested — otherwise the funnel is the affordance matching the mock, noted here so it isn't
  mistaken for "done" filtering).
- Notifications/bell changes beyond firing existing fan-out at scheduled publish.

## 10. Open items

- POSTED column shows `PostedAt` (published → else scheduled → else created) vs. strictly published —
  current design: published → else scheduled → else created.
- Design-fidelity render gate: `/dev-review-and-remediate` runs a prototype render/compare for
  prototyped screens. Announcements is a prototyped screen; expect a fidelity pass (or a documented
  waiver per the DCLogic waived-manifest pattern used on prior slices).
