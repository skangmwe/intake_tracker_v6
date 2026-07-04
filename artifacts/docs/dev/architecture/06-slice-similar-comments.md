---
slice: 06-similar-comments
capability: As I type an intake, a Similar-requests panel surfaces likely matches; when I open a record, the Activity tab shows an interleaved thread of comments + system events; I can post an immutable comment and @mention a teammate.
spec-section: BS §9.3, §9.5, §9.8, §11.2; requirements Use Case 3 (similar-requests match)
started: 2026-07-04T13:38:14-04:00
ended: 2026-07-04T15:14:57-04:00
duration: 01:36:43
---

# Slice 6 — Similar-requests nudge + Comments & activity thread

Ships the S3 intake similar-requests panel, the S4/S5 Activity tab (interleaved thread renderer +
comment composer), and an immutable `Comments` object. Three decisions are worth recording; the rest
is carried by the diff.

## Decision 1 — similar match is LIKE-based, not full-text (divergence, approved)

The slice plan named a **SQL Server full-text catalog + maintained index**. The dev/test stack is
**LocalDB, which ships no Full-Text Search component** — `CREATE FULLTEXT CATALOG` errors, so the
plan-as-written would fail the real-stack validation gate. Approved at plan-confirmation:
`usp_FindSimilarRequests` matches with a **LIKE-based token-overlap** on `Name` + `Description`
(tokens ≥ 3 chars, wildcard-escaped, scored by overlap, ordered by score then recency),
workspace-scoped and access-gated by the same `WorkspaceMembership` join every record read uses. It
is adequate for a top-3 typeahead and portable to every SQL Server edition. The genuine
access-respecting **full-text Search** surface (fields + comments + attachment filenames) remains
**slice 15**, whose own plan already defers the index mechanism. The LIKE predicate is non-SARGable
by nature (a fuzzy match), but runs over a workspace-filtered set — acceptable at the 500-user
ceiling; slice 15 replaces it with a real index.

## Decision 2 — `Comments.WorkspaceId` (small data-model extension)

`data-model.md`'s `Comment` table listed `RecordId` + `ObjectType` + author + body + mentions but no
workspace. A comment is added here **with a per-side `WorkspaceId`** (like `Watcher` and
`AuditEntry`) so (a) the activity-thread read gates access by a membership join on the comment's own
workspace, and (b) an escalated record's two same-`RecordId` rows (slice 9) keep their comments on
the correct side. No hard FK on `RecordId` (the object type is inferred — matching `AuditEntry`).
`data-model.md` updated.

## Decision 3 — @mention parser + event ship; handle→id resolution deferred

The `parseMentions` tokenizer (web `/shared/text/`) and the API's mention-carrying event both ship
and are tested. Resolving `@handle → userId` needs a user directory / typeahead that does not exist
until slice 12/17, so the composer sends an **empty** `mentionedUserIds` today. A posted comment
emits **one** `comment.posted` event whose payload carries `{ commentId, mentionedUserIds }` (ids
only — never PII); the slice-12 Notifications consumer derives both the watcher fan-out and the
mention fan-out from it. The thread read excludes `comment.posted` / `comment.mentioned` audit twins
so a comment never doubles as a timeline event.

## Immutability

`Comments` is append-only: `trg_Comments_PreventMutation` (INSTEAD OF UPDATE, DELETE) rejects every
edit and delete at every access level — the same pattern `AuditEntry` uses. Corrections are new
comments (BS §9.3). There is no PATCH/DELETE endpoint.

## Access (403 never 404)

Both `POST /records/{id}/comments` and `GET /records/{id}/thread` resolve the caller's side of the
record via `usp_GetRequestByIdForUser` (membership baked in). A forbidden or non-existent record both
return null → the API answers **403**, never disclosing existence (BS §22.6). The thread also
distinguishes "no access" (403) from "accessible but empty" (200 `[]`).

## Prototype fidelity

The Activity tab is built to the prototype's **S8 Activity** timeline (icon rail + connector, title /
meta / detail). The prototype's tab has **no composer** — the comment composer is the blueprint/spec
addition (BS §9.3) styled to match. Actor names show **"You" / "A teammate"** until the user
directory lands (slice 12) — the thread carries `authorUserId`/`actorUserId` GUIDs, and only the
caller's own id resolves (from `useMe`).

## Contract additions (living docs updated)

- `shared/types/requests.ts` — `SimilarRequestDto` (new). `collaboration.ts` already carried
  `CommentDto` / `CommentCreateRequest` / `ActivityThreadItem` / `AuditEventItem`.
- `api-contracts.md` §3 — added the `GET /workspaces/{id}/requests/similar` nudge endpoint.
- `data-model.md` — `Comments.WorkspaceId` recorded.
- `web/src/shared/http/problemMessage.ts` — extracted from the requests feature once comments became
  a second consumer (shared discipline); the requests-feature file now re-exports it.

## Out of scope (deferred)

Notification **delivery** of the emitted events (slice 12), the typed-link **write** for a queued
`related` link from the nudge (slice 10 — the API accepts the queued ids on create today), full-text
Search (slice 15), and @handle→userId resolution (slice 12/17).
