# Dependency Graph

*Module → module dependencies. Directed, must be acyclic.*

## Reading the graph

`A → B` means module A depends on module B (A cannot compile / boot / run without B). Modules are grouped by layer for readability but the acyclicity check spans the entire graph.

## The graph

```
                         ┌────────────────────────────────────────────────┐
                         │                                                │
                         │  Cross-cutting: Shared Types  ← everyone       │
                         │                                                │
                         └────────────────────────────────────────────────┘

  ┌───────────────────────── Foundation (no upward deps) ─────────────────────┐
  │                                                                            │
  │   Platform & Shell  ◄──── (every module depends on this for               │
  │        │                   workspace + user + auth context)                │
  │        │                                                                    │
  │        ▼                                                                    │
  │   Event Spine       ◄──── (every state-changing module emits into this)   │
  │        │                                                                    │
  │        ▼                                                                    │
  │   Audit             (spine consumer — no outbound deps)                    │
  │                                                                            │
  └────────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────────── Schema layer ───────────────────────────────────┐
  │                                                                          │
  │   Fields & Objects ◄─────── (schema for everything)                      │
  │        │                                                                  │
  │        ▼                                                                  │
  │   Lifecycle & Gates                                                       │
  │                                                                           │
  └───────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────────── Records layer ──────────────────────────────────┐
  │                                                                          │
  │   Requests ─────────► Fields & Objects, Lifecycle & Gates,                │
  │      │                Platform & Shell, Event Spine                       │
  │      │                                                                    │
  │      ├─────► Tasks (child; depends on Fields & Objects for field library)│
  │      │                                                                    │
  │      ├─────► Approvals (opens on stage transition; depends on             │
  │      │                    Lifecycle & Gates for frozen snapshot)          │
  │      │                                                                    │
  │      ├─────► Escalation (reads Crossing Map from Platform Admin;          │
  │      │                    depends on Attachments for file carry-over)    │
  │      │                                                                    │
  │      ├─────► Comments (activity thread source)                           │
  │      │                                                                    │
  │      ├─────► Typed Links (all four link kinds)                          │
  │      │                                                                    │
  │      ├─────► Attachments (files follow record)                          │
  │      │                                                                    │
  │      ├─────► Watchers (per-record subscription)                         │
  │      │                                                                    │
  │      └─────► Search (indexed content)                                    │
  │                                                                            │
  │   Feature Catalog ─► Requests (Add-to-catalog prefills a Feature draft   │
  │                                 from a Request source),                    │
  │                       Attachments, Typed Links (`sourced-from`)           │
  │                                                                            │
  │   Announcements ─► Platform & Shell (WorkspaceMembership for audience),   │
  │                    Event Spine                                             │
  │                                                                            │
  └────────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────────── Consumers layer ────────────────────────────────┐
  │                                                                          │
  │   Notifications ─► Event Spine (reads events)                             │
  │                    Watchers, ApproverTeamMembership,                       │
  │                    WorkspaceMembership (fan-out targets)                   │
  │                                                                            │
  │   Dashboards ────► Saved Views (embed a grid),                            │
  │                    Requests / Features / Approvals / Announcements        │
  │                    (metric sources)                                        │
  │                                                                            │
  │   Saved Views ───► Fields & Objects (columns must be defined fields)      │
  │                                                                            │
  │   Home Surface ──► Approvals, Requests, Tasks, Announcements,             │
  │                    Notifications                                           │
  │                    (composes viewer-scoped queries into a landing)         │
  │                                                                            │
  │   Import / Export► Requests, Fields & Objects, Prefix Registry            │
  │                    (mint IDs), Users (Requestor SSO resolution)            │
  │                                                                            │
  └────────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────────── Admin surfaces ─────────────────────────────────┐
  │                                                                          │
  │   Platform Admin ─► Platform & Shell (all firm-wide config lives here)   │
  │                                                                            │
  │   Workspace Admin  (uses Fields & Objects, Lifecycle & Gates,             │
  │                     Saved Views, Announcements, Audit)                    │
  │                                                                            │
  └────────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────────── UI-only ────────────────────────────────────────┐
  │                                                                          │
  │   Error / Empty edge states                                                │
  │        (shared UI components — depended on by every list & detail)         │
  │                                                                            │
  └────────────────────────────────────────────────────────────────────────────┘
```

## Adjacency (explicit dependencies)

Every arrow above expanded, source → target:

| Source | Targets |
|---|---|
| **Every module** | Platform & Shell · Shared Types |
| **Fields & Objects** | Platform & Shell |
| **Lifecycle & Gates** | Fields & Objects, Platform & Shell |
| **Requests** | Fields & Objects, Lifecycle & Gates, Platform & Shell, Event Spine |
| **Tasks** | Requests, Fields & Objects, Event Spine |
| **Approvals** | Requests, Lifecycle & Gates, Event Spine |
| **Escalation** | Requests, Fields & Objects (crossing-field identities), Platform Admin (crossing map), Attachments, Event Spine |
| **Comments** | Requests (host record), Event Spine |
| **Typed Links** | Requests, Feature Catalog (targets), Event Spine |
| **Attachments** | Requests / Features / Announcements (host record), Event Spine |
| **Watchers** | Requests (host record), Event Spine |
| **Feature Catalog** | Requests, Attachments, Typed Links, Fields & Objects, Event Spine |
| **Announcements** | Platform & Shell, Event Spine |
| **Notifications** | Event Spine, Watchers, Approvals, Announcements, WorkspaceMembership |
| **Dashboards** | Saved Views, Requests, Feature Catalog, Approvals, Announcements |
| **Saved Views** | Fields & Objects |
| **Home Surface** | Approvals, Requests, Tasks, Announcements, Notifications |
| **Search** | Requests, Comments, Attachments (filename index) |
| **Import / Export** | Requests, Fields & Objects, Platform & Shell (PrefixRegistry), Users |
| **Audit** | Event Spine |
| **Platform Admin** | Platform & Shell |
| **Workspace Admin** | Fields & Objects, Lifecycle & Gates, Saved Views, Announcements, Audit |
| **Error / Empty UI** | (none — depended on) |

## Acyclicity check

Walking the graph in topological order from foundation to consumers:

1. Layer 0 (leaves — depended on, nothing outbound): **Shared Types**, **Error/Empty UI**, **Audit** (once emitted event is durable, audit stops).
2. Layer 1: **Platform & Shell**, **Event Spine**.
3. Layer 2: **Fields & Objects**.
4. Layer 3: **Lifecycle & Gates**.
5. Layer 4: **Requests**, **Feature Catalog**, **Announcements**, **Watchers**, **Attachments**, **Comments**, **Typed Links** (each only depends on layers 0–3 plus Requests, which is at layer 4 — this is not a cycle because Requests only depends on 0–3; the record-satellite modules only depend on Requests, not vice versa).
6. Layer 5: **Tasks**, **Approvals**, **Escalation** (all depend on Requests + earlier layers).
7. Layer 6: **Saved Views**, **Search**, **Import/Export**.
8. Layer 7: **Notifications**, **Dashboards**, **Home Surface**.
9. Layer 8: **Platform Admin**, **Workspace Admin** (UIs over everything below).

**No back-edges.** Verified:

- `Notifications → Event Spine` (down) — never `Event Spine → Notifications`. Notifications is a **pull consumer** of the spine, not something the spine calls into.
- `Audit → Event Spine` (down, same pattern).
- `Escalation → Attachments` (down) — Attachments doesn't know about Escalation; it just follows the record.
- `Feature Catalog → Requests` (down) — Requests doesn't know Features exist. The `sourced-from` link goes on the Feature side; Requests receive it via TypedLink, which is a satellite module that Requests already depends on, but the link's TypeKind is a value not a type reference — no compile-time cycle.
- `Home Surface → Notifications` (down) — no reverse; Notifications composes independently.

**The one edge that looks like a cycle but isn't:** Escalation writes the platform-defined `AI Solutions Status` field on the PG-side Request row via the Event Spine, not via Requests. Escalation → Event Spine → Requests (writer side, not reader side, and the write path goes through a dedicated mirror consumer, not by Escalation calling Requests directly). This means Requests still doesn't depend on Escalation at compile time.

## Cross-area dependencies

Layer boundaries between `web/`, `api/`, and `database/`:

```
  web/  ──HTTP──►  api/  ──EF Core / Stored procs──►  database/
                    │
                    └──Service Bus──►  Worker (in api/)  ──►  database/, external services
```

- Web depends on API contracts (see `api-contracts.md`) but doesn't know about DB structure or Service Bus.
- API depends on DB schema + stored procs (via EF Core generated types + hand-typed proc DTOs) but doesn't know about Web.
- Worker is a peer of API — same code area, same Service Bus namespace, same DB.
- **`/shared/types/` is consumed by both `web/` and `api/`** and by nothing else — it's the wire vocabulary, not implementation.

## Boundary violations to reject in review

Given the graph above, any of these should be a code-review reject:

1. **`Notifications` importing from `Requests`** — Notifications reads the spine, not source modules. If it needs `RequestDto`, it comes from Shared Types.
2. **`Requests` importing from `Approvals` or `Escalation`** — the arrow goes the other way. Requests never knows about approvals in flight; that's on the Approvals module. Same for Escalation.
3. **`Event Spine` importing from any consumer** — the spine's contract is `Emit(EventEnvelope)`. It doesn't know who reads.
4. **Web calling database directly** — Web only knows API endpoints.
5. **API bypassing the spine for a state change** — every state change emits exactly one event. No shortcut writes to Audit, Notifications, or the mirror.
6. **Any module importing from `Workspace Admin` or `Platform Admin`** — those are UI over everything else. They only render.
