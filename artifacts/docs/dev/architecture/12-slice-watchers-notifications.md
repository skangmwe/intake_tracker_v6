---
slice: 12-watchers-notifications
capability: Subscribe to a record via the side-panel toggle; the top-bar bell shows notifications fanned out from the event spine to Watchers, mentioned users, and gate approvers.
spec-section: BS §11.1–11.3, §17.3; module-boundaries §11/§16/§20
started: 2026-07-05T10:49:33-04:00
ended: 2026-07-05T12:07:54-04:00
duration: 01:18:21
---

# Slice 12 — Watchers + Notifications (bell centre)

Watchers (`Watchers` table) + the bell (`Notifications` per-user delivery log). Fan-out is
materialised **in-process** on the event spine. Screens: S20 bell `[deferred→real]`, Watchers card
`[prototyped]`.

## Decisions

1. **Fan-out is in-process, not Worker-side.** `NotificationFanoutConsumer` (`INotificationFanout` →
   `usp_FanOutNotification`) is registered on the event spine **next to `AuditWriter`** and runs on the
   caller's transaction, so notification rows commit atomically with the state change. The
   Worker/Service-Bus path stays the documented production mechanism but is a **no-op when the
   namespace is unset** — the same "no-op when Azure infra absent" pattern as slice 9's derived mirror
   and slice 11's config-selected blob. Rows are *materialised* (not derived like the mirror) because
   the bell needs per-user read-state. `EventSpine.EmitAsync` now runs audit → fan-out → publish;
   `EventSpineTests` updated for the new order + a fan-out-throws-skips-publish case. This is the only
   source change to the spine's own composition — no source module was touched (pluggable-consumer
   rule, module-boundaries §20).

2. **Fan-out targets = only the user-resolvable ones.** Watchers (all events on the record, all
   sides), mentioned users (`comment.posted` payload), the gate's frozen eligible approvers
   (`gate.opened`), and the AI-Intake group (`escalation.opened`). **Requestor / Business Owner are
   NOT targeted** — they are Phase-1 text field values in `Requests.FieldValues`, not user references,
   so they cannot be resolved to `UserId`s. This matches `module-boundaries §16` (targets scoped to
   Watchers / ApproverTeamMembership / group membership) — not a divergence. The AI-Intake group is
   seeded empty (slice 1), so `escalation-received` fans to zero until members are added (slice 17) —
   event handled, roster empty, exactly like slice 8's approver roster.

3. **Actual emitted event strings drive the mapping.** The `EventType` enum in shared types is
   aspirational (`gate.decision.submitted`, `request.stage.advanced`); the code emits
   `gate.decided`, `request.hold-changed`, `request.closed`, `comment.posted`, `gate.opened`,
   `escalation.opened`. `usp_FanOutNotification` maps the **real** strings; unmapped events are a no-op.

4. **`POST /notifications/query`, not `GET`.** api-contracts §13 said `GET …/query`; implemented as
   `POST` to match the established `POST …/query` body convention (requests/features) and the "no
   complex params in query strings" rule (api/CLAUDE.md). Contract updated. Added
   `GET /notifications/unread-count` for the badge.

5. **Added `GET /records/{id}/watchers` + `WatcherListItemDto`/`WatcherListDto`.** The prototyped card
   needs the roster + the caller's own state; the contract listed only POST/DELETE. `displayName` is
   carried so avatars render without a directory fetch (mirrors slice 8's frozen approver names).
   Contract + shared-types updated.

6. **Dedup + suppression in one proc.** Dedup UNIQUE `(UserId, RecordId, Category, SourceEventId)` means
   a user watching both sides of an escalated record gets one row; a re-delivered event inserts nothing
   (idempotent). The actor is excluded; `IsDisabled` accounts are suppressed (BS §6.8). Summaries are
   built from RecordId + category only — never field values (api-pii-handling.md).

7. **Card lands in the existing "Watchers & alerts" tab** (the as-built 6-tab record detail has no
   right rail — slice 5 reconciliation), like Attachments/Relationships. The prototype's navy pill is
   rendered with the app's reconciled pale-blue `.record-chip` for one coherent product. The "Notify
   watchers about" static rules card is reproduced (5 firm-default rules).

## Notes

- Pre-existing `tsc --noEmit` errors in `attachments/api.test.ts` and `gates/gateView.test.ts`
  (unchanged by this slice — `noUncheckedIndexedAccess`-style, from slices 8/11) remain; all files
  authored here type-check clean. API + API.Tests build clean (`dotnet build`).
- The Worker project still hosts only the scaffold no-op — no Service-Bus consumer is added; the
  in-process path is the whole fan-out in R1.
