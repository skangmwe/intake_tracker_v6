# Design — R1 re-phasing (light trio) + advanced views as dashboard widgets

**Date:** 2026-07-07
**Status:** Draft — awaiting requester / AI Solutions Lead approval
**Author:** via design brainstorming session
**Affects:** build spec (`ai_solutions_tracker_build_spec_final.md`) §10.2, §10.5, §15; `solution-requirements.md` (Change Log); `web/src/features/dashboards`; `web/src/features/requests`; `web/src/shared/components/RecordViews`

---

## 1. Why

Two decisions came out of review of the (unmerged) `advanced-views-provisioning` slice:

1. **The Board / Timeline / Agenda "views" were added to the Requests list, but the prototype never had them there.** They were pulled from the build spec's Phase 2 "advanced views" prose and bolted onto a prototyped screen (S2 Requests list), which violates the handoff rule *"build exactly what the prototype shows on a prototyped screen."* The requester's intent is that these are **ways to customize a dashboard**, not a record-list layout toggle.
2. **To let a user actually place those widgets on a dashboard, the no-code dashboard builder is required — and the spec puts that in Release 2.** Rather than half-build the capability, the requester chose to **re-phase**: pull the "light" self-serve features forward into Release 1.

This design records the re-phasing (Part A) and fully specifies the widget rework (Part B). It scope-flags — but does not fully design — the other two newly-R1 features (Part C), which are large enough to need their own design passes.

---

## 2. Part A — Roadmap re-phasing

**Decision:** move the **light trio** from Release 2 into Release 1; leave the **heavy trio + Phase 4** as the new Release 2.

### New Release 1 (former Phase 1 + Phase 2, plus:)
- **No-code dashboard builder** (§10.2) — author dashboards from the widget palette, edit audiences, configure drill-through. *Built in full* (not a stub).
- **Request templates — full** (§9.7) — the framework *and* the promote-to-template / catalogue-admin UI.
- **Toolkit object build** (§2.6, §19) — the catalog of playbooks / plugins / prompts with its record surfaces; lights up Home's "Your toolkit" panel.

### New Release 2 (slimmed)
- Email delivery + digests + per-user notification preferences (§11).
- Time-based triggers — overdue / SLA-breach alerts, Benefit-review-date prompt (§17.11).
- REST API + webhooks (§15/§16).
- **Phase 4 (unchanged):** AI-assist layer (§14); DMS / SharePoint connector (§16).

### Rationale
The cut line becomes principled: **R1 = everything a user does *inside* the app manually** (a complete self-serve workspace product); **R2 = everything automated or reaching *outside* the app** (email-out, scheduling, public API, AI, external connectors). Phase 4's genuinely hard dependencies (DMS system choice, the AI lift) stay in R2 where they belong. The spec already guarantees this is safe: *"Nothing in Release 1 forecloses Release 2 — every later capability bolts onto surfaces Release 1 already builds"* (§15).

### Cost / risk (must be acknowledged by the Lead)
- Pulling the full light trio **materially increases R1 scope** (three substantial features). This is a timeline / staffing / UAT-scope decision, not a re-label. Formally an **AI Solutions Lead / requester** authorization.
- **Open spec inconsistency to resolve while editing §15:** self-serve workspace provisioning is listed under **Phase 2** (§15, ~line 622) but under **Release 2** in the nav note (§21, ~line 941). Pick one; record it.

### Spec edits (Part A)
- **Build spec §15** — rewrite the Release 1 / Release 2 boundary per the lists above; resolve the provisioning inconsistency.
- **`solution-requirements.md`** — update instruction #9 (the "do not build R2 in R1" list drops the three moved items) and add a **Change Log** entry dated 2026-07-07 recording the re-phasing and its rationale.

---

## 3. Part B — Advanced views become dashboard widgets

The concrete, near-term change. **Shape chosen: three new palette types (Option X).**

### 3.1 Remove from the Requests list
- Delete the `ViewModeToggle` usage and the Board/Timeline/Agenda branches from `RequestsListPage` — the Requests list returns to **table only**, matching the prototype (S2).
- Remove `ViewModeToggle` and its test if no other surface consumes it. Keep `KanbanView` / `TimelineView` / `AgendaView` (they move to being widget bodies — see below).
- This restores design-fidelity on a prototyped screen.

### 3.2 Add three dashboard widget types
Palette grows **8 → 11**. Each new type is a **record-layout widget** — a sibling of `records-grid` (which is already a saved-view-driven record list), not an aggregate metric.

| New type | Renders | Binding | Extra config |
|---|---|---|---|
| `board` | records grouped into columns (`KanbanView`) | record set + saved view | **group-by** field (single-select, e.g. Stage) |
| `timeline` | records along a time axis (`TimelineView`) | record set + saved view | **date** field |
| `agenda` | date-bearing records for today/this week (`AgendaView`) | record set + saved view | **date** field |

- **Reuse** the existing `KanbanView` / `TimelineView` / `AgendaView` components as the widget bodies — no new rendering logic.
- **`WidgetRenderer`** gains three `case`s; the widget-type union in `widgets/types` extends by three.
- **Access:** presentation-only; every widget resolves to the viewer's own entitlements (§10.2 two-layer rule) — identical to every other widget/view. No new access surface.
- **Gallery is explicitly out of scope** — it stays the Feature Catalog's gallery view (S11).

### 3.3 Spec edits (Part B)
- **§10.2** — palette count **eight → eleven**; add the three record-layout widget types with their binding + config. Update the "seven of eight seeded" phrasing to the new denominator (still note which are *seeded* vs *builder-only*).
- **§10.5** — reframe "advanced views (Kanban, timeline, agenda)" as **dashboard widget types**, no longer a record-list layout toggle. Gallery remains a view (Feature Catalog).

---

## 4. Part C — Other newly-R1 features (scope-flagged, designed separately)

These are now R1 commitments but are **not** designed in this doc — each is a large body of work needing its own `/plan` (and the builder almost certainly the design pipeline, since it's a new authoring surface):

- **No-code dashboard builder** (§10.2) — the authoring UI (create dashboard → add/configure/arrange widgets → set audience → drill-through). **Prerequisite** for a user to *place* any widget, including the three new ones. Touches S17 (dashboards list) and S32 (Views & dashboards admin) plus the dashboards API.
- **Request templates — full** (§9.7) — promote-to-template admin UI + template picker on intake.
- **Toolkit build** (§2.6, §19) — new object + list/detail/search/saved-views/gallery surfaces + read-only firm-wide catalog dashboard.

---

## 5. Sequencing & dependencies

1. **Part A spec + requirements edits** — record the re-phasing decision first (documentation only).
2. **Part B widget rework** — can land **independently** of the builder: the three types register into the palette and appear in **seeded** dashboards, and the Requests-list toggle is removed. No builder needed for this slice.
3. **No-code builder slice** — once it lands, the three widgets become **user-placeable** (the full "customize your dashboard" story).
4. **Templates** and **Toolkit** — independent slices, any order.

The widget rework (2) is the smallest shippable unit and delivers the correct mental model immediately (widgets live in the dashboard object; the record list is table-only).

---

## 6. Testing (Part B — the near-term slice)

- Unit + `jest-axe` on `board` / `timeline` / `agenda` **as dashboard widgets** across their meaningful states (loading / error / empty / populated).
- Remove `ViewModeToggle` tests; assert `RequestsListPage` renders the table with no layout toggle.
- Verify no orphaned imports after the toggle removal (`tsc --noEmit`, lint).
- Design-fidelity: Requests list (S2) matches the prototype again (table-only).
- Coverage floor 80% per `web-testing.md`.

---

## 7. Open items

- **[Lead decision]** Authorize the R1 scope increase (light trio) — timeline / staffing impact.
- **[Lead decision]** Resolve the self-serve-provisioning Phase-2-vs-R2 inconsistency (§15 vs §21).
- **[Design]** The no-code builder needs its own design pass (likely the design pipeline) before build.
- **[Confirm]** Gallery stays out of scope (assumed; correct if wrong).
