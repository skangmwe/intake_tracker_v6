# Slice: Record-detail reconciliation (S4 prototype fidelity)

**Branch:** `slice/record-detail-reconciliation` · **Capability:** the record detail's Status and
Watchers tabs match the prototype — a submitted/lifecycle/status-category summary, SLA, and
status-history trail under navy section headers, plus a live active-alerts feed, in the prototype's
tab order.
**Started:** 2026-07-21T12:06:19-04:00 · **Ended:** 2026-07-21T12:33:38-04:00 · **Duration:** 00:27:19

## Why

Resolves the long-`Deferred` design-fidelity finding
`design-fidelity//requests/:recordId::S4/record-detail-structure` (in `reviews/architectural-findings.md`).
The record detail (built across slices 5/9/21/26) drifted from the prototype's S6/S10/S11 blocks: the
Status tab dropped three display blocks, the section-header pills were pale-blue rounded instead of the
prototype's navy squares, two tabs were swapped, and the Watchers tab's "Active alerts" feed was a static
empty state. Per-discrepancy decisions were made with the analyst against a side-by-side diff.

## Decisions taken (per discrepancy)

1. **Tab order → prototype.** `BASE_TABS` reordered to `Status · Intake · Tasks & gates · Attachments ·
   Activity · Watchers & alerts` (Attachments and Tasks & gates were swapped).
2. **Header meta strip → keep the build.** The 5th field *Time in stage* stays (prototype has 4). No change.
3. **Status tab → follow the prototype, additively.** Added the three missing blocks and switched the
   section pills to navy squares — **and kept** the build's functional controls (Move stage, Escalate,
   Close record, Relationships). The Status tab is now the prototype's display blocks + the build's
   controls, coexisting — a net-additive change, no capability removed.
4. **Watchers "Active alerts" → prototype.** Built a live feed replacing the static empty-state section.

## Scope (built)

- **Section pills → navy squares.** `.record-chip` restyled from pale-blue rounded to the prototype's navy
  square pill (`--color-navy` bg / white text / 2px radius / leading Phosphor icon). This is the shared
  record-detail header pill, so **every** record-detail card header (Status, SLA, history, watchers,
  alerts, relationships, attachments) flips to navy at once — consistent with the prototype.
- **Status-tab summary row** (`StatusSummaryRow`) — a bare Submitted · Lifecycle · Status-category strip.
- **SLA block** (`SlaBlock`) — On track / Due soon / Overdue / No due date, from `request.slaStatus`.
- **Status history & reactivation trail** (`StatusHistoryTrail`) — sources the record's
  `request.status-hold-changed` audit events from the existing `GET /records/{id}/thread`.
- **Active alerts** (`ActiveAlerts` + pure `computeActiveAlerts`) — composed client-side from
  `slaStatus` + `statusHold` + open/blocked gates (existing `/requests/{id}/approval-requests`).
- **API projections (no SQL):** `RequestDto.lifecycleName` and `RequestStageRef.statusCategory` — the
  procs already returned both; the values were dropped at the C# DTO boundary. Mapped through in
  `RequestsService.Reads.cs` (`ReadLifecyclesAsync` lookup + stage projection). No migration, no proc change.

## Key architecture decisions

1. **No new backend (analyst-chosen).** The two new feeds reuse data the client already holds: the
   status-history trail filters the existing activity-thread audit events; the active-alerts feed composes
   `slaStatus` + `statusHold` + gates. The only API work is two mapping projections (zero SQL). The
   alternative — a dedicated status-history read and an alerts aggregation endpoint — was declined to keep
   this a reconciliation, not a feature slice.
2. **Bordered `.record-card` wrappers retained.** The prototype uses bare sections; every build tab
   (Attachments/Watchers/Relationships since slices 10–12) uses bordered cards. Converting only the Status
   tab to bare sections would break cross-tab consistency and destabilise controls built in other slices, so
   the cards stay and the pill restyle + added blocks carry the fidelity fix. The remaining bordered-vs-bare
   divergence is a documented, benign, system-consistent choice.
3. **Status-history reason is thin (accepted).** The audit event carries a generic `summary`, not a
   structured hold reason, so the trail shows summary + timestamp only. Enriching the audit payload with a
   structured reason is a future follow-up.
4. **`WatchersCard` now takes `request`** (was `recordId`) so the nested `ActiveAlerts` can read
   `slaStatus`/`statusHold`; `recordId` is derived internally.

## Documented deviations / follow-ups (out of this slice)

- A purpose-built status-hold history endpoint (structured events + reasons) and a server-side alerts
  aggregation remain future work — this slice composes both client-side.
- The Status tab keeps bordered cards rather than the prototype's bare sections (decision 2).
- Other still-parked S4-adjacent drift (S3 intake field order, S31 lifecycle-picker shape) is separate.

## Verification

Web `tsc --noEmit`: 0 new errors (11 pre-existing in announcements/audit/relationships untouched). Web
jest: 47 tests across the changed/new files pass (pure helpers, four components, WatchersCard, RecordDetailPage),
each rendered state under jest-axe, no act warnings. API `dotnet build`: 0/0. `RequestsControllerTests`: 19/19.
Full gates (lint, coverage, e2e, security, tSQLt/integration) run at the `/dev-ship` gate.
