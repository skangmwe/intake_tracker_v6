# fix-announcement-boxed-rows — design-fidelity findings

**Label:** fix-announcement-boxed-rows-09989d9
**Handoff present:** yes (`artifacts/docs/design/project/`)

## Iteration 1

### Scope — audit only the prototyped screens the current build serves

Every Prototype-tagged screen in the blueprint (`enumerate-blueprint-screens.sh` → S1–S6, S9–S11,
S23, S28–S36, S38, S39, S43) carries a **blank App-route** in the master table — none is routed 1:1
by this per-slice build. Per `design-fidelity-web.md` § Scope, each is recorded `not-implemented`
(out-of-scope, **non-blocking**). The two announcement surfaces this change touches:

- **S23 Manage announcements** is Prototype-tagged with a blank App-route → `not-implemented`,
  out-of-scope.
- The reader **Announcements list** (S22) is a `Save for /build` screen (no prototype presence) →
  not required in the manifest.

Both changes are a deliberate, user-requested visual iteration (box each announcement so they stop
blending together). This intentionally diverges from the prototype's plain-list treatment; the
divergence is expressed entirely through McDermott tokens (bordered `--bg-surface` card,
`--border-light`, `--radius`, `--space-*`).

### Rendered checks (APP / SHELL)

Rendered live against the running build (web `:5173` + API `:5080`, dev auth bypass):

- **APP** (`reviews/shots/APP-build.png`) — Announcements list: each notice is a distinct bordered
  card on the page background, comfortable gaps, Georgia titles, muted snippet, published date.
  Reads as one product with the rest of the app. **match.**
- **SHELL** (`reviews/shots/SHELL-build.png`) — sidebar lockup + nav and top bar unchanged. **match.**

**Verdict:** no blocking design-fidelity finding. APP + SHELL match; all Prototype-tagged screens
are out-of-scope `not-implemented` (blank App-route).
