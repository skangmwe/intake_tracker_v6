# R1 Re-phasing (Part A) Implementation Plan

> **For the implementer:** This is a **documentation-only** change to two spec artifacts. No app code, no tests. It runs through the project's own pipeline: make the edits in a fix worktree off `dev`, then `/dev-ship`. Direct `git commit` is blocked by a hook — do **not** hand-commit; `/dev-ship` is the only commit path.

**Goal:** Record the approved re-phasing — pull the "light trio" (no-code dashboard builder, full request templates, Toolkit build) from Release 2 into Release 1 — into the build spec and the requirements doc, keeping every cross-reference internally consistent.

**Architecture:** Two files change: `artifacts/docs/dev/ai_solutions_tracker_build_spec_final.md` (§15 boundary + every "Release 2 / Phase 3" cross-reference to the three moved features) and `artifacts/docs/product/solution-requirements.md` (instruction #9 + a Change Log entry). This is the authorizing artifact for the later coordinated migration (toggle removal + dashboard view-widgets + builder), which is planned separately.

**Tech Stack:** Markdown only.

## Global Constraints

- **Design source of truth:** `artifacts/docs/dev/design/2026-07-07-r1-rephasing-and-dashboard-view-widgets-design.md`.
- **Authorization on record:** the requester approved the R1 scope increase (light trio) in the design session on 2026-07-07. Note it in the Change Log entry.
- **Do not touch app code in this plan.** The dashboard view-widgets rework, the Requests-list toggle removal, and the builder are a *separate* coordinated migration (Option 2) — out of scope here.
- **No direct `git commit`.** Ship via `/dev-ship` from a fix worktree off `dev`.
- **Provisioning inconsistency:** resolve self-serve workspace provisioning to **Release 1 (Phase 2)** — §15 (Phase 2) is authoritative over the §21 nav note.

---

### Task 1: Build spec §15 — move the light trio into Release 1, slim Phase 3

**Files:**
- Modify: `artifacts/docs/dev/ai_solutions_tracker_build_spec_final.md` (§15, ~lines 616–630)

- [ ] **Step 1: Amend the Phase 2 paragraph** (currently ends with the parenthetical *"(The seeded dashboards are fixed layouts; the no-code builder that lets admins author their own is Release 2 — see below. The Home's Toolkit panel lights up in Release 2.)"*). Append the three pulled-forward features to Phase 2's scope and rewrite the parenthetical to:

  > …and rich audit search and export; **plus the three self-serve authoring features pulled forward from the original Release 2 scope: the no-code dashboard builder (§10.2), the full request-template feature (§9.7), and the Toolkit object build (§2.6, §19).** *(The seeded dashboards remain the Phase 2 starting point; the no-code builder that lets admins author their own now also ships in Release 1. The Home's Toolkit panel lights up with the Toolkit build in Release 1.)*

- [ ] **Step 2: Rewrite the Phase 3 paragraph** (line ~626) to drop the three moved items. New text:

  > **Phase 3 — reach:** email delivery, per-user notification preferences, and digests; **time-based triggers** (proactive overdue / SLA-breach alerts, and the Benefit-review-date prompt driving the post-launch value loop §17.11); and the **REST API with webhooks**. (CSV import and export-current-view ship in Phase 1 — see §13.)

- [ ] **Step 3: Verify** the §15 block now reads: R1 = Phase 1 + Phase 2 (Phase 2 including the light trio); R2 = Phase 3 (email/digests, time-based triggers, REST API + webhooks) + Phase 4 (AI-assist, DMS connector). The closing line *"Nothing in Release 1 forecloses Release 2…"* stays.

---

### Task 2: Build spec — flip every "Release 2 / Phase 3" cross-reference for the three moved features + fix the provisioning inconsistency

**Files:**
- Modify: `artifacts/docs/dev/ai_solutions_tracker_build_spec_final.md` (multiple sections)

- [ ] **Step 1: Sweep for stale release labels.** Grep the file for each phrase below and, at every hit that describes one of the three moved features, change the release label from Release 2 / Phase 3 to **Release 1**:
  - `no-code dashboard builder` and `no-code builder` — §10.2 (the phasing-split note ~line 444 and the palette note ~line 454), §10.5 (~line 508), §21 nav (~line 941). Each currently says the builder is Release 2 → Release 1.
  - `request-template` / `Request templates (entirely Release 2)` — §9.1 templates note (~line 434, *"Request templates (entirely Release 2)"* → *"(entirely Release 1)"*), §9.7, §21 nav (~line 941, "Templates … appear under Admin").
  - `Toolkit` build-phase mentions — §2.1, §2.6 (~lines 101, 105, *"built in Release 2 (Phase 3, §15)"* → *"built in Release 1 (Phase 2, §15)"*), §2 objects note (~line 42–43), §19 (~line 851, *"built in Release 2 (Phase 3, §15)"* → Release 1), §10.7 "Your toolkit" (~line 534, *"Toolkit panel lights up in Release 2"* → Release 1), §21 nav (~line 941).

- [ ] **Step 2: Resolve the provisioning inconsistency.** In §21 (~line 941), remove **self-serve workspace provisioning** from the Release 2 nav list (it is Release 1 / Phase 2 per §15). Leave the genuinely-R2 nav items (Toolkit moves to R1 per Step 1; keep nothing that's now R1 in the R2 list).

- [ ] **Step 3: Verify internal consistency.** Re-grep `Release 2` and `Phase 3` across the file; confirm every remaining hit refers only to: email/digests/notification-prefs, time-based triggers, REST API + webhooks (Phase 3), or AI-assist + DMS connector (Phase 4). No remaining hit should tie the no-code builder, request templates, the Toolkit build, or self-serve provisioning to Release 2. (The Toolkit *framework* being *defined* in R1 while the *object* was built in R2 collapses to "defined and built in R1" — check §2.6/§19 phrasing reads cleanly.)

---

### Task 3: Requirements doc — instruction #9 + Change Log entry

**Files:**
- Modify: `artifacts/docs/product/solution-requirements.md` (instruction #9 ~line 396; Change Log table ~line 403+)

- [ ] **Step 1: Rewrite instruction #9's "no R2 in R1" list.** Current: *"…no Toolkit build, no no-code dashboard builder, no request templates admin UI, no REST API + webhooks, no time-based triggers, no AI-assist, no DMS connector, no email delivery in Release 1."* Remove the three now-in-R1 items. New text:

  > 9. **This is a multi-release build.** Do not build Release 2 capabilities into Release 1. In particular: no REST API + webhooks, no time-based triggers, no AI-assist, no DMS connector, no email delivery in Release 1. **The Toolkit build, the no-code dashboard builder, and the full request-template feature were pulled forward into Release 1 (Phase 2) on 2026-07-07 — see the build spec §15 and the Change Log.** The Announcement object ships in Phase 1.

- [ ] **Step 2: Add a Change Log row** at the top of the §12 table body (newest-first), verbatim date `2026-07-07`:

  > | 2026-07-07 | Development (design session) | Build spec §15, §2.6, §9.7, §10.2, §10.5, §19, §21; Requirements #9 | **Re-phased Release 1/2.** Pulled the "light trio" — no-code dashboard builder (§10.2), full request templates (§9.7), Toolkit build (§2.6, §19) — from Release 2 into Release 1 (Phase 2), on requester authorization. New cut line: R1 = everything a user does inside the app manually; R2 = automation / external reach / AI (email + digests, time-based triggers, REST API + webhooks, AI-assist, DMS connector). Resolved the self-serve-provisioning §15-vs-§21 inconsistency to R1 (Phase 2). Design: `artifacts/docs/dev/design/2026-07-07-r1-rephasing-and-dashboard-view-widgets-design.md`. The paired dashboard view-widgets rework + toggle removal are a separate coordinated migration (Option 2), planned separately. |

- [ ] **Step 3: Verify** instruction #9 and the build spec §15 no longer contradict each other on any of the three features or on provisioning.

---

### Task 4: Ship

- [ ] **Step 1:** Confirm the two files are the only changes (`git status` shows only the build spec + requirements doc, plus the two design/plan docs).
- [ ] **Step 2:** `/dev-ship` — this commits on a `fix/` branch and merges into `dev`. Suggested branch summary: `r1-rephasing-docs`.

---

## Self-review

- **Spec coverage:** design Part A (§15 rewrite, requirements #9, Change Log, provisioning fix) → Tasks 1–3. ✓ Part B/C explicitly deferred. ✓
- **Placeholder scan:** none — exact replacement text given; the cross-ref sweep lists exact search phrases + the flip rule. ✓
- **Consistency:** Task 2 Step 3 is the dedicated internal-consistency check. ✓
