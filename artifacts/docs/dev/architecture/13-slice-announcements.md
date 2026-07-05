---
slice: 13-announcements
capability: A workspace admin posts a Draft announcement, sets audience, pins/expires it, publishes it — the notice fans to the audience's bell (deep-linking to the announcement) and is browsable in a history list.
spec-section: BS §2.7 / §20; module-boundaries §9; api-contracts §12
started: 2026-07-05T12:57:18-04:00
ended: 2026-07-05T14:22:37-04:00
duration: 01:25:19
---

# Slice 13 — Announcements

The Announcement object (BS §2.7 / §20) — a light record with a publish/retire lifecycle, delivered
through the slice-12 bell. Screens: **S21 detail**, **S22 list**, **S23 manage** (all `[deferred]`,
built from the blueprint). Shared types (`announcements.ts`) already existed from scaffolding.

## Decisions

1. **Admin authoring is workspace-scoped; consumer reads are flat.** api-contracts §12 originally
   listed a flat `POST /announcements` create, but create needs a target workspace — so create and the
   S23 manage-list are `POST /workspaces/{id}/announcements[/query]` (WorkspaceAdmin), matching
   Lifecycle/Fields §18. Consumer reads stay flat and cross-workspace: `POST /announcements/query`
   (S22, audience+membership scoped across all the caller's workspaces) and `GET /announcements/{id}`
   (S21, audience-gated → 403 never discloses existence). Item mutations (`PATCH` / `publish` /
   `retire` by id) are **author-or-admin**, resolved in the service from the row. Contract updated.

2. **`query` is `POST`, not `GET`** — the established `POST …/query` body convention + the
   "no complex params in query strings" rule (slice-12 precedent).

3. **Bell deep-link via a new nullable `Notifications.AnnouncementId`** (migration 043, ALTER). A
   `RecordId NVARCHAR(20)` can't hold an announcement GUID, so an `announcement-posted` row carries
   `AnnouncementId` and the bell opens S21. The slice-12 dedup UNIQUE index is unaffected —
   `SourceEventId` already differentiates each `announcement.published` event. This extends slice-12's
   `Notifications` table + `usp_QueryNotifications` + `NotificationDto` (+`announcementId`) + the
   BellMenu (`announcement-posted` → `/announcements/{id}`; "Announcement history" → `/announcements`).

4. **Fan-out reuses the slice-12 in-process `usp_FanOutNotification`**, extended with an
   `announcement.published` branch. Audience never widens access (§10.2): `everyone` = active members;
   `named-users` = listed ids ∩ members; `role-scoped` = `ApproverTeamMembership` for the listed role
   labels. A role roster seeded empty fans to zero (slice 8 precedent). Publishing emits the event on
   the spine **once** — only on the Draft→Published transition (`@NewlyPublished`), so an idempotent
   re-publish does not re-fan. The notice **Title** rides in the bell `Summary` — announcements are
   broadcast notice text (Audience Level B/C), not matter content.

5. **Audience picker is comma-separated text for role-scoped/named-users** — a real people/role picker
   arrives with Users & access (slice 17). `everyone` needs no input.

6. **Body renders as plain text (pre-wrap), not HTML** — no sanitizer is wired
   (web-coding-standards: never `dangerouslySetInnerHTML` unsanitized). Rich-text rendering is a later
   refinement once a sanitizer lands.

7. **The pinned-Home strip is NOT built here** — the plan defers it to slice 22 (no Home surface in
   Phase 1). The `Pinned` flag + expiry + pinned-first ordering ship; the strip does not.

## Notes

- **Timing budgets are the coverage floor only** — no numeric thresholds invented.
- **Pre-existing `tsc --noEmit` errors** in `attachments/api.test.ts`, `gates/gateView.test.ts`, and the
  record-less `BellMenu.test.tsx` case remain (strict `exactOptionalPropertyTypes` in test fixtures;
  jest/babel ignores them). Every file authored here type-checks clean; API + API.Tests build clean.
- Web deps had to be installed in the worktree (`npm ci`) to run the edit-time `tsc --noEmit`.
