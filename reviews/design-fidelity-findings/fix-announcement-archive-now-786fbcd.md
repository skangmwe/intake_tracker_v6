# fix-announcement-archive-now-786fbcd — design-fidelity findings

**Handoff:** PRESENT (Claude Design DCLogic single-file prototype). Frontend is in scope, so the
design-fidelity step ran.

## Scope

Every Prototype-tagged screen in the blueprint master table has a **blank App-route**
(`enumerate-blueprint-screens.sh` → `route=[]` for all S*), so each is recorded **`not-implemented` —
out-of-scope, NON-blocking** per `design-fidelity-web.md` § *Scope*. That covers S23 (Announcements),
the screen this fix touches.

## What changed (S23)

Adds a manual **"Archive now"** action to the announcement editor's edit footer (offered only for live
Active/Scheduled announcements) plus an `ArchiveAnnouncementDialog` confirmation. Archiving reuses the
existing retire path (`usp_RetireAnnouncement` → `Status → Archived`). The prototype's editor did not
render an archive control; this is a small additive admin affordance requested to honour the spec-§2
"manual retire → 'Archive now'" decision that the auto-archive-only build left unimplemented — documented
here for audit, consistent with the waiver used across this DCLogic project.

## Why the render pipeline is waived

Same as prior slices: the DCLogic single-file prototype tags only design-system primitives and cannot be
auto-rendered per-route, so the per-component render/compare is waived (see
`reviews/FINISH-design-fidelity-runbook.md`). User-approved; spec Open-item §10.

## Manifest verdicts (this run)

| Key | Verdict | Evidence |
|---|---|---|
| S1…S43 (all Prototype-tagged) | `not-implemented` | Out-of-scope: blank App-route. NON-blocking. |
| APP | `match` | `reviews/shots/APP-build.png` — app-wide look unchanged by this fix. |
| SHELL | `match` | `reviews/shots/SHELL-build.png` — shell unchanged by this fix. |

## Final status: CLEAN (0 blocking findings)
