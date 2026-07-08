# AI Solutions Tracker — Build Specification

This document is the complete, self-contained specification for building the AI Solutions Tracker. It describes every mechanism the application requires, the rules that govern each, and the release phasing. A team should be able to implement from this document alone, with no other reference material.

Throughout, the guiding principles are: build the **mechanism**, not the example; drive behaviour from **configuration and stored data**, never from hardcoded special cases; and make the **audit trail** and the **escalation bridge** load-bearing and tamper-evident. Where a rule protects data integrity or compliance, it is stated as a floor that overrides ordinary permissions.

---

## 1. Architecture and tenancy

The application is a **single instance** hosting **multiple workspaces**. There are two kinds of workspace:

- **The AI Solutions workspace** — the central workspace where the AI Solutions team owns and delivers work. It is also the **reporting hub** (see §10).
- **Practice-group / department (PG/Dept) workspaces** — where practice groups and departments raise and triage their own requests, and from which work is escalated to the AI Solutions workspace.

**The seed ships two workspaces:** the AI Solutions workspace and one generic PG/Dept **template** workspace. Real practice groups are stood up later by cloning the template. Any references to specific practice groups (Litigation, Finance, and so on) anywhere in examples are **illustrative only** — no named practice-group workspace is seeded.

### 1.1 Provisioning a workspace

Adding a workspace is a **configuration action, not a code change**. A new workspace is created by **cloning the PG/Dept template**. The clone behaves as follows:

- **Copies from the template (own local objects):** the template's **starter local fields** — including the workspace's own lifecycle-status fields (Stage, Hold/Blocked, Display Status) and a **starter local Outcome** field (see below) — and the **starter dashboards and views** built on them, all copied as the new workspace's **own local objects**. The admin edits these freely as they build out their own fields. *(Baseline/status fields are local and workspace-owned; see the platform-field note below for the two exceptions.)*
  - **Starter local Outcome.** The template ships a small local **Outcome** field (a template starter local field, not the platform grant) so a PG-local request can reach a terminal state and **close** under the no-hard-delete floor (§4.3) without escalating. Its seed enum is **Withdrawn / Duplicate / Not pursued**, with a reason field alongside it; the admin may extend it. This is a **different field** from the AI Solutions workspace's delivery **Outcome** ([A], §17.9): the AI-side Outcome drives delivery closure and the status mirror, while the template-local Outcome closes a request the practice group is handling itself. A PG/Dept workspace with no local Outcome and no lifecycle can still only escalate or abandon (as a draft, §9.7); the starter Outcome is what lets it retire its own records.
- **Starts fresh:** all records and data, the member list, and a new **globally unique** ID prefix with its sequence beginning at zero. *(The first minted record in a workspace is `PREFIX-00000001`; the counter's pre-increment resting value is zero — see §6.7.)*
- **Lifecycle and gates — machinery seeded, stages not.** Every workspace ships with the full lifecycle and gate *machinery* (the Stage field, Hold flag, and gate engine are part of the metadata engine, §2). The **standard six-stage lifecycle (§7.1) is seeded only in the AI Solutions workspace.** The PG/Dept template ships with **no seeded stages and no gates** — its Stage field exists but is empty until the workspace admin defines their own stages (if they want workflow tracking at all). There is therefore no lifecycle to drift by inheritance at clone time; a PG workspace builds whatever local lifecycle it needs, or none.
- **Platform-defined references (not copied, not owned):** the **system fields** (§17.1), the **AI Solutions Status** field (§6.4), and **Legacy ID** (§3.6) are defined once at the platform level and referenced by every workspace. They render in each workspace's field schema page but are governed centrally (§4.3). Also present by construction: the metadata engine, the three access levels, and the saved-views-and-dashboards builder.

In **Phase 1**, a new PG/Dept workspace is stood up by an operator **cloning the template** — a configuration action, performed out-of-band, not an in-app flow. The in-app **self-serve provisioning** flow (an in-app wizard that runs the same clone) is **Phase 2** (see §15). The seed's two workspaces exist from day one either way.

### 1.2 The single linked path

The **escalation bridge** (§6) is the only structural linkage between a PG/Dept workspace and the AI Solutions workspace. No configuration can create a second linked path. This is enforced by construction, not by policy (see §6.1).

---

## 2. Objects and the metadata engine

One metadata engine underlies all record types. There are no special-cased objects.

### 2.1 Primary and secondary objects

- **Request**, **Task**, and the **Feature Catalog** are the primary record types. Alongside them sit the **Toolkit** object (§2.6) — one catalog of reusable building blocks (playbooks, plugins, prompts), framework-defined and built in Release 1 (Phase 2) — and the **Announcement** object (§2.7), built in Release 1 (Phase 1). Request carries the full lifecycle; **Task** (§2.4), the **Feature Catalog** (§2.5), **Toolkit**, and **Announcement** are lightweight records that run on the same engine but carry none of the Request's lifecycle machinery.
- Secondary objects: **Comments**, **Attachments**, **Approval Request**, **User groups**, **Saved View**, and **Saved Dashboard**.

**Object instantiation is per-workspace.** The engine defines each object type once; which object types a given workspace *instantiates* is a provisioning/configuration choice, not a code change (no special-casing — the same engine underlies all of them). **Request** and **Task** are instantiated in every workspace by construction. The **Feature Catalog** (§2.5) is instantiated in the **AI Solutions workspace only** (the catalog of what we built lives at the hub). The **Toolkit** and **Announcement** objects are **portable**: the framework supports instantiation in any workspace, and they are seeded in AI Solutions first, with PG/Dept instantiation available later as a configuration action.

### 2.2 Typed links

Records relate to one another through **typed links** — a record-reference field pointing from one record to another, with a type and direction. The seed link types are:

- `duplicate-of`
- `re-pursuit-of`
- `related`
- `sourced-from` — points from a **feature** (a Feature Catalog entry, §2.5) to the source **Request(s)** it was harvested from; carries the usual optional rationale (why the feature is worth cataloging, where it came from)

Each typed link may carry an **optional free-text rationale**, so the "why" of a relationship rides on the link itself. Typed links are the single, audit-grade mechanism for relating records; there is no parallel free-text "related ID" field. A typed link is a reference only — creating one never shares an ID, locks a field, or opens a status mirror, so it can never form a bridge (see §6.1). Typed links are also the substrate the AI-assisted linking feature reads from and writes to (see §14).

### 2.3 The field-type catalog

Fields are defined from a fixed catalog of types:

- Short text, long text, rich text
- Number, decimal, currency, percent (four distinct numeric types, each with its own formatting and validation)
- Date, date & time
- Single-select, multi-select (multi-select carries render and allow-new-values toggles)
- Boolean
- User reference
- Record reference (the typed link)
- URL
- **Calculation** (derived, numeric — see §3.3)
- **Derived category** (derived, conditional — see §3.4)

**Files are the Attachments object, never a field type.** This keeps all file behaviour under one rule: files always follow their record and are not governed by the crossing map (§6.2) — they carry across the bridge regardless of any field mapping.

### 2.4 The Task object

A **Task** is a lightweight child of a Request — the actionable to-dos under a request — not a peer with its own workflow. It runs on the same metadata engine as everything else (no special-casing), but deliberately carries none of the Request's lifecycle machinery.

- **Parentage.** Every Task holds a **required reference to exactly one parent Request**, via the record-reference mechanism (§2.2). That reference is reference-only — it never shares an ID, locks a field, or opens a mirror, so a Task can never form a bridge (§6.1). A Task cannot exist orphaned.
- **Field set.** Tasks draw from the same field-type catalog (§2.3) and ship with a small default set: **title**, **assignee** (user reference), **status**, and an optional **precondition** that drives the task-lock (§7.4). A workspace admin may add local Task fields like any record type. The **precondition** is a single condition-engine rule (§3.1) evaluated over the Task's own fields and/or its parent Request's fields, producing a boolean; it is depth- and cycle-checked like any other rule. It is deliberately **not** an inter-task dependency — "unlock Task B when Task A is Done" is out of scope for the seed; a precondition keys on field values, not on sibling-task status.
- **No workflow machinery.** Tasks do **not** have the six-stage lifecycle, do **not** fire approval gates, and do **not** carry the Outcome enum (§8). They close by **completion**. Because a Task is still a record, the no-hard-delete floor (§4.3) applies: it is marked **Done** or **Cancelled** (with a reason), never deleted.
- **Status.** **Locked** (precondition unmet, §7.4) → **Open** → **Done**, with **Cancelled** as the terminal off-ramp.
- **Surfaces.** A Task gets the standard record surfaces — detail, activity thread, comments, attachments — but not stage, gates, outcome, or the status mirror.
- **Never crosses the bridge.** Only Requests escalate (§6). A Request's child Tasks stay local to their workspace; on escalation the AI side creates its own Tasks against the AI-side record.
- **Not carried on Copy.** Copy (§5) pulls content field values into a fresh draft; child Tasks are work-tracking, not content, so a copied Request starts with no Tasks — consistent with "no outcome and no history."

### 2.5 The Feature Catalog object

The **Feature Catalog** is the team's inventory of reusable **features** — a reusable capability, component, or pattern demonstrated in a shipped solution, recorded so the team can find and reuse it on future builds. Each entry (a *feature*) is a **reference record, not a work item**: like Task it runs on the same metadata engine (no special-casing) and carries **none** of the Request's lifecycle, gates, Outcome enum, or escalation machinery. Where a Task is a lightweight *child* of a Request, a feature points back at the Request(s) it came from.

- **Where it lives.** The Feature Catalog lives in the **AI Solutions workspace** — the reporting hub (§10.1), where builds happen and their reusable parts are known. It is **not** part of the PG/Dept template; practice groups consume it **read-only** through a shared dashboard (§10.3.2, §10.4), they do not own features. Features mint IDs from the AI workspace's own prefix and sequence (§6.7) like any AI-side record — the **object type**, not a distinct prefix, is what separates a feature from a Request.
- **Linkage — reference only.** A feature is connected to its origin through a **`sourced-from` typed link** (§2.2) to one or more source Requests, carrying a rationale. Like every typed link it is reference-only: it never shares an ID, locks a field, or opens a mirror, so it can never form a bridge (§6.1). A feature may exist with no `sourced-from` link (e.g. a pattern that predates the tracker); parentage is **not** required, unlike a Task.
- **Field set.** Features draw from the field-type catalog (§2.3). The seed set — name, one-liner, description, feature type, capability tags, pattern, tech/stack, how-to-reuse, maturity, demo and repo URLs, data-classification/compliance flags, owner, the `sourced-from` link, and Attachments for visuals — is defined in **§18**. A workspace admin may add local fields like any record type.
- **No workflow machinery.** Features do **not** have the six-stage lifecycle, do **not** fire approval gates, and do **not** carry the delivery Outcome enum (§8). Their only lifecycle is a lightweight **Maturity** field. Because a feature is still a record, the no-hard-delete floor (§4.3) applies: it is **Deprecated**, never deleted.
- **Maturity (status).** **Draft** → **Published** → **Deprecated**. Publishing is an ordinary edit any AI Solutions member may make — there is **no approval gate**; the audit trail records who published and when, and the **Owner** field says who to ask. Draft features are visible to AI Solutions members but excluded from the firm-wide catalog dashboard (§10.3.2) until Published; a Deprecated feature stays readable but is filtered out of the default view.
- **Visuals.** A feature's screenshots, mockups, and short clips ride the **Attachments object** (§2.3) — files follow the record and are searchable by filename (§9.5). The two URL fields (demo, repo) link out to the live thing and the code.
- **Surfaces.** The Feature Catalog gets the standard record surfaces — its own list, detail, activity thread, comments, attachments, search, and saved views — entirely separate from the Request list. In Phase 2 it also gets a **gallery view** (a card view with thumbnails, §10.5) and the seeded **Feature Catalog dashboard** (§10.3.2).
- **De-duplication.** Because the catalog can accumulate near-duplicates, features may carry a `duplicate-of` link like any record, and the object-agnostic similar-record mechanisms (the intake-style nudge and the AI check, §9.8/§14) can surface likely duplicates when a new feature is cataloged.
- **Never crosses the bridge.** Like Task, the Feature Catalog is hub-local and features never escalate. Cross-workspace reach is read-only, via a shared catalog dashboard (§10.3.2) — never by crossing the bridge or by a dashboard reaching into another workspace (§10.5).

### 2.6 The Toolkit object (framework — built in Release 1, Phase 2)

The **Toolkit** is the team's single catalog of reusable building blocks — **playbooks** (skills and build instructions), **plugins** (integrations and tools), and **prompts** (reusable prompts) — kept in one place so an analyst has one location to find and track them. It is **one lightweight object with a Type field**, not three: the same record shape serves all three kinds, and the Toolkit page (§10.7) filters by Type into a list per kind. It runs on the one metadata engine and carries none of the Request's lifecycle, gates, Outcome, or bridge.

**This section defines the framework.** The Toolkit is **built in Release 1 (Phase 2, §15)** — pulled forward from the original Release 2 scope. Defining it here reserves the object, its schema (§19), and its behaviour.

- **One object, one Type field.** **Type** is a single-select — **playbook / plugin / prompt** (extensible) — and is the only thing that distinguishes one entry from another. A single lean field set (§19) serves all three: name, one-liner, a rich-text **body** that holds the playbook's instructions, the prompt's text, or the plugin's integration notes as the case may be, plus tags, tech/stack, owner, links, Maturity, `related` links, and Attachments. Type-specific fields (a prompt's variables and model, a plugin's endpoint and auth) are **out of scope for now**; if ever wanted they can be added as optional fields shown by Type through the condition engine's show/hide (§3.1), with no new object.
- **Where it lives — portable, seeded at the hub.** Instantiated in the AI Solutions workspace first; portable to PG/Dept workspaces later (§2.1), so a practice group can keep its own toolkit. Each workspace's entries are its own local records; the AI Solutions toolkit is shared read-only through a dashboard/view (§10.4), never bridged.
- **No workflow machinery.** No lifecycle beyond the lightweight **Maturity** field — **Draft → Published → Deprecated**, publishable by any member with no approval gate, audited; **Deprecated**, never deleted (§4.3).
- **Linkage.** A Toolkit entry connects to the features it relates to and the Requests it was used on through **`related`** typed links (§2.2), reference-only — never a bridge.
- **Surfaces.** Its own list, detail, search, and saved views, plus the Toolkit page (§10.7) that filters by Type, and — for prompt-type entries — a one-click **copy** affordance. When built it reuses the read-only firm-wide sharing (a Toolkit dashboard on the Dashboard-viewer surface, §10.4) and the gallery view (§10.5). Never crosses the bridge.

### 2.7 The Announcement object

An **Announcement** is a lightweight team notice — a short post an admin broadcasts to give analysts news even when their own queue is quiet: a new Toolkit entry published, a gate-criteria change, coverage or scheduling news. It runs on the one engine and carries none of the Request's lifecycle.

- **Built in Release 1.** Unlike the Toolkit (Release 1, Phase 2), the Announcement object is **built in Phase 1** — it is cheap, and it is part of what makes the platform a daily destination from day one.
- **Delivered through the bell.** An announcement fans to its audience through the in-app notification centre — the **bell** (§11.3) — like any other event on the spine (§11.1): posting one emits an **"Announcement posted"** event (§11.2) that lands in the bells of everyone in its audience. There is no dedicated announcements page to visit; the bell is the delivery channel.
- **Kept as a light record.** Because a bell notification is transient, the announcement is also a **persisted record**, so notices don't vanish once read: it can be **pinned**, it has an **expiry**, and there is a browsable list for history. **Pinned** announcements additionally show as a **slim strip at the top of the Home** (§10.7) until they expire or are unpinned — a persistent banner for the few notices that must not be missed, distinct from the transient bell stream.
- **Portable, seeded at the hub.** Instantiated in the AI Solutions workspace first; portable to PG/Dept workspaces later (§2.1) so a practice group can post its own notices.
- **Field set.** Title, body (rich text), an **audience** (everyone / role-scoped / named users — the same two-layer model as dashboards, §10.2, so an announcement never widens access), an optional **pin** flag and **expiry date**, and author (Created by). Full schema in **§20**.
- **Lifecycle.** None beyond publish/expire. An announcement is **Published** to fan to the bell and become visible, and is **retired** (never hard-deleted, §4.3) when done; expiry retires it automatically. It never crosses the bridge.

---

## 3. Fields and the condition engine

### 3.1 The field-agnostic condition engine

A single condition engine evaluates rules of the form *field + comparison + value* against any field, regardless of type. A rule's **action** is one of:

- **Show** or **hide** a field on the form
- **Require** a field
- **Produce a value** — a field value that powers the derived-category field (§3.4), **or an approver reference** (a user or team) that a gate consumes as a slot (§7.2)

The produce-a-value action therefore has three output types: a number (Calculation, §3.3), a label (Derived-category, §3.4), and a user/team reference (conditional approver, §7.2). It is one action, not three engines.

Rules are validated at save time. The dependency graph across all conditions and derived fields must be **acyclic** and no deeper than **three levels**; the builder rejects any cycle or over-depth chain at save. This guard spans derived fields **and approver-producing rules alike** — a Calculation, Derived-category, or conditional-approver rule may build on another derived field, but never in a cycle, and a conditional approver keyed on a derived field is depth-checked like any other chain.

The comparison **value** in a rule may be a literal, a **current-date reference** (a dynamic "today"), or a **current-user reference** (a dynamic "me"). The current-date reference makes time-relative rules — such as *Due Date is in the past → Overdue* — expressible; it is a **Phase 2** capability (it powers SLA Status, §17.2, and the live time-in-stage indicator, §10.6). The current-user reference lets a single shared rule or view mean "mine" for whoever is looking — *Assigned Analyst = me*, *Requestor = me*, *I am a Watcher* — which is what makes one seeded **Home surface** (§10.7) work for every analyst rather than each person rebuilding a personal view. It resolves to the viewer and, like every query, respects the viewer's entitlements (§10.2). The current-user reference is a **Phase 2** capability (it ships with the Home surface); everything else in the engine is Phase 1.

**Seed-rule constraint (builder rule).** Any derived field or rule that ships in the template seed may reference **only fields present in the template**. Seeded rules may not reference AI-side-only ([A]) fields or fields specific to another workspace. A workspace admin adding their own rules that reference their own local fields is unrestricted; this constraint governs the shipped seed, keeping every clone internally consistent on day one.

### 3.2 Per-field configuration and per-stage visibility

Each field carries its own configuration. A field may be set to appear only on **certain lifecycle stages** (default: all stages).

The interaction between **required** and **per-stage visibility** is defined as follows: a field that is not shown on the current stage never blocks it — *required is suspended while the field is off-stage*, exactly as it is suspended when a condition hides it. A required field is enforced only on the stages where it is shown, and only **prospectively at the advance/gate**, never on casual edits. "Required on one specific stage only" is expressed as a conditional-required rule keyed on the Stage field; per-stage visibility is the no-rule convenience for scoping *where* a field appears.

### 3.3 The Calculation field

A **Calculation** field is a derived, read-only value computed at read time. Its operands are numeric fields and numeric literals; its operators are `+ − × ÷` with parentheses; its output is a number. Non-numeric fields are not valid operands. It is used for scoring and sorting (for example, backlog ordering).

Calculation stays **numeric-only** — it does no date arithmetic. A separate **date-difference** primitive (elapsed time between two dates, or between a date and the current-date reference, §3.1) is a **Phase 2** extension used for the live time-in-stage indicator (§10.6); it is not part of Calculation.

### 3.4 The Derived-category field

A **Derived-category** field is a derived, read-only value produced by an **ordered list of when → then rules** (first match wins), evaluated through the condition engine over any field type, with an optional default. Its output is a value, typically a label. It is not a new engine — it is the condition engine with a "produce a value" action.

**Display Status** (a per-workspace local field) is the primary seed instance. In the **AI Solutions workspace** it is derived from Stage, the Hold/Blocked flag, and Outcome:

- If **Outcome** is set → show the Outcome (Shipped—live renders as **Live**)
- Else if **Hold/Blocked** is set → show that
- Else → show the **Stage**

A **PG/Dept** workspace ships with a simpler seed rule set. It does not have the AI-side delivery Outcome ([A]), but it does carry the **template-local Outcome** (§1.1), so its seed rule is: if the **local Outcome** is set → show it (the record has closed locally); else if **Hold/Blocked** is set → show that; else show **Stage**. Because the PG template seeds **no stages** (§1.1), Stage is unset out of the box, so before the admin defines a lifecycle Display Status shows the local Outcome once a record closes, the Hold reason while held, and is otherwise **blank** — a record is fully usable (all its content fields work) with no workflow position until then. Each workspace owns its own Display Status field and may extend its rules against its own local fields.

**Mirror Status** is a second seeded Derived-category field, **AI-side only**, that feeds the escalation status mirror (§6.4). It exists so the AI team's own Display Status can keep full fidelity while the PG-facing mirror shows a coarser "it's shipping/shipped" signal — collapsing both delivery-end stages into one label:

- If **Outcome** is set → show the Outcome (Shipped—live renders as **Live**)
- Else if **Hold/Blocked** is set → show that
- Else if **Stage = Deploy or Post-launch** → show **Deployed** *(neither Deploy nor Post-launch is surfaced distinctly to the PG side; both read as Deployed until the record closes)*
- Else → show the **Stage**

### 3.5 Client and matter

Two optional core fields: **Client** (six-digit) and **Matter** (four-digit). Both are stored as **fixed-width strings**, not numbers, so leading zeros are preserved. **Matter requires Client** (cross-field validity: both blank, client only, or both populated are the valid states). Entry is manual and in-app.

### 3.6 Legacy ID

A single optional **platform-defined** field, **Legacy ID**, preserves a migrated record's identifier from its source system. It is **short text** (like Client and Matter, stored as a string so leading zeros and punctuation survive), **populated only by CSV import** — blank on in-app and API creation — **searchable** (§9.5), and **not unique-constrained**, since two source systems or a re-run migration can legitimately repeat a value. It is present in every workspace (a platform-defined reference, §1.1) and is **editable** — an admin can correct a bad migration value, and every such edit is captured in the audit trail like any other. It is **not a crossing field**: it never enters the crossing map and never locks on escalation. The canonical `PREFIX-NNNNNNNN` ID remains system-minted and immutable regardless of what Legacy ID holds.

### 3.7 The seed field schema

The concrete seed schema for the Request record — every field, its type, whether it is a crossing field (mapped PG↔AI) or AI-side, and its seeded validation — is defined in **§17 (Seed field schema)**. This section (§3) defines the field *mechanisms*; §17 is the canonical list of the fields the build ships with.

---

## 4. Identity and permissions

### 4.1 Sign-in

Access is via **single sign-on**.

### 4.2 The three access levels

Every workspace has three fixed access levels:

| Level | Read | Add | Edit | Close | Configure | Scope |
|---|---|---|---|---|---|---|
| **Workspace admin** | ✓ | ✓ | ✓ | ✓ | ✓ (local) | Own workspace |
| **Member** | ✓ | ✓ | ✓ | ✓ | — | Own workspace |
| **Viewer** | ✓ | — | — | — | — | Read only |

The **Dashboard viewer** is not a separate level — it is a **Viewer** whose only surface is a bound dashboard (see §10.4).

**Platform admin is an additive, firm-wide grant that sits above the three levels, not a fourth level.** A person holds one of the three levels in each workspace they belong to, and *may additionally* carry the Platform admin grant, which confers firm-wide rights no per-workspace level includes: the platform-defined field schema, the cross-workspace crossing map, access provisioning, and the full audit. Who holds the grant is deployment configuration.

### 4.3 Permission floors

Four rules sit above the level model and override it:

- **No hard delete, anywhere (records).** Records are never deleted — they **close** (a terminal Outcome with a captured reason; the record persists). Configuration is **retired** with its history preserved. This floor exists because the append-only audit trail cannot have its history orphaned. **Drafts are pre-record and sit outside this floor:** a draft (saved or not) can be discarded freely by its owner, because it has no canonical ID and no audit history to orphan. The floor attaches at **submission** — the moment a draft becomes a record with an ID and its first audit entry.
- **System fields are immutable to everyone** — the ID, timestamps, and created-by are set by the system and never editable, not even by a Platform admin.
- **Platform-defined fields are governed centrally.** A small set of fields is defined once at the platform level and referenced by every workspace: the system fields (§17.1), **AI Solutions Status** (§6.4), and **Legacy ID** (§3.6). They render in every workspace's field schema page as a **read-only band**; only a **Platform admin** may edit a platform-defined field's definition, and such an edit applies to all workspaces at once (captured in the configuration audit, §12). They cannot be retired while any mirror, dashboard, view, or crossing map depends on them. Their **presentation** (form placement, ordering) is a local attribute carried by each workspace's reference; their **definition** (identity, type, binding, derivation rules) is central. AI Solutions Status additionally has **no manual write path at all** — it is written solely by the bridge off the event spine (§6.4).
- **Cross-workspace mappings are AI-side-confirmed.** A **cross-workspace field mapping** — a PG/Dept field crossing into an AI Solutions field (§6.2) — takes effect only when confirmed by an **AI Solutions workspace admin or a Platform admin**, who alone may create the AI-side target field. A PG/Dept workspace has no authority to create fields in, or push unmapped data into, the AI Solutions workspace.

Every edit is captured in the audit trail regardless of who makes it.

---

## 5. The Copy action

Any record can be **copied** into a new draft. Copy pulls the content field values into a fresh draft that the user edits before submitting. On submit, the result is a **new, unlinked request** with a fresh ID (a direct request — never a bridge pair), reset to the target workspace's first stage — or to no stage at all where that workspace has defined no lifecycle (§1.1), exactly as a direct create there starts — carrying no outcome and no history.

**Content field (definition).** A *content field* is any user-editable field that is **not** a system field (§17.1), **not** a derived field (§3.3–3.4), **not** a lifecycle/workflow field (Stage, Hold/Blocked, Outcome, Outcome Notes), and **not** the Task→parent reference. Copy carries content fields only, and never carries: system fields, derived fields (they recompute), Stage (reset to first stage, or none), Hold/Blocked (a copy starts un-held), Outcome + Outcome Notes (a copy starts with no outcome), child Tasks (§2.4), history, and attachments unless the include-attachments toggle is set. Within a single workspace (a plain copy or re-pursuit) every content field carries, **including [A] fields**; across workspaces a content field carries only where a correspondence exists (see the next bullet).

- **Across workspaces**, copy carries a field's value only where the target workspace has a corresponding field. For the **PG↔AI** direction that correspondence is the crossing map (§6.2), read in whichever direction the copy runs. For **PG↔PG** or any other pair with no crossing map between them, correspondence is by **same field identity** — a field present in both workspaces (a platform-defined field, or a same-named local field of compatible type) carries; anything without a counterpart drops.
- Copy **offers a link back** to the source — a `related` link, or `re-pursuit-of` if the source is closed — preserving lineage without forcing it.
- **Attachments** carry over only when the "include attachments" toggle is set (default off).
- Copy reuses the Draft mechanism (§9.7).

Copy is how work is handed back to a practice group without any reverse bridge: the AI Solutions team closes the record with an outcome, and the practice group copies the content into a fresh local request they own.

**Task → Request promotion.** A **child Task** whose scope has outgrown its parent Request may be promoted to its own Request. A "promote to Request" button on the Task record runs Copy against the parent Request (as the source), opens the resulting draft for the user to edit for the new scope, and — on submit — stamps a `related` link from the new Request back to the parent Request (with the Task's title in the link rationale, per §2.2). The original Task remains on the parent, its status left to the user (typically **Cancelled** with a reason pointing at the new Request, or **Done** if the parent's line is finished). No new mechanism — Copy plus a link plus a labeled button.

**Add to catalog.** An **"Add to catalog" button** on a shipped Request (and on its Build surface) opens a new **Feature Catalog** entry draft (§2.5) prefilled from the Request by **same-field-identity** — Name, Tech/Stack, Solution Pattern, and the repo URL carry into their same-named fields; everything without a counterpart drops. The user edits the draft for the catalog (writes the one-liner, the how-to-reuse notes, attaches screenshots), and on submit the platform stamps a **`sourced-from`** link from the new feature back to the source Request. It is the same **prefill-plus-link-plus-button** pattern as Task → Request promotion — no new mechanism, just the Draft prefill (§9.7) seeding a feature draft rather than a Request draft. Manual creation of a feature from scratch is always available too; the button is the convenience for harvesting from a specific build.

---

## 6. The escalation bridge

The bridge is the single most load-bearing mechanism. It moves a request from a PG/Dept workspace into the AI Solutions workspace for delivery, while keeping the practice group informed through a read-only mirror.

### 6.1 Escalation is the only linked path

The linkage between a PG record and its AI-side record is a **bundle** of three things, written **only** by the escalation action:

1. A **shared canonical ID** (the AI-side record adopts the PG record's ID)
2. A **field lock** on the crossing fields on the PG side
3. A **status mirror** back to the PG record, surfaced through the **AI Solutions Status** field (§6.4)

*(Note: the PG record's own lifecycle fields — its local Stage and Hold/Blocked — are **not** locked by escalation. They stay live and PG-controlled. AI-side delivery status is carried by the separate, read-only AI Solutions Status field, §6.4. See §6.5.)*

No other operation and no admin surface can produce this bundle. A direct create or a CSV import mints its own new workspace-prefixed ID with no pair and no mirror; a typed link relates two records but never shares their ID, locks a field, or opens a mirror. "No second linked path" therefore holds by construction, and can be tested row by row:

| Entry path | Shared ID | Field lock | Mirror back |
|---|---|---|---|
| **Escalation** | ✓ | ✓ | ✓ |
| Direct create | — | — | — |
| CSV import | — | — | — |
| Typed link | — | — | — |

**Landing stage.** An AI-side record created by escalation lands on the **first stage (Intake)**, so every AI-side record — escalated or AI-direct — starts on one code path and passes through the AI team's own intake screening. The bridge sets the new AI-side record's **Created-at** to the escalation event (§10.6); pre-escalation PG time is not carried onto the AI record.

### 6.2 What crosses: the crossing map and field classes

Each workspace **owns its own fields** — there is no single field that is literally the same object in every workspace (except the platform-defined fields, §4.3). What crosses the bridge is defined by an explicit **crossing map**: a PG/Dept field is marked to cross and **mapped to a specific target field in the AI Solutions workspace**. On escalation, each mapped field's value is snapshotted into its AI-side target. A field with no mapping does not cross.

The crossing map obeys these rules:

- **Set on the field schema page.** "Crosses-to" is an attribute of the PG/Dept field's own definition, configured on the schema page — not a separate whitelist surface. The seed crossing set is the **[S] fields in §17**, each mapped 1:1 to a same-named AI Solutions field.
- **AI-side confirmed.** A PG/Dept admin may mark a field to cross and *propose* its AI-side target, but the mapping takes effect only once an **AI Solutions workspace admin or Platform admin** confirms it; if no suitable target exists, only they may create the new AI-side field (§4.3). The receiving side controls what lands in the receiving side.
- **One-to-one.** A mapped pair is one PG field ↔ one AI field. Two PG fields cannot map to the same AI field (no merge ambiguity in the snapshot), and one PG field cannot fan out to several AI fields.
- **Type-compatible.** A mapping is valid only between compatible types — you cannot map a date onto a currency. The engine checks compatibility at save and rejects an incompatible mapping.
- **Select option-set reconciliation.** For **single-select and multi-select** crossing pairs, type-compatibility is not sufficient — the mapping also carries an **option correspondence** (each source option → a target option), set by the AI-side admin at map-confirm time (§4.3). On escalation: a source value with a mapped target option snapshots to that option; a source value with **no** corresponding target option lands in the target field's reserved **"— (uncategorized)"** value and raises a **non-blocking validation flag** on the AI-side record — never silent, never dropped (the same warn-don't-block posture as CSV import §13 and the heatmap's "— (unset)" row §10.3). If the target field has **allow-new-values** on (§2.3), the unmapped source option is instead **created** on the target and the value snapshots to it. The receiving side owns its own vocabulary, and no crossing value is ever silently lost.
- **Derived and system-computed fields never cross via the map.** A **derived field** (Calculation, Derived-category — e.g. Priority Score, Display Status) is never a crossing-map source or target; its *operands* may cross, and the derived value **recomputes independently on each side** from whatever operands exist there. **System fields** are likewise not map entries: the **ID** crosses **as reference** (the AI-side record adopts it), while **timestamps** do not cross — each side keeps its own (see the class table). **Origin** is neither — it is **system-computed** from the ID prefix via the prefix registry (§17.1); it does not cross because the prefix is fixed at mint and resolves to the same originating workspace on both sides of an escalated pair. The crossing-map editor rejects any derived, system, or system-computed field as source or target.
- **Both-side retirement is guarded.** An AI-side field that is the live **target** of a mapping cannot be retired until the mapping is repointed or removed. Symmetrically, a PG-side field that is the live **source** of a mapping cannot be retired until the mapping is removed — the same protection stages and gates get (§7.1).
- **Forward-only.** Adding or changing a mapping affects **future** escalations only; a record already escalated keeps the snapshot it crossed with and never retroactively acquires a newly mapped field.

**Phasing.** In **Phase 1** the seed ships the 1:1 [S] crossing map **read-only**, and escalation uses it as-is — no admin-editing of mappings in the MVP. The **admin-editable crossing map** (a PG admin *proposing* a mapping and its target, AI-side *confirmation*, the type- and option-set checks, and the retirement guards above) is **Phase 2** (§15). This defers the propose/confirm workflow without blocking day-one escalation.

On escalation, fields then behave by class:

| Class | Crosses | Snapshot | Lock on PG | AI edits |
|---|---|---|---|---|
| **Record ID** | adopted (shared key) | n/a | always | no |
| **Timestamps** (Created/Updated at) | no — per-side | n/a | n/a | no |
| **Mapped** (has a crossing map entry) | yes — into its mapped AI-side field | yes | yes | yes, logged (AI record only) |
| **Unmapped / local** | no | no | stays editable | no |

Only the **ID** is shared across the bridge — the AI-side record adopts it (§6.7). **Timestamps are per-side-honest system fields** (like Workspace, §17.1): the AI-side Created-at is the escalation event (§6.1, §10.6), and the PG intake timestamp stays on the PG record, reachable through the shared ID but never copied onto the AI record.

Mapped fields cross into their AI-side targets, are snapshotted, lock read-only on the PG side, and remain AI-editable (every edit logged); those edits update the AI-side current value only and do **not** propagate back to the PG record. Unmapped and local fields — including the PG's own lifecycle fields (§6.5) — do not cross and stay editable on the PG side.

### 6.3 Snapshot, lock, attachments

- **Confirm-then-lock:** on escalate, the user is prompted to commit any pending edits to crossing fields (nothing is silently discarded), then the snapshot is taken and the mapped fields lock.
- The **original snapshot is preserved permanently** on both records. Later AI-side edits write a new current value on the **AI record only**; the PG-side crossing fields continue to display the escalation-time snapshot. The original is never erased.
- **Attachments follow the record** — they are not a field class, so the crossing map does not govern them. They are carried to the AI side while the PG keeps a read-only copy. After escalation it is one-way-for-work: new AI-side files do not mirror back.
- A **missing required crossing field blocks escalation** at the confirm-and-lock step.
- **Mapping changes are forward-only:** adding or repointing a crossing map entry crosses on future escalations, never retroactively onto records already escalated (§6.2).

### 6.4 The status mirror and the AI Solutions Status field

After escalation, the PG record surfaces AI-side delivery progress through the **AI Solutions Status** field — a **platform-defined, read-only field** present in every workspace (§4.3):

- It is **read-only to everyone at every level**, including workspace and Platform admins. It has **no manual write path**; it is written solely by the bridge off the event spine (§11.1), the way system timestamps are.
- It is **blank until escalation**. From escalation onward it tracks the AI side live, driven by the AI-side **Mirror Status** field (§3.4): Intake → Discovery → Build → QA → **Deployed** (both the Deploy and Post-launch stages collapse to **Deployed**, so the PG side sees neither distinctly), flips to "on hold" with the reason when the AI-side hold flag is set, and shows the outcome (Live / Declined / Withdrawn / Duplicate) when the record closes.
- It updates automatically off the AI side's stage, hold, and closure events — part of the event's baseline emission, not a configured notification rule — so it stays current after handoff rather than freezing at the snapshot. The mirror's event set is deliberately not the notification set: stage moves update this field silently, while the events that notify across the bridge — hold changes, gate decisions, and closure — are defined in §11.2.
- It includes a **"view linked AI record" link** that resolves against the viewer's own access (a viewer without access to the AI record does not get the link). The PG-side crossing fields themselves show the escalation-time snapshot and do not update; current AI-side field state is reachable only through this link, access permitting.

Because AI Solutions Status is a real field (not merely a display artifact), the condition engine (§3.1) can key on it: a PG workspace may build dashboard widgets or configure rules against it (see §6.5). It is the single live cross-workspace status element on the PG record.

### 6.5 On AI-side closure and PG local lifecycle

The PG record's **own lifecycle, if the workspace has defined one, stays live and PG-controlled** after escalation — a practice group often has local work beyond forwarding (rollout, internal docs, training), so their local Stage and Hold remain theirs to move. A PG workspace that has seeded no stages (§1.1) simply has no local stage to move; the AI Solutions Status field (§6.4) still carries the delivery signal either way, so escalation and the mirror work regardless of whether the PG side runs a local lifecycle.

When the AI-side record closes, the platform updates **only the AI Solutions Status field** on the PG record. It does **not** change the PG record's own lifecycle. If a workspace wants its record to react — for example, auto-complete its local Stage when AI Solutions Status shows a terminal outcome — that is a rule it configures **in its own workspace, opt-in**, keyed on the AI Solutions Status field via the condition engine. It is never a platform default.

### 6.6 One-time, one-way

Escalation is **one-time and one-way**. A PG record produces at most one AI-linked record, ever. There is **no de-escalation**: a mistaken escalation is resolved by closing the AI-side record with a reason, which the mirror reflects. Getting a practice group to act mid-flight, or handing work back, is done through the Copy action (§5), not by reversing the bridge.

### 6.7 The ID scheme and re-pursuit

Every record carries a **`PREFIX-NNNNNNNN`** ID — a **globally unique** per-workspace prefix registered when the workspace is provisioned, plus an eight-digit zero-padded sequence. Prefix uniqueness is enforced at provisioning and is what makes the **Origin** field (§17.1) unambiguous. The prefix-to-workspace mapping recorded at provisioning is the platform **prefix registry** — a stored, platform-level table that Origin reads (prefix → originating-workspace name) rather than any hardcoded mapping. Retiring a workspace does not remove its registry entry, so Origin still resolves for historical records minted under a retired workspace's prefix (forward-only, as elsewhere). **The per-workspace sequence is the single authority for minting IDs: every mint — an in-app create or a CSV import row — draws the next value atomically from that one counter, so concurrent in-app creation and a running import interleave without ever colliding on a number.** The counter's resting value is zero; the **first minted record is `PREFIX-00000001`**. On escalation the AI-side record **adopts the PG record's ID** (the shared key). A direct AI-workspace request mints its own **AI-prefix** ID; a CSV import mints IDs from the **importing workspace's own prefix and sequence** (the CSV carries no target IDs — see §13).

**Re-pursuit** of a closed request mints a **fresh ID** (the next in its prefix's sequence) and records a `re-pursuit-of` link back to the closed record. A closed ID is never reused, reopened, or re-minted — reusing one would collide with the append-only history. The closed record stays closed and readable; the new record is where the work happens. In practice, re-pursuit is the Copy action (§5) plus the link.

### 6.8 Deactivation and reassignment

A user with a **pending individual sign-off** cannot be deactivated until it is reassigned or resolved, so a frozen Approval Request never points at a dead account. For a **team** approver slot, deactivating one member is fine as long as the slot retains an eligible signer (see §7).

**Open owned or assigned records do not block deactivation.** Unlike a pending sign-off, an ordinary user reference on a live record — Assigned Analyst, Business Owner, Requestor, or any user field — does not corrupt a frozen gate, so it does not gate offboarding. On deactivation the account is disabled immediately; the records it was named on become **orphaned references**, and **notifications to the deactivated account are suppressed** so "assigned to you" (§11.2) no longer fires into a dead inbox. The work stays visible and recoverable without holding up the deactivation.

**Phasing.** The **safety floor is Phase 1**: block deactivation while an individual sign-off is pending, and suppress notifications to disabled accounts. Reassignment in the MVP is **manual** — an admin filters the records list to the departed user on each user-reference field (Assigned Analyst = them, then Business Owner = them, and so on) and reassigns; this requires only that user-reference fields are **filterable by value** (§9.1) and that a **deactivated account stays resolvable as a filter value**, both of which the MVP provides. The two conveniences on top — a **standing "orphaned reference" filter** (a pre-saved view of "any user field pointing at a disabled account") and a **bulk-reassign** action over that set (each per-record change audited) — are **Release 2**; they collapse the manual per-field passes into one, but the manual path fully covers offboarding until then.

**No approver delegation.** There is no out-of-office / delegate-to mechanism. A planned absence on a **team slot** needs nothing (any member signs); on a **named-individual slot** it is handled manually — either design the gate as a team slot up front, or an admin reassigns the pending Approval Request. This is a deliberate non-goal, not a gap: the situation is rare and cheaper to handle by hand than to build routing around.

---

## 7. Workflow, lifecycle, and gates

### 7.1 Lifecycle as data

The lifecycle is a **stored definition**, never hardcoded. The AI Solutions lifecycle has **six stages**:

**Intake → Discovery → Build → QA → Deploy → Post-launch**

(Design review is part of Build.) Stages **and gates** are configurable per workspace: a workspace admin can add, rename, re-point, or retire stages and gates as workflows evolve. Renaming a stage is non-breaking; deleting a stage that a gate points at is blocked until the gate is re-pointed. Closure is not a stage — it is a terminal Outcome (§8) that can be reached from any stage.

### 7.2 Approval gates

A gate fires on a stage transition, opening an **Approval Request** whose approver set is **frozen at the moment the gate opens**. An approver **slot** is one of:

- A **named individual**, tagged with a **role label**, or
- A **team** (a user group), where **any one member** signs.

Role labels come from a Platform-admin-managed catalog (seed labels: AI Solutions Manager, PG/Dept Lead, GCO, InfoSec). The label is captured with each sign-off in the audit; label rename/retire is forward-only, so past sign-offs keep the label they were captured under.

The **GCO** and **InfoSec** labels are firm compliance roles used by gates in the **AI Solutions** lifecycle; PG/Dept workspaces ship without gates but retain the full gate machinery to add their own later. **No gate is locked or mandatory** — every gate, including those using compliance labels, is an ordinary gate the workspace admin can add, re-point, or retire. Governance here rests on that configurability plus the configuration audit trail (§12), not on a hard lock.

**Resolution:**

- A gate may have multiple slots on an **AND-join** — every slot must be satisfied to advance.
- A **team slot** is satisfied by any one member's sign-off (a fixed pool behaviour, not a configurable N-of-M). There is no configurable quorum, majority, or "any-K-of-N" among named individuals.
- A **conditional approver** conditionally adds a named person or team, selected by the condition engine's produce-a-value action (§3.1).
- **Partial reject preserves standing approvals:** if one approver rejects, the record loops back and only the rejecting slot must sign again; approvals already given stand.
- The approver set and gate targets freeze at gate-open, so a mid-flight edit to a gate governs only its next firing; in-flight approvals resolve against the frozen snapshot. For a team slot, the **team reference** is frozen but eligibility follows current membership.

### 7.3 Sign-off channel

Approvals happen **in-platform**. A sign-off request fires a notification with a link; the approver opens the request or task and approves or rejects **in the app** — that is the inline approve/reject surface on the record's task list. The decision, timestamp, and optional comment are captured natively, and the gate resolution lands in the audit.

Note that this surface interleaves two distinct objects: **child Tasks** (§2.4, the to-dos) and open **Approval Requests** (§2.1, the pending sign-offs). A pending sign-off is not a Task — it is resolved by approve/reject, not by completion — so the two are never conflated even though they share the list.

For genuine off-platform decisions, an admin may record a **proxy sign-off**, which the audit marks as **manually entered and off-platform**, attributed to whoever recorded it. This is the exception, never the default.

### 7.4 Other lifecycle mechanics

- **Terminal states** close with an Outcome plus Outcome Notes (§8).
- **Hold/blocked** is a flag (with an optional reason), orthogonal to stage — a record is held *at* a stage and resumes there. A deferral is a hold, **not** a stage and **not** a closure.
- **Task lock** — a Task (§2.4) can be gated by its **precondition** — a single condition-engine rule (§3.1) over the Task's own or its parent Request's fields (§2.4), not an inter-task dependency; until the rule is satisfied the Task is **Locked** and cannot be worked.
- **Routing is configuration, never hardcoded.**

---

## 8. Outcomes and closure

A record closes with exactly one **Outcome**:

- **Shipped — live** — built and deployed (renders as **Live** in Display Status)
- **Declined** — the AI Solutions team decided not to build it
- **Withdrawn** — the requestor pulled it
- **Duplicate** — closed as a duplicate of another request

The **specific reason** (not feasible, not prioritised, out of scope, and so on) lives in **Outcome Notes**, so the enum stays small and categorisation stays consistent. There is deliberately no "Deferred" outcome — a deferral is a hold. Closing as **Duplicate** records which record it duplicates through the `duplicate-of` typed link. On closure, the **Requestor**, **Business Owner**, and **Watchers** are notified (§17.3, §11.2); the notification rides the closure event across the bridge.

This Outcome is the **AI Solutions delivery** outcome ([A], §17.9) — it governs delivery closure and the status mirror. A **PG-local** request that a practice group is handling itself, and is not escalating, closes through the workspace's **template-local Outcome** instead (§1.1): the same no-hard-delete floor applies (§4.3), and the local Outcome's own enum (seed: Withdrawn / Duplicate / Not pursued) is the terminal state.

---

## 9. Records surfaces

### 9.1 The records list

Filterable, sortable, and searchable, with columns driven by the active saved view. Numeric columns support a value filter. This is the primary working surface and, in Phase 1, the primary reporting surface (aggregate dashboards arrive in Phase 2 — see §15). A count on the list is simply the number of rows matching the active filter, resolved against the viewer's entitlements.

### 9.2 The record detail

Shows fields, stage, typed links, the hold flag, attachments, and the activity thread. **Editing is value editing** on the flat access ladder — members edit values, viewers read, system and platform-defined fields are locked, and every edit is logged. Field *definition* (choices, config) is a separate admin capability, not part of record editing.

### 9.3 The activity thread and comments

One chronological thread interleaves **comments** and **system events**. **Comments are immutable** — a posted comment stands, and a correction is a new comment. Comments are never edited or hard-deleted; this keeps the trail clean for an attorney-adjacent record.

### 9.4 Saved views

**Shared** (admin-authored, visible to the workspace) and **personal** saved views define column sets, filters, and sort. Views are presentation-only and always resolve against the viewer's entitlements. Like dashboards, views are **workspace-local** (§10.5) — built in and belonging to one workspace; the template's starter views are stamped into each new workspace as its own local objects.

### 9.5 Search

Searches field text, comment text, and attachment filenames (no OCR). Access-respecting — you find only what you can see. Legacy ID (§3.6) is searchable.

### 9.6 Documents

Per file, a document is either a **native upload** or a **link** to an external system. (The specific document-management connector is a Release 2 decision.)

### 9.7 Drafts and templates

A request can be **saved as a draft** — personal, with no canonical ID until submission, no team notifications, and no audit entry until it is submitted. A draft is pre-record: it sits outside the no-hard-delete floor (§4.3) and its owner may discard it freely at any time, leaving no trace. Saved drafts persist indefinitely; users clean up their own. Copy (§5) pre-fills a draft.

**Request templates (entirely Release 1, Phase 2).** A **template** is a saved draft flagged as workspace-visible (rather than personal), with a display name. When a user starts a new request, they may pick a template as the starting point; the draft prefills from the template's values, and the user edits before submitting. The whole feature — the workspace-scoped named prefilled draft **and** the admin UI to promote a draft to a template, name it, and manage the catalogue — ships in **Release 1 (Phase 2)**, pulled forward from the original Release 2 scope; both sides ship together, since the template picker is inert until the promote-to-template UI exists to populate it. No templates are seeded (curation is per-workspace work that follows real usage). The MVP's prefill need is already met by **Copy** (§5), which pre-fills a draft from any existing record and ships in Phase 1.

### 9.8 Similar-requests nudge at intake

As the requestor types **Name** and **Description** on the intake form, the form surfaces up to three existing requests whose titles and descriptions match on keyword. Match is a pure text search (no AI), scoped to the current workspace, and **access-respecting** — the same rule as §9.5, so the nudge never reveals a record the user couldn't otherwise see. For each surfaced match the user can **dismiss** (hide from this session), **open** (navigate to the record), **link as `related`** (proceed with the new request while noting the connection — because a draft is pre-record (§9.7) and cannot yet hold a typed link, the `related` link is **queued on the draft and stamped at submission**, when the request becomes a record), or **discard the draft** (abandon this request and let the matched record stand). The discard is a plain draft discard (§9.7): a draft is pre-record, so there is no Outcome to set and no `duplicate-of` link to write — it leaves no trace, exactly as any discarded draft does. A user who wants the duplication recorded as lineage submits the request first and then closes it as **Duplicate** through the normal closure path (§8), which is a record-level action, not a nudge shortcut. The nudge is Phase 1; it uses no new mechanism beyond §9.5's search index and §2.2's typed links. When the AI-assisted duplicate check (§14) ships in Release 2, it operates alongside this nudge — the nudge is the always-on cheap defense; the AI check is the smarter, admin-configured overlay.

---

## 10. Reporting and dashboards

*Phasing split: the **three seeded dashboards** (§10.3, §10.3.1, §10.3.2) ship as **fixed layouts** in **Phase 2**, built from the widget types defined below. The **no-code dashboard builder** — the surface that lets an admin author their own dashboards and widgets from the palette, edit audiences, and configure drill-through — is **Release 1 (Phase 2)** (§15), pulled forward from the original Release 2 scope. In Phase 1 the records list (§9.1), with saved views and export, is the reporting surface.*

### 10.1 The reporting hub

The **AI Solutions workspace is the reporting hub.** The firm-wide dashboard reads the **hub only** — escalated plus AI-direct work — grouped by originating practice group via the ID prefix (Origin). It does **not** federate live across PG workspaces. Un-escalated PG-local requests stay in each practice group's own workspace, where that group keeps its own local dashboards. Because the hub contains only escalated and AI-direct records, hub widgets reflect escalated work — a low count for a practice group means little escalated work, not necessarily little total activity.

### 10.2 Dashboards live in a workspace

Dashboards are saved objects that live in a workspace — one of many. Each has its own **audience**: everyone, role-scoped, or named users. Audience is a **two-layer** model: audience controls *who the dashboard is shown to*; the **data inside always resolves to the viewer's own access**, so a dashboard never widens access. A KPI tile is a count over the rows the viewer could already see — never a privileged aggregate that bypasses row-level access.

**The widget palette.** The dashboard framework defines a fixed set of **eight widget types**, each pointing at a metric from the library (§10.6) over configurable dimensions: **KPI tile** (a single value — a count or an aggregate such as a median), **KPI-with-trend** (a single value with period-over-period delta), **segmented bar** (stacked/segmented counts), **bar breakdown** (categorical bars), **histogram** (distribution across buckets), **line / time-series** (a metric plotted over time — the home for throughput-per-period and median-over-time metrics, §10.6), **heatmap matrix** (a two-dimensional grid), and **records grid** (a saved-view-driven list with export). In **Phase 2** these types are exercised by the three **seeded fixed-layout dashboards** (§10.3, §10.3.1, §10.3.2), each instantiating a subset. The **no-code builder** that lets an admin compose their own dashboards from these eight types is **Release 1 (Phase 2)**; the palette is the full set that builder must eventually support, and the same set the fixed Phase 2 dashboards are built from.

### 10.3 The AI Solutions default dashboard

The seeded default for the AI Solutions workspace (Phase 2, a **fixed layout** — see §10.2) comprises **one KPI tile and five larger widgets**:

- **Escalations per quarter, by Origin** — segmented bar: one bar per quarter, segments by **Origin** (originating workspace); shows the period-over-period trend and answers "which workspaces are sending us work" in a single widget.
- **Unassigned** — KPI tile; count of past-Intake records with no Assigned Analyst.
- **Pipeline by stage** — segmented bar; counts across the six AI-side stages.
- **Closures this quarter** — bar breakdown by Outcome (Live / Declined / Withdrawn / Duplicate).
- **Requests by Dept/PG/Client × stage** — a **heatmap** whose rows are the **Dept/PG/Client** field's configured categories (§17.3) and columns are the six AI-side stages. A record with Dept/PG/Client unset appears in a "— (unset)" row rather than dropping from the counts; a retired category keeps its row while historical records still carry it (forward-only, as with role labels §7.2). Hub-scoped: escalated and AI-direct work only.
- **The records grid** — a saved-view-driven list with export.

This dashboard instantiates five of the eight palette types (§10.2): KPI tile (Unassigned), segmented bar (Escalations by Origin, and Pipeline by stage), bar breakdown (Closures), heatmap matrix (the Dept/PG/Client × stage grid), and records grid — each pointing at a metric from the library, over configurable metrics and dimensions. KPI-with-trend first appears seeded on the Workload dashboard (§10.3.1).

**Widget counts are independent filters and may overlap** — a single record can be counted in more than one widget (or tile, across dashboards) at once; the widgets are decision surfaces, not a partition. On the full dashboard, tiles and chart segments are **clickable to filter the embedded records grid** (drill-through); the locked Dashboard-viewer surface (§10.4) has no drill-through.

### 10.3.1 The AI Solutions Workload dashboard

A **second seeded dashboard** on the AI Solutions workspace, aimed at the AI Solutions manager and analysts managing their own capacity (rather than the delivery-overview audience of §10.3's default dashboard). Some widgets overlap with the default dashboard — this is deliberate; workload-focused users shouldn't have to hunt across two surfaces for the numbers they care about.

- **Open records per analyst** — bar chart, one bar per Assigned Analyst, counting open records; surfaces load imbalance ("Alice has 30, Bob has 6") that the aggregate "Unassigned" tile hides.
- **Unassigned** — KPI tile (same as the default dashboard's tile).
- **Pending sign-off** — KPI tile; count of records with at least one open Approval Request.
- **Median time-to-first-triage** — KPI-with-trend, over a rolling 30- or 90-day window (§10.6); the leading indicator of intake responsiveness.
- **Aging in stage** — histogram of open records bucketed by days-since-last-stage-transition; catches quietly-drifting records (Phase 2, uses the date-difference primitive).
- **The records grid** — saved-view-driven list with export.

All widgets hub-scoped (escalated + AI-direct) and access-respecting per §10.2. This dashboard is the palette's seeded source of the **histogram** (Aging in stage) and the **KPI-with-trend** (Median time-to-first-triage), and applies the **bar breakdown** per-analyst (Open records per analyst); together with §10.3 it exercises seven of the eight types — the **line / time-series** type is available in the builder for the trended metrics of §10.6 but is not itself seeded. Phase 2, alongside the default dashboard.

### 10.3.2 The Feature Catalog dashboard

A **third seeded dashboard** on the AI Solutions workspace, over the **Feature Catalog** object (§2.5) rather than Requests — the browse-and-find surface for the reusable-feature inventory. It is the dashboard exposed **read-only firm-wide** through the Dashboard-viewer surface (§10.4), so PG/Dept teams can search the catalog for future builds without any write access or workspace membership.

- **Published features** — KPI tile; count of Features with Maturity = Published.
- **Features by type** — bar breakdown over the **Feature type** field (UI/visual, functional, integration, workflow, data/reporting).
- **Features by tech / stack** — bar breakdown over **Tech / Stack**, so "what have we built in X" is one glance.
- **The catalog grid** — a saved-view-driven records grid (the browsable list), filtered to Published by default, with export; columns include name, one-liner, type, tags, and owner.

Scoped to Published Features by default (Draft and Deprecated are filtered out of the firm-wide view, §2.5); access-respecting per §10.2. It instantiates **KPI tile**, **bar breakdown**, and **records grid** — all already in the seeded palette, so the "seven of eight types seeded" count (§10.3.1) is unchanged. The richer visual browse — cards with thumbnails — is the **gallery view** (§10.5), not a dashboard widget. Phase 2, alongside the other two dashboards.

### 10.4 The Dashboard viewer surface

A Dashboard viewer binds to **one dashboard**, which is their **entire surface**. It renders read-only, with no records-list navigation, no record detail, and no drill-through. The requests grid inside it is the column-restricted projection built on that dashboard's own workspace fields; every number and row resolves against what that viewer is entitled to see.

### 10.5 Starter dashboards and locality

Dashboards and views are **workspace-local**: each references only fields that live in its own workspace (its local fields plus the platform-defined fields it references), and none reaches into another workspace's data. The template ships **starter dashboards and views** built on the template's starter fields — so a new workspace is not repeating that work from a blank canvas. Cloning stamps those starter dashboards into each new workspace as its **own local objects** (§1.1), which the admin then modifies as they build out their fields. Because the starter dashboards and the fields they read are both workspace-owned local objects, a local field edit and its dashboard fix are the same admin's job, and no central change can silently break a workspace's dashboards.

**The PG/Dept template starter set.** Because the template seeds **no stages** (§1.1), its starters are deliberately **stage-agnostic** — built only on seeded, populated fields (Dept/PG/Client [S], AI Solutions Status [P], the local Outcome, timestamps [P]) so they render meaningfully on day one:

- **Starter saved views (2):** "My requests" (Requestor = current user, sort Updated-at descending) and "Recently updated" (all records, sort Updated-at descending).
- **Starter dashboard (1), a fixed layout:** "Requests by Dept/PG/Client" (bar breakdown), "Escalation status" (KPI tile — count of records where AI Solutions Status is set vs blank), and a records grid.

A "pipeline by stage" widget is **not** seeded (there are no stages to bucket); the admin adds one after defining a local lifecycle. Like the AI-side seeded dashboards, this starter is a fixed layout in Phase 2 (§10.2); once the no-code builder ships (Release 1, Phase 2) the admin can author their own.

Cross-workspace visibility is **never** achieved by a dashboard reading another workspace's fields. A PG/Dept user who needs to see AI Solutions data is granted **Viewer access to an AI Solutions dashboard** (the Dashboard-viewer surface, §10.4), which resolves against that user's own entitlements — the AI Solutions workspace decides what it exposes, and the PG side consumes it read-only rather than importing the data.

**The gallery view.** Alongside Kanban and timeline (§15, Phase 2), the advanced-view set includes a **gallery view** — a card layout that shows each record's first image attachment as a thumbnail with its name, one-liner, and a few tag fields, rather than a row. It is the natural browse surface for the **Feature Catalog** (§2.5), where the visual *is* the point, but it is a general view type any workspace may use on any object. Like every view it is presentation-only and resolves against the viewer's entitlements (§9.4). **Phase 2**, with the other advanced views.

### 10.6 Cycle-time and time-in-stage

Every lifecycle transition is already captured with a timestamp in the audit (§12), so cycle-time and time-in-stage are **derived from data the system already records** — no new capture is added.

- **Aggregate metrics (A).** Average and median **time-in-stage** per stage, **cycle-time** distribution (AI-side elapsed time from record creation to close), **throughput** (closures per period), and **time-to-first-triage** (elapsed time from record creation to first population of Assigned Analyst — the leading indicator of intake responsiveness, surfaced on the Workload dashboard §10.3.1) join the metric library and render through the existing widget palette (§10.3). These are computed from completed transitions and the audit trail, so they need no current-date reference. **Phase 2.**
- **Live per-record indicator (B).** "This record has been in **QA for 12 days**," shown on the record and available as a records-list column. Because it measures time elapsed *to now* in the current stage, it uses the **date-difference** primitive against the current-date reference (§3.1, §3.3). **Phase 2** — it ships with that primitive, alongside SLA Status (§17.2).

**Cycle time definition.** Cycle time is **AI-side elapsed time from record creation to close.** For an escalated record, this begins at the escalation event (which is when the AI-side record is created); pre-escalation PG intake time is **deliberately not counted**, because cycle time measures AI Solutions delivery performance, not PG intake-and-triage duration. Rolling them together would let PG delays make the AI team look slow and hide PG-side bottlenecks worth surfacing on their own. If a separate "PG intake → escalation" metric is ever wanted, the audit trail preserves the PG-side Created-at and it can be added later without changes to the model. Record age in the UI reflects the record's own Created-at on each side of the bridge — no cross-workspace resolution.

### 10.7 The Home surface

The **Home** is a per-user landing surface — the first thing an analyst sees on sign-in — designed to answer the three morning questions in one glance: **what's mine, what needs me, and what changed.** It is not a new engine: it is a **composition of viewer-scoped queries** built on the `current-user` reference (§3.1), the Approval Request queue (§7.2), the event spine (§11.1), and the records the analyst can already see. Like every surface its data resolves to the viewer's own entitlements (§10.2) — the Home never widens access; it is an assembly of things the analyst could already reach, not a privileged aggregate.

The Home is organised into panels, each a viewer-scoped query:

- **Needs your decision** — open Approval Requests where the viewer is a named approver or a member of an approver team (§7.2), with the inline approve/reject surface (§7.3). Highest priority: act-now items.
- **Your work today** — records where the viewer is Assigned Analyst (or Requestor/Watcher, configurable), surfaced by urgency: overdue and due-soon first (SLA Status, §17.2), then in-progress. It spans Requests and their open child Tasks (§2.4) — an analyst's own open tasks live here, so Tasks need no separate surface of their own.
- **Since you were last here** — an activity feed read off the event spine (§11.1), filtered to events on records the viewer follows or owns since their last visit: gate decisions, holds cleared, closures, and **@mentions** (§11.2). This is the catch-up that a returning analyst would otherwise reconstruct by hand.
- **New to triage** — for the intake-facing audience, new escalations and unassigned records (the same population as the "Unassigned" tile, §10.3), so nothing lands unseen.
- **Pinned announcements** — a **slim strip** at the top for pinned, in-audience Announcements (§2.7); everything else arrives through the **bell** (§11.3), not a Home panel.
- **Your toolkit** — quick access to the **Toolkit** (§2.6) — playbooks, plugins, and prompts in one filterable catalog — and the **Feature Catalog** (§2.5). The Feature Catalog is available from Phase 1; the Toolkit panel lights up with the Toolkit build in Release 1 (Phase 2).

Two affordances round it out: a **quick-create** control (new Request, Task, or Announcement from anywhere, reusing the Draft mechanism, §9.7), and **pin-as-home** so a user may set the Home — or any dashboard or saved view — as their default landing surface.

**Phasing.** The Home ships in **Phase 2**: it depends on the `current-user` reference (§3.1) and the dashboard/query framework, and it pairs naturally with SLA Status and the agenda view (below). Its **pinned-announcements strip** rides the Phase 1 Announcement object and bell (§2.7); the **Feature Catalog** panel is live from Phase 1; the **Toolkit** panel lights up in Release 1 (Phase 2). In Phase 1, before the Home exists, an analyst approximates it with personal saved views (filtered to themselves) and the notification bell.

**Agenda view.** A companion **agenda / calendar view** (an advanced view, §10.5, alongside Kanban and timeline) lays out date-bearing records — Due Date, Deploy Date, Benefit-review date — across today and the week, and backs the Home's "today" framing. Phase 2, with the other advanced views.

---

## 11. Notifications and events

### 11.1 The event spine

One **event-emission layer** underlies everything. Every meaningful state change emits a typed event, read by four consumers: the **audit trail**, the **AI Solutions Status field / status mirror**, **notifications**, and the **dashboards**. Nothing emits twice.

### 11.2 Firm-default notification rules

These ship working from day one and are admin-adjustable. Targets are named concretely — a **field** on the record (§17) or a **seeded user group** (§11.3) — rather than by role prose:

| Event | Notifies |
|---|---|
| Sign-off requested | the approver (person, or every member of a team) |
| Gate decided | Requestor + Business Owner + Watchers |
| Assigned to you | the Assigned Analyst |
| Escalation received | the **AI Intake** user group (a seeded group in the AI Solutions workspace, §11.3) |
| Hold set or cleared | Requestor + Assigned Analyst + Watchers |
| Mentioned in a comment | the person mentioned |
| Announcement posted | everyone in the announcement's audience (§2.7), delivered to the bell |
| Closed | Requestor + Business Owner + Watchers (rides the closure event across the bridge) |

**After escalation, notifications resolve per side.** An event fans against each record's own field values: an AI-side event notifies the AI record's Requestor, Business Owner, watchers, and Assigned Analyst per the table above; where an event crosses the bridge — **hold changes, gate decisions, and closure** — it also fans against the PG record's fields: its Requestor (locked at escalation, so always the original submitter) and its **current** watcher list. A person named on both sides receives one notification, not two. Stage moves notify no one on either side; they surface silently through AI Solutions Status (§6.4). A PG record's own local events (its local Hold, its own closure) fan against the PG record's fields as always. Watchers hear exactly what the Requestor hears — hold changes, gate decisions, closure — minus sign-off requests, which remain approver-only.

**Watchers** is deliberately **not** a crossing field — it is a **live per-record subscription** (§17.3), never frozen at escalation. Subscribers followed at PG intake keep receiving the bridged events against the PG record's current watcher list, and PG users can still subscribe or unsubscribe after escalation, which a locked crossing field would forbid. The **Requestor** guarantee works the other way around: because the PG-side Requestor field locks at escalation, bridged notifications resolved against it always reach the original submitter **by construction** — regardless of any later edit to the AI-side Requestor copy (mapped fields stay AI-editable, §6.2, and an edited AI-side Requestor simply redirects the AI-side fan-out, not the PG-side one).

**Watchers** are users who have opted in (self-subscribed via a button on the record) or been added by an admin to follow a record they don't own. They receive the same notifications the Requestor gets — hold changes, gate decisions, closure — but not sign-off requests (those are approver-only). Watchers can unsubscribe at any time from the same button — **before or after escalation** — or be removed by an admin.

### 11.3 Channels and groups

The in-app notification centre (the bell) is the day-one channel. It carries both per-record notifications (§11.2) and **broadcast Announcements** (§2.7), which fan to their audience as an "Announcement posted" event — so the bell is where team news lands, with no separate announcements surface to visit. **User groups** serve as notification-routing targets and as team approver slots. The AI Solutions workspace seeds one such group, **AI Intake**, which backs the "Escalation received" notification (§11.2); membership is workspace-admin-managed like any group, so changing who is alerted on escalation is a membership edit, not a config change. No per-record field is involved — escalation routing is a standing workspace property, not a value on the Request.

---

## 12. Audit

The audit trail is **append-only and immutable**, captured **from day one** off the event spine, and **never deleted** — it is the floor under "no hard delete." It records field changes (old → new, who, when), lifecycle transitions, gate decisions (with the actual signer plus the slot's captured context — the role label on a named-individual slot, or the team on a team slot), the flagged proxy sign-off, configuration changes (including Platform-admin edits to platform-defined fields, §4.3), and escalation events.

It surfaces two ways:

- The **activity thread** on a record — the user-facing slice, comments and system events interleaved, visible to anyone who can see the record.
- The **audit log** — admin-scoped: a Platform admin reads it firm-wide, a workspace admin reads their own workspace. Members and viewers get the thread, not the log.

---

## 13. Import, export, and the API

- **CSV import is create-only.** It mints new **unlinked** records — each taking the **importing workspace's prefix**, with the canonical ID assigned from that workspace's live sequence at load time (the CSV carries no target IDs), and no bridge — with a per-row validation report; valid rows land and invalid rows come back flagged. A row's identifier from the source system maps into the **Legacy ID** field (§3.6), never the canonical ID. **Requestor (§17.3) resolves per row:** if the import maps a Requestor column and the value resolves to a current SSO user, that user is set; if the column is absent or a value doesn't resolve, Requestor **falls back to the importing admin (Created by) and the row is flagged in the validation report as a warning** — the row still lands (migration is not blocked), but the fallback is surfaced rather than silent, so the admin can re-map before or after load. Import cannot update live records — that would be an unaudited mass-edit.
- **Import is a bulk create, not a live event stream.** Imported records mint and validate, but the create does **not** retroactively fire per-record notifications (§11.2) — a migrated record, often closed, must not blast its Requestor or Watchers as though it just arrived. The records land silently and are worked from the list; live notification behaviour resumes for actions taken *after* import. (This is why the Requestor fallback in the bullet above is a report flag, not an inbox event.)
- **Export current view** is CSV of the active saved view, access-respecting: columns follow the view's column set and rows follow the viewer's entitlements (you export only what you can see). Changing the view changes the export; there is no separate report engine.
- A **REST API** and **webhooks** ride the same event spine, so integrations obey the same permissions and receive the same events as everything else. (Release 2 — Phase 3.)

---

## 14. The AI-assist layer

Every AI feature is assistive, never required, and obeys four guardrails:

- **Human-in-the-loop** — it proposes; a person confirms before anything is written.
- **Permission-respecting** — it only sees and acts on what the user can see.
- **Transparent** — its output is labelled until a human accepts it.
- **Off the critical path** — the workflow runs fully with AI switched off.

**Candidate capabilities:** duplicate and similar-record detection, link suggestions (`related` / `re-pursuit-of`), comment-thread summarisation, drafting assistance (a first-pass description or suggested field values), triage/classification hints, and **reuse detection** — matching a new Request at intake against the **Feature Catalog** (§2.5) to surface "we already built something like this," so a requestor or analyst can reuse a shipped feature instead of rebuilding. Reuse detection is the same object-agnostic similar-record mechanism as the duplicate check, aimed at the Feature Catalog rather than Requests; on accept it proposes a `related` link from the Request to the matched feature. Auto-suggesting a feature's type and tags at catalog time is a further drafting-assist application.

**Worked example — the duplicate check.** An admin enables it for a workspace and sets the trigger (at intake, on-demand, or a periodic sweep), the scope it compares against (this workspace or the hub), a sensitivity threshold, and which content fields it reads. At runtime it is triggered, scans only records the user can see, proposes ranked matches each with a short rationale (labelled AI), and the user confirms or dismisses. On confirm, the new record closes as **Duplicate** with a `duplicate-of` link carrying the rationale, and the requestor is notified, pointed at the surviving record. Every AI feature follows this pattern — propose, confirm, write through an existing mechanism.

*Scope note: because the check is permission-respecting, a PG/Dept user running a hub-scoped comparison sees only hub records they are entitled to see; where they have no hub access the hub scope yields nothing and the workspace scope is the effective one. This is expected behaviour, not a defect.*

---

## 15. Release phasing

The build ships in two releases. **Release 1 (the MVP) comprises Phase 1 and Phase 2.**

### Release 1 — MVP (the working loop plus workspace usability)

**Phase 1 — the working loop:** the two seed workspaces and the bridge (workspaces stood up by cloning the template as a config action, §1.1); objects, fields, and typed links; the condition engine and Display Status; the three-level access model plus the Platform admin grant, with SSO; escalation over the **seeded 1:1 [S] crossing map (read-only in Phase 1, §6.2)**, the mirror (the AI Solutions Status field), Copy, and re-pursuit; the lifecycle and gates with in-app sign-off; the records list, detail, immutable thread, saved views, search, and drafts; the **similar-requests nudge at intake** (§9.8); the **Task → Request promotion** affordance (§5); the **Feature Catalog** (§2.5, §18) as a searchable, attachment-rich list with the **Add to catalog** affordance (§5); the **Announcement object** (§2.7, §20), so the platform has team news from day one; the **Watchers** field (§17.3, §11.2); the **Due Date** field (AI-side); **CSV import (create-only, with a per-row validation report) and export-current-view**; in-app notifications; and audit capture with the activity thread. *(No dashboard and no request templates in Phase 1 — the records list with saved views and export is the reporting surface until Phase 2, and Copy covers the prefill need until templates arrive in Release 1 (Phase 2). The Feature Catalog is usable as a searchable list from Phase 1; its gallery view and dashboard arrive in Phase 2.)*

**Phase 2 — workspace usability:** the **three seeded fixed-layout dashboards** — the AI Solutions default dashboard (§10.3), the AI Solutions Workload dashboard (§10.3.1), and the **Feature Catalog dashboard** (§10.3.2) — built from the eight-type widget palette (§10.2), together with the **PG/Dept template's starter dashboard and views** (§10.5); the **admin-editable crossing map** (the propose/confirm workflow, §6.2); the **current-date / date-difference** engine primitive — **sequence this first**, since SLA Status, the live time-in-stage indicator, the Aging-in-stage histogram, and any "Overdue" rule all depend on it — with **SLA Status** (passive On track / Due soon / Overdue, §17.2) and **cycle-time, time-in-stage, and time-to-first-triage metrics** (aggregate dashboards and the live per-record indicator, §10.6); the **`current-user` reference** (§3.1) and the **Home surface** (§10.7) — the per-user landing that assembles needs-your-decision, your-work-today, since-you-were-last-here, new-to-triage, and announcements, with quick-create and pin-as-home; advanced views (**Kanban, timeline, the gallery view** used by the Feature Catalog, and the **agenda / calendar view** backing the Home's "today", §10.5, §10.7); self-serve workspace provisioning; rich audit search and export; **and the three self-serve authoring features pulled forward from the original Release 2 scope — the no-code dashboard builder (§10.2), the full request-template feature (§9.7), and the Toolkit object build (§2.6, §19)**. *(The seeded dashboards remain the Phase 2 starting point; the no-code builder that lets admins author their own now also ships in Release 1. The Home's Toolkit panel lights up with the Toolkit build in Release 1.)*

### Release 2 — next iteration

**Phase 3 — reach:** email delivery, per-user notification preferences, and digests; **time-based triggers (proactive overdue / SLA-breach alerts, and the Benefit-review-date prompt driving the post-launch value loop §17.11)**; and the REST API with webhooks. *(The Toolkit build §2.6/§19, the no-code dashboard builder §10.2, and the full request-template feature §9.7 were pulled forward into Release 1, Phase 2 — see above.)* (CSV import and export-current-view ship in Phase 1 — see §13.)

**Phase 4 — AI and connectors:** the AI-assist layer (duplicate detection, link suggestions, drafting, summarisation, and **feature-catalog reuse detection at intake**, §14) and the document-management (DMS / SharePoint) connector. The connector cannot be scheduled until the specific system is chosen.

Nothing in Release 1 forecloses Release 2 — every later capability bolts onto surfaces Release 1 already builds.

---

## 16. Deployment settings and defaults

**Settled at deployment (no build impact):**

- Team headcount and sizing
- Go-live dates
- The document-management system choice (needed before Release 2)

**Shipped with a default, admin-adjustable:**

- **Browsers** — modern evergreen browsers with a responsive web layout; no native mobile app
- **Uploads** — 25 MB per file, common file types
- **Fiscal year** — calendar year (starting 1 January), calendar quarters, for the "this quarter" metrics
- **SLA thresholds** — the **"due soon" window** that drives SLA Status (§17.2) is an **AI Solutions workspace** setting (Due Date and SLA Status both live AI-side), set at deployment and admin-adjustable. The Due Date field and the passive SLA Status flag are a **build** item (§15, Phase 1/2), and proactive breach alerts are Phase 3. *(There are no per-tier target durations; Solution Tier is a classification only, §17.7.)*
- **Benefit-review window** — the default offset from Deploy Date used to compute Benefit-review date (§17.11); seed value **90 days**, admin-adjustable. The Benefit-review prompt itself rides Phase 3 time-based triggers.
- **Intake** — in-app request creation and CSV import are both MVP paths: in-app for ongoing intake, CSV (create-only) for migrating existing data. Any external intake form arrives in Release 2.

---

## 17. Seed field schema

This appendix is the canonical seed schema for the **Request** record. Every field draws from the field-type catalog (§2.3). It is the reference §3 points to; individual mechanisms (Client/Matter validity, Display Status, Legacy ID) are defined in §3 and restated here only as they bear on the schema.

**Which workspace this describes.** This schema is the **AI Solutions workspace** Request schema — the superset. The **PG/Dept template** ships the same schema **minus all [A] fields**; the [S], [P], and ● fields are present in both, and every [S] field's same-named AI-side target is seeded here so the 1:1 crossing map (§6.2) resolves on day one. The PG template additionally carries its **starter local Outcome** field (§1.1), which is a template starter local field and does **not** appear in this AI-side list (the AI side has its own delivery Outcome, §17.9).

**Legend.**
- **[S]** = **crossing content field** — a user-editable content field in the seed **crossing set**: on escalation it maps **1:1 to a same-named field on the AI Solutions side**, snapshots, and locks read-only on the PG side (crossing map governed per §6.2, confirmed only by an AI Solutions workspace admin or a Platform admin).
- **[A]** = **AI-side only** — local to the AI Solutions workspace, no PG/Dept counterpart, never crosses.
- **[P]** = **platform-defined** — defined once at the platform level, referenced (read-only band) in every workspace, governed by a Platform admin (§4.3).
- **●** = **workspace-local baseline** — seeded into every workspace as its own local object (editable, *or* derived/read-only such as Display Status and Priority Score); the workspace owns it and may retune or extend it (§1.1).

**Tagging rules (so no future row is mis-tagged):** [S] applies **only** to user-editable content fields that snapshot into a same-named AI-side field on escalation. **A system-set field is never [S]** even when single-select and user-visible — if the system writes it and it holds a per-side-honest value (like **Workspace** and the timestamps, §17.1), it does not cross as a content pair. **System fields are never [S]:** per §6.2 the **ID** crosses as reference (adopted), while **timestamps** are per-side and do not cross. **Derived fields never cross per §3/§6.2 and are never [S]** — their operands may cross and the value recomputes on each side.

### 17.1 System and identity — [P]

| Field | Type | Notes |
|---|---|---|
| Record ID | System, immutable | the `PREFIX-NNNNNNNN` (§6.7); the prefix is drawn from the platform **prefix registry** (registered at workspace provisioning, §6.7) — the same registry Origin reads to name the originating workspace; crosses **as reference** (adopted on escalation), not via the map |
| Workspace | System | the record's current home workspace; holds a different value on each side by design — never a crossing pair |
| Origin | System-computed (platform lookup) | the **originating** workspace's name, resolved by looking the record's ID prefix up in the platform **prefix registry** (§6.7) — not a Calculation (§3.3, numeric-only) or Derived-category field (§3.4, condition-engine rules); it is a platform-level lookup against stored registry data, sibling to Record ID (which *writes* the prefix; Origin *reads* the workspace name back). Materialized as a field (rather than resolved at render time from the prefix) so it is a first-class **filter, group-by, and export** dimension on every surface — the hub dashboard groups on it (§10.1), and records-list filters and saved views (§9.1, §9.4) bind to it — without teaching each surface to parse ID substrings. Never crosses — the prefix, hence the origin, is fixed at mint and identical on both sides of an escalated pair |
| Created by / Created at | System (user ref / date-time), immutable | reflect the record's **own** creation event — for an escalated AI-side record, that is the **escalation** event, not the PG intake time (§10.6). The PG intake timestamp survives on the PG record and is reachable via the shared ID |
| Updated by / Updated at | System (user ref / date-time), immutable | |
| Legacy ID | Short text, **[P]**, editable | import-only, blank on in-app/API creation (§3.6); searchable; not unique-constrained; not a crossing field |

### 17.2 Lifecycle and status

| Field | Type | Tag | Notes |
|---|---|---|---|
| Stage | Single-select | ● | the workspace's own lifecycle stages; **seeded with the six-stage standard (§7.1) in the AI Solutions workspace only** — the PG/Dept template seeds **no stages**, so PG Stage is empty until its admin defines a lifecycle (§1.1); PG-controlled, stays live after escalation, **never crosses** |
| Hold/Blocked | Boolean (+ optional reason, short text) | ● | orthogonal to stage (§7.4); PG-controlled, never crosses |
| Display Status | Derived-category (§3.4) | ● | AI-side seed: from delivery Outcome / Hold / Stage. PG seed: from the **template-local Outcome** (§1.1) / Hold / Stage. Derived, never crosses |
| Mirror Status | Derived-category (§3.4) | [A] | feeds the status mirror; collapses Post-launch → **Deployed** (§3.4, §6.4) |
| AI Solutions Status | Platform-defined, read-only | [P] | the cross-workspace status mirror made concrete (§6.4); **no manual write path**; blank until escalation; written by the bridge off the event spine; driven by the AI side's Mirror Status |
| SLA Status | Derived-category (§3.4) | [A] | On track / Due soon / Overdue, from Due Date (§17.7) vs the current-date reference (§3.1); the "due soon" window is admin-configured (AI-side, §16); not applied once the record is closed; **Phase 2** |

The AI Solutions delivery lifecycle is governed by the **AI-side** Stage/Hold/Outcome. On a PG/Dept record, AI-side status is surfaced solely through the read-only **AI Solutions Status** field (§6.4). A PG/Dept workspace's own local Stage/Hold lifecycle is separate, PG-controlled, and stays live after escalation (§6.5).

### 17.3 Intake

| Field | Type | Tag | Notes |
|---|---|---|---|
| Name | Short text | [S] | |
| Description | Long text | [S] | |
| Workflow Details | Long text | [S] | |
| Requestor | User reference | [S] | who submitted the intake and receives request notifications (§11.2); required at intake; **defaults to Created by**, editable at intake (so an assistant can file for someone else); locks at escalation like other [S] fields — the PG-side lock is what guarantees bridged notifications reach the original submitter (§11.2). **On CSV import**, Requestor is taken from a mapped column when present and resolvable, else falls back to the importing admin with a validation-report flag (§13) — never silently |
| Business Owner | User reference | [S] | the accountable business stakeholder for the solution; may be the same as Requestor or different; **is notified when gates are decided** (§11.2, "Gate decided") and owns adoption post-launch; always an internal employee. Being Business Owner does **not** by itself confer approver status — sign-off *requests* go only to a gate's named approver slots (§7.2); a Business Owner receives approve/reject requests only if a specific gate names them as a slot |
| Dept/PG/Client | Single-select | [S] | requestor category (choices are workspace-configured; the choice **Client** makes Client number required); the axis of the §10.3 heatmap |
| Client number | Short text, 6-digit fixed-width | [S] | required when Dept/PG/Client = **Client** (§3.5) |
| Matter number | Short text, 4-digit fixed-width | [S] | requires Client number (§3.5) |
| Timing | Single-select | [S] | the requestor's **urgency signal**, captured at intake; **not** an SLA input — it is context the AI team reads |
| Watchers | User reference (multi) | ● | a **live per-record subscription**, not a crossing content field: users who follow a record they don't own and get the same notifications the Requestor gets (§11.2), minus sign-off requests. Self-subscribe via a record-level button, or added/removed by an admin, **at any point in the lifecycle, including after escalation**. Like Attachments (§2.3) it is **not governed by the crossing map** — never snapshotted, never locked. After escalation, PG-side watchers keep receiving the **AI-side events that cross the bridge — hold changes, gate decisions, and closure (§11.2)** — the same set the Requestor receives, notified against the PG record's **current** watcher list; stage moves notify no one and surface silently through AI Solutions Status (§6.4) |

*Note: PG/Dept requestors express urgency via **Timing** (above) — a context signal, not a commitment. The AI team's committed delivery date, if any, is the AI-side **Due Date** (§17.7); it is never set by the PG side and is not published back through the bridge.*

### 17.4 Value mapping

| Field | Type | Tag | Notes |
|---|---|---|---|
| Success in one sentence | Short text | [S] | |
| How often / cost of doing nothing | Long text | [S] | |
| What's been tried | Long text | [S] | |
| Goals / Expected Impact | Long text | [S] | |
| Business Value | Number, validated 1–5 | [S] | feeds Priority Score |
| Efficiency Gain | Number, validated 1–5 | [S] | feeds Priority Score |
| Level of Effort | Number, validated 1–5 | [S] | feeds Priority Score |
| Priority Score | Calculation (derived, §3.3) | ● | `Business Value + Efficiency Gain − Level of Effort`; read-only, used for backlog ordering; **derived, so it is never [S] and never crosses the map** (§17 tagging rules) — its three operands cross ([S]) and it recomputes to the same value on the AI side |

### 17.5 Solution details — [S]

| Field | Type | Notes |
|---|---|---|
| Expected User Count | Number | |
| Data Classification | Single-select | |
| Compliance Flags | Multi-select | |
| Solution Format | Single-select | |
| Existing Solution | Boolean | |
| Existing Solution — detail | Long text | shown only when Existing Solution = true (condition engine show/hide, §3.1) |
| Things This Must NOT Do | Long text | |

### 17.6 Supporting material

Attachments are handled by the **Attachments object** (§2.1), never a scalar field. They follow the record and carry across the bridge on escalation (§6.3).

### 17.7 Triage and classification — [A]

| Field | Type | Notes |
|---|---|---|
| Assigned Analyst | User reference | drives the "assigned to you" notification (§11.2); its absence on a past-Intake record feeds the "Unassigned" KPI tile (§10.3) |
| Due Date | Date | set during triage/planning; the **sole SLA input** (§16) — drives SLA Status (§17.2) internally; never crosses, not surfaced to the PG side; the field ships Phase 1, SLA Status derivation Phase 2 |
| Solution Tier | Single-select | **classification only** — captures build complexity; does **not** drive Due Date, SLA Status, or any timing |
| Solution Pattern | Multi-select | |
| Build vs Buy Decision | Single-select | |
| Triage Notes | Long text | |

### 17.8 Build — [A]

| Field | Type | Notes |
|---|---|---|
| Project Folder / Repo URL | URL | |
| Build Start Date | Date | |
| Tech / Stack | Multi-select | |
| Build Notes | Long text | |

### 17.9 Deploy and outcome — [A]

| Field | Type | Notes |
|---|---|---|
| Deploy Date | Date | |
| Solution URL | URL | |
| Outcome | Single-select | the **AI Solutions delivery** outcome — the §8 enum: Shipped—live (renders as Live) / Declined / Withdrawn / Duplicate. Distinct from the PG/Dept template's **starter local Outcome** (§1.1), which closes PG-local requests and is not this field |
| Outcome Notes | Long text | the specific reason (§8) |

### 17.10 Per-stage visibility and validation

The AI-side groups are natural candidates for **per-stage visibility** (§3.2): Triage from Discovery, Build on Build, Deploy on Deploy — each field appears where it is worked and is enforced only on the stages where it shows (§3.2). Seeded validation rules:

- **Requestor** required at intake (defaults to Created by).
- **Client number** required when Dept/PG/Client = **Client** (conditional-required keyed on the field, §3.2).
- **Matter number** requires Client number; valid states are both blank, client only, or both populated (§3.5).
- **Existing Solution — detail** shown only when **Existing Solution** = true (§3.1).
- **Business Value / Efficiency Gain / Level of Effort** constrained to integers 1–5.
- **Priority Score** = Business Value + Efficiency Gain − Level of Effort. *The Calculation field type (§3.3) supports weighted formulas by construction — an admin can retune this to e.g. `(2 × Business Value) + Efficiency Gain − Level of Effort` without any new mechanism. The seed ships equal-weighted; retune after real backlog use.*
- **Similar-requests nudge at intake** (§9.8): as the requestor types Name and Description, the form surfaces up to three existing requests whose titles and descriptions match on keyword. Same access-respecting search as §9.5. The user can dismiss, open, link as `related` (queued on the draft, stamped at submission — §9.8), or **discard the draft** (a plain pre-record discard, no Outcome and no link, leaving no trace).

### 17.11 Post-launch value — [A]

| Field | Type | Notes |
|---|---|---|
| Benefit-review date | Date | defaults to **Deploy Date + N days** (N is admin-configured in §16, seed 90 days); a scheduled trigger fires on this date and notifies Business Owner + Watchers to fill in Benefit realized (Phase 3, rides time-based triggers) |
| Benefit realized | Long text | qualitative and/or quantitative description of the value the shipped solution has produced; hub-reportable |

*Post-launch value fields are seeded in §17.11 (Benefit-review date, Benefit realized). The **fields ship with the seed schema in Phase 1**; the **scheduled prompt** that fires on the Benefit-review date is **Phase 3** (it rides the time-based-trigger engine, §15). Additional post-launch metrics (30-day usage counts, adoption rates) can be added later without rework.*

---

## 18. Feature Catalog object seed schema

This appendix is the canonical seed schema for the **Feature Catalog** record (§2.5) — the reusable-feature inventory. Every field draws from the field-type catalog (§2.3). The Feature Catalog and this schema are instantiated in the **AI Solutions workspace only** (the reporting hub); it is not part of the PG/Dept template, and practice groups consume it read-only through the shared Feature Catalog dashboard (§10.3.2, §10.4).

Unlike the Request schema, no field here is a crossing field: **a feature never escalates and never crosses the bridge** (§2.5), so the [S]/[A]/[P] crossing tags of §17 do not apply. The fields are simply the object's own local fields plus the platform-defined system fields every record carries (§17.1).

### 18.1 System and identity

| Field | Type | Notes |
|---|---|---|
| Record ID | System, immutable | `PREFIX-NNNNNNNN` minted from the **AI Solutions workspace's** own prefix and sequence (§6.7); the object type, not the prefix, distinguishes a feature from a Request |
| Origin / Workspace | System | resolve to the AI Solutions workspace, as for any AI-side record (§17.1) |
| Created by / Created at, Updated by / Updated at | System, immutable | the record's own creation and last-edit events |

### 18.2 Identity and summary

| Field | Type | Notes |
|---|---|---|
| Name | Short text | the feature's name |
| One-liner | Short text | a scannable one-sentence summary; a primary search target and the gallery-card subtitle (§10.5) |
| What it does | Rich text | the functional description — what the feature is and how it behaves |

### 18.3 Classification and search

| Field | Type | Notes |
|---|---|---|
| Feature type | Single-select | UI/visual · functional · integration · workflow · data/reporting; the axis of the §10.3.2 "Features by type" widget |
| Capability tags | Multi-select (allow-new-values on) | free-growing faceted tags; the main filter vocabulary for saved views and the catalog grid |
| Solution Pattern | Multi-select | **reuses the Request's Solution Pattern vocabulary** (§17.7) so a feature and the requests that use its pattern cross-reference |
| Tech / Stack | Multi-select | **reuses the Request's Tech / Stack vocabulary** (§17.8); the axis of the §10.3.2 "Features by tech/stack" widget — "what have we built in X" in one glance |

### 18.4 Reuse and provenance

| Field | Type | Notes |
|---|---|---|
| How to reuse | Long text | practical guidance for lifting the feature into a new build — dependencies, gotchas, configuration |
| Demo URL | URL | link to the live feature |
| Repo / Component URL | URL | link to the code or component |
| Owner | User reference | the maintainer / who to ask; always an internal employee |
| Sourced-from | Record reference (typed link) | the `sourced-from` link(s) to the source Request(s) the feature was harvested from (§2.2); **optional** — a feature may stand alone (§2.5) |

### 18.5 Governance and status

| Field | Type | Notes |
|---|---|---|
| Maturity | Single-select | **Draft → Published → Deprecated** (§2.5); publishing is an ordinary member edit with **no approval gate**, captured in the audit; the Feature Catalog dashboard (§10.3.2) shows Published only by default |
| Data Classification | Single-select | **reuses §17.5**; flags a feature that touches sensitive data so reuse is a considered decision |
| Compliance Flags | Multi-select | **reuses §17.5**; compliance considerations that ride along on reuse |

### 18.6 Visuals

Screenshots, mockups, and short clips are handled by the **Attachments object** (§2.1), never a scalar field — they follow the record, are searchable by filename (§9.5, no OCR), and render as the record's gallery-card thumbnail (§10.5) and in the record detail.

### 18.7 Seeded validation and views

- **Name** and **Feature type** required at creation.
- **Maturity** defaults to **Draft**; a feature is excluded from the firm-wide catalog view until set to **Published** (§2.5).
- A **starter saved view** — "Published catalog" (Maturity = Published, sort Updated-at descending) — backs the §10.3.2 catalog grid and the gallery view (§10.5).
- The similar-record mechanisms (§9.8 nudge, §14 AI check) may run over features to flag likely duplicates at catalog time; a confirmed duplicate is recorded with a `duplicate-of` link (§2.2), exactly as for Requests.

---

## 19. Toolkit object seed schema (Release 1, Phase 2)

This appendix is the seed schema for the **Toolkit** record (§2.6) — the single catalog of playbooks, plugins, and prompts. The object is **built in Release 1 (Phase 2, §15)**, pulled forward from the original Release 2 scope. It is one lean, shared field set — the **Type** field is the only per-kind distinction. The Toolkit object is **portable** (§2.1): this schema is seeded in the AI Solutions workspace first and is the same set instantiated in a PG/Dept workspace if one is stood up later. No field crosses the bridge — a Toolkit entry never escalates — so the [S]/[A]/[P] crossing tags of §17 do not apply; the fields are the object's own local fields plus the platform system fields every record carries (§17.1).

| Field | Type | Notes |
|---|---|---|
| Record ID, Created by / Created at, Updated by / Updated at, Origin / Workspace | System | the platform system fields (§17.1); minted from the home workspace's own prefix (§6.7); the object type distinguishes a Toolkit entry |
| Name | Short text | the entry's name |
| One-liner | Short text | a scannable one-sentence summary; a primary search target and gallery/list subtitle (§10.5) |
| Type | Single-select | **playbook / plugin / prompt** (extensible) — the only field that distinguishes one kind from another, and the axis the Toolkit page filters on (§10.7) |
| Body | Rich text | the content — the playbook's instructions, the prompt's text, or the plugin's integration notes, as the Type calls for; prompt-type entries get a one-click **copy** affordance |
| Capability tags | Multi-select (allow-new-values on) | free-growing faceted tags; the main filter vocabulary |
| Tech / Stack | Multi-select | reuses the Request and Feature Catalog vocabulary (§17.8, §18.3) so entries, features, and requests cross-reference on stack |
| Owner | User reference | the maintainer / who to ask; always an internal employee |
| Reference URLs | URL (repeatable) | repo, demo, or docs links |
| Maturity | Single-select | **Draft → Published → Deprecated** (§2.6); publishing is an ordinary member edit with **no approval gate**, captured in the audit; the Toolkit page shows Published by default |
| Related records | Record reference (typed link) | `related` links (§2.2) to the features and Requests an entry relates to; reference-only, never a bridge |
| Attachments | Attachments object | diagrams, example files, screenshots (§2.1), searchable by filename (§9.5) |

Seeded validation: **Name** and **Type** required; **Maturity** defaults to **Draft**; a **"Published toolkit"** starter view (Maturity = Published) backs the Toolkit page and gallery view (§10.5). A materially new version of an entry is a **new record** with a `related` or `re-pursuit-of` link to its predecessor (§6.7), keeping the append-only history clean rather than mutating a shared record. Type-specific fields (a prompt's variables and model, a plugin's endpoint and auth) are out of scope for the initial build and can be added later as optional fields shown by Type via the condition engine (§3.1).

---

## 20. Announcement object seed schema

This appendix is the seed schema for the **Announcement** record (§2.7) — team notices delivered to the **bell** (§11.3), with pinned ones also shown in a slim strip on the Home (§10.7). Built in **Release 1**. The Announcement object is portable (§2.1); this schema is seeded in the AI Solutions workspace first. No field crosses the bridge.

| Field | Type | Notes |
|---|---|---|
| Record ID, Created by / Created at, Updated by / Updated at, Workspace | System | the platform system fields (§17.1); Created by is the author |
| Title | Short text | the notice headline |
| Body | Rich text | the announcement content; links and light formatting allowed |
| Audience | Single-select + reference | **everyone / role-scoped / named users** — the two-layer audience model of dashboards (§10.2); who the "Announcement posted" event (§11.2) fans to, resolving to the viewer so an announcement never widens access |
| Pinned | Boolean | a pinned announcement shows in the slim strip at the top of the Home (§10.7) until unpinned or expired; unpinned ones live only in the bell and the browsable list |
| Expires on | Date | optional; on this date the announcement auto-retires — stops surfacing on the Home and in the bell; never hard-deleted (§4.3) |
| Status | Single-select | **Draft → Published → Retired**; Published fans the notice to the bell and makes it visible, Retired (or expired) when done |

Seeded validation: **Title** and **Body** required; **Status** defaults to Draft; a Published announcement with a past **Expires on** is treated as Retired. The object carries the standard record surfaces (list, detail, search) for browsing history.

---

## 21. Navigation and information architecture

The navigation is a **thin presentation layer** over the surfaces defined elsewhere in this document; it is assembled per viewer from their **current workspace** and **access level**. Showing or hiding a tab is a **convenience, never a security control** — every surface independently enforces the viewer's entitlements (§4.2, §10.2), so a visible tab still resolves to only what the viewer may see, and a hidden one changes nothing about the underlying access.

### 21.1 The tab groups

The left rail groups entry points into three sections (a fourth for platform admins):

- **Workspace** — the day-to-day working surfaces: **Home** (§10.7), **Requests** (§9.1), **Dashboards** (§10).
- **Reference** — the read-and-reuse catalogs: **Feature Catalog** (§2.5) and **Toolkit** (§2.6).
- **Admin** — local configuration (workspace admins): **Users & access**, **Fields & objects** (§3.2, §9.2), **Lifecycle & gates** (§7.1), **Views & dashboards** (§9.4, §10.2), **Manage announcements** (§2.7), **Import & export** (§13), and the **Audit log** (§12, own-workspace scope).
- **Platform** — firm-wide configuration, visible **only to platform admins** (§4.3): the **platform field schema**, the **crossing map** (§6.2), **access provisioning**, the **role-label catalog** (§7.2), **workspace provisioning** (§1.1), and the **cross-workspace audit** (§12, firm-wide scope).

**Tasks have no tab.** A Task is a child of a Request (§2.4); a viewer's own open tasks surface in the Home's "your work today" panel (§10.7), so tasks need no separate entry point.

### 21.2 The top bar (not tabs)

Four elements sit outside the rail so it stays uncluttered:

- **Workspace switcher** — the single instance hosts many workspaces (§1); switching redraws the rail (§21.4).
- **Global search** (§9.5) — access-respecting; you find only what you can see.
- **+ New** (quick-create) — a new Request, Task, or Announcement from anywhere, reusing the Draft mechanism (§9.7).
- **The bell** — the notification centre (§11.3): per-record notifications (§11.2) and broadcast **Announcements** (§2.7). There is deliberately **no announcements tab** — team news lives in the bell, with pinned notices also shown in a slim strip on the Home (§10.7).

### 21.3 What each access level sees

The same rail, filtered by entitlement (§4.2):

| Level | Sees |
|---|---|
| **Viewer** | Workspace + Reference, **read-only**; no Admin, no + New |
| **Member** | Workspace + Reference, with create / edit / close; no Admin |
| **Workspace admin** | the above **plus the Admin group** (local config) |
| **Platform admin** | the above **plus the Platform section** (firm-wide) |
| **Dashboard-viewer** | **no rail at all** — the entire surface is one bound dashboard (§10.4) |

### 21.4 The rail changes by workspace

Navigation is **per-workspace, not global** (object instantiation is a per-workspace choice, §2.1):

- **AI Solutions workspace** (the hub) — the full rail, including the Reference group (Feature Catalog + Toolkit).
- **PG/Dept workspace** — a leaner rail: **Workspace + Admin**, with a **Reference** group appearing only if and when that workspace instantiates its own **Toolkit**. The **Feature Catalog is hub-only** and never appears here; a PG consumes hub reference data **read-only** through a shared dashboard (§10.4), not a tab of its own.

### 21.5 The rail grows by phase

The tabs light up as the build progresses (§15), so the rail is designed to show fewer items gracefully early on:

- **Phase 1** — **Requests**, **Feature Catalog**, global search, **+ New**, the **bell**, and the **Admin** group (Users & access, Fields & objects, Lifecycle & gates, Import & export, Manage announcements, Audit log). There is **no Home or Dashboards tab yet** — an analyst approximates the Home with personal saved views (§10.7).
- **Phase 2** — **Home** and **Dashboards** appear; **Toolkit** appears in Reference; **Templates** (§9.7) and the **no-code dashboard builder** (§10.2) appear under Admin → Views & dashboards; **self-serve workspace provisioning** (§1.1) appears under Platform.
- **Release 2** — no additional primary nav items (email/digests, time-based triggers, the REST API + webhooks, the AI-assist layer, and the DMS connector are capabilities, not rail destinations).

---

## 22. List views, saved views, filters, and sort

This section specifies the presentation and interaction design of the **list surface** — the grid people live in day-to-day (the Requests list, §9.1; the same chrome serves the Feature Catalog and Toolkit lists and the Tasks-in-Home panel, §10.7). It builds on the saved-view concept (§9.4) and the condition engine (§3). Nothing here changes access: every list, column, filter, and sort **resolves to the viewer's entitlements at read time** (§10.2), so the same shared view shows different rows and columns to differently-entitled people, and no list affordance can ever surface a row or field the viewer could not already reach.

### 22.1 The list — columns, rows, and chrome

- **Columns are fields.** A column is any field from the record's schema (§17); the active saved view (§22.3) chooses the set and order. Derived fields are selectable columns like any other — notably **Display Status** (the derived Status column, §3.4) and **Origin** (the record's workspace name, §17.1). Each column is **sortable** (§22.2) and **resizable** (drag the column edge).
- **The list scrolls inside itself, not the page.** The rows are their **own scroll region**, owned by the table shell — the **only** scrollbar the list produces belongs to the row area. Everything around it stays put as you scroll through records: the app chrome (the sidebar and top bar, §21), the page header, the view bar, the **column header row**, and the **pagination footer**. The page itself must **not** scroll the whole surface out from under these — the column headers you sort and filter by, and the pagination and record count, have to remain in reach at all times. **Horizontal** overflow (many columns, or resized ones) is likewise owned by the table shell, so the header row and footer never slide away sideways either. This in-list scroll model applies to **every** list surface — Requests, the Feature Catalog and Toolkit lists, the Tasks-in-Home panel, and the audit log.
- **Aging tint.** Stale records get a subtle **row tint** rather than a dedicated column — a *due-soon* amber and a deeper *overdue* shade — driven by **SLA Status** (§17.2) and time-in-stage (§10.6). Text stays dark-on-pale for legibility. This draws the eye to what is slipping without spending a column on it.
- **Pagination.** Numbered pages with ellipsis for long ranges, and a **monospace record count** ("1–20 of 168").
- **Primary action.** "Create request" (or the object's create action), opening a Draft (§9.7).
- **The view bar** sits above the grid: the **saved-view picker** (left, §22.3), an **active-filter pill** with a **"Clear all"** affordance (a muted "No filters" state when none are applied), and the primary action (right).
- **Empty states are distinct.** **Zero-data** (the list has no records yet) gets the full "create your first request" treatment; **filtered-to-zero** (records exist but none match) gets a quiet bordered surface with a "clear filters" prompt — never the new-user ceremony. The two must not look the same.

### 22.2 Per-column sort and filter (quick, ephemeral)

Applied on top of the current view and **not persisted** until saved into one (§22.4):

- **Sort.** Clicking a column header cycles **ascending → descending → cleared**. The active column shows its direction; inactive columns show a faint indicator on hover. (Multi-column sort lives in the saved view, §22.4, not the header.)
- **Filter.** A **funnel** in the header opens a popover; an **accent dot** on the funnel marks an active filter. The popover is **type-aware**:
  - **free text** → a substring-search input;
  - **select / multi-select** → a **multi-checkbox list with per-value counts**;
  - **numeric** → a **comparator picker** (>, ≥, =, ≤, <) with a value input, plus a **shorthand parser** that accepts typed expressions (`>30`, `<=60`, `=5`) and fills the picker — beginners use the picker, power users type;
  - **date** → a date / range picker;
  - **boolean / is-populated** → a simple toggle or select.
- **Composition.** Multiple column filters **AND together** and compose with — never replace — the saved view's own filters.

### 22.3 The saved-view picker

- A **popover** (not a native dropdown) listing **Default** plus the views the viewer can see. Each row is a small multi-column layout — **name · scope marker · match count** — with the **default view** marked.
- It carries embedded **New / Edit / Delete** actions (Duplicate optional).
- Selecting a view swaps the **column set, filters, and sort** in one action.
- **Scope.** **Personal** views (any member may make their own) and **shared** views (admins). A shared view appears in its audience's picker per the two-layer model (§10.2) and still resolves to each viewer's own entitlements.

### 22.4 The saved-view editor — add, edit, delete

The editor is a **tabbed side sheet — Filters / Fields / Sort** — wide enough for the builders:

- **Filters tab** (shown first, since filters change most often) — a **row-based builder**: each row is *field + comparator + value*, and rows **AND together**. This is the **condition engine (§3) surfaced as UI**; the comparator list and the value input are **type-aware**, exactly as the column popover (§22.2). The builder covers the common all-AND case; a view whose filter uses OR or nested logic is authored/edited through the full condition engine, and the builder shows a clear notice rather than silently flattening it.
- **Fields tab** — a **two-pane shuttle** (available ↔ selected), each pane searchable, the **selected pane reorderable** to set column order. At least one field is required.
- **Sort tab** — rows of *field + ascending / descending*, reorderable, with add/remove. **Multi-column sort lives here.**
- **Footer** — a **scope toggle** (personal / shared, shared being admin-only), a **default-view** toggle, and Cancel / Save.
- **CRUD and semantics.** Any member may create, edit, and delete their own **personal** views; admins manage **shared** views. Deleting a view never touches records. A shared view **assigned** to a viewer — including the single bound view of a Dashboard-viewer (§10.4) — is that viewer's **field-level boundary**: the columns it exposes are the fields they may see, enforced identically on **list, filter, search, and export** (a hidden field cannot be surfaced by adding it as a column, filtering on it, or exporting it). Saved views **store presentation only and never widen access** (§9.4).

### 22.5 Two layers, one rule

There are two independent layers of filter and sort: the **quick per-column** layer (§22.2, ephemeral, applied over the current view) and the **saved-view** layer (§22.4, persisted presentation). They compose, and both obey the same rule — neither can reveal a row or a field the viewer's entitlements don't already grant (§10.2).

### 22.6 List conventions and cross-cutting UX

- **Loading.** Skeleton rows while the shape is known; a spinner only for a short in-control wait. The frame (header, view bar) renders immediately; rows fill in.
- **Feedback.** **Toast** for transient confirmations, **banner** for persistent system messages, **inline** alerts for warnings inside a form or filter, and **silence** for any success the user can already see (autosave, a status change). Errors never auto-dismiss.
- **Concurrency.** Editing is **optimistic and field-level**: records are **not locked on open**; conflicting edits are detected **at save and resolved per field**, not by rejecting the whole record. The escalation bridge's field-level locking (§6) is the deliberate exception — mapped fields lock at escalation — and it never collides because the two sides edit **disjoint** field sets.
- **No-access.** A record the viewer may not see returns a **no-access** response, never a "not found" — the platform never reveals the existence of a record outside the viewer's entitlements.

---

## 23. Record detail, tasks and gates, and the intake form

This section specifies the surfaces where the work happens once someone is off the list (§22): the **record detail**, how **tasks and gates** are handled on it, and the **intake form**. It follows the presentation validated in the prototype and stays in our terms — the 6-stage lifecycle (§7), the crossing tags of §17, the escalation bridge (§6), the condition engine (§3), and the Draft mechanism (§9.7).

### 23.1 The record detail — layout

- **Header block.** The record **ID** (monospace) with **status pills** (escalation state — "Escalated · [origin]" or "AI-direct"; "On hold"; "Closed · [Outcome]"); the record **name**; a **meta strip** of the always-glanceable facts — **Display Status** (§3.4, colored), **Assigned Analyst**, **Priority score** (§3.3, derived), **Due Date**, **Origin** (§17.1); then the **sticky lifecycle stepper** (the 6 stages, §7 — done / current / upcoming states).
- **Why tabs are fine here.** The meta strip plus the side panel (§23.4) keep the key facts *and* the record's relationships visible at all times, so the deep content can sit behind tabs (§23.3) without burying anything — this is the design the prototype settled on, and it is the model the Task detail already followed.
- **Escalated records** get the **bridge panel** (§23.2) directly below the header.
- Below that, a **two-column layout**: the tabbed main card (left) and the side panel (right).

### 23.2 The escalation-bridge panel (escalated records)

For an escalated record, a panel renders the §6 bridge as a three-part visualization so the one-time, one-way link is legible at a glance:

- **The PG record** — its crossing fields shown as a **locked snapshot** (lock icons), its **PG-local stage** marked "stays live", and the **AI Solutions Status** as a read-only **mirror** pill.
- **The spine** — the **shared canonical ID**, the **field lock** on the PG side, and the **status mirror** back (§6.1, §6.4).
- **The AI record** — the **live, AI-controlled stage**, the assigned analyst, and the editable AI-side fields (every edit logged).

A **mirror band** states the coarse-grained truth: the practice group follows delivery only through the mirror, and **Deploy and Post-launch both read as "Deployed" on the PG side until closure** (§6.4).

### 23.3 The main card — Fields / Tasks & gates / Activity

The left card carries three tabs:

- **Fields.** The record's fields organized into **groups** (Intake, Value mapping, Triage, Build, Deploy & outcome, …), each group header carrying its **crossing tag** — [S] crosses to AI Solutions, [A] AI-side only, [P] PG-side only (§17). Fields render as key/value pairs. On an escalated record, crossing fields show a **lock icon** (locked at the escalation snapshot, §6.2). **Derived** fields show their basis inline — e.g. *Priority score = Business Value + Efficiency Gain − Level of Effort* (§3.3). Which fields show can be governed by the condition engine (§3.1).
- **Tasks & gates.** The record's tasks (§2.4) and any open gate (§7):
  - A **gate block** when a gate is open — the gate name, the **transition it fires on** (e.g. Build → QA), an **AND-join** note, and the **approver slots**: each with the person or team, their **role label** (§7.2), and either a "✓ approved" state or inline **Approve / Reject** actions.
  - A **task list** — each task with a checkbox state (**done / open / locked**), title, assignee, and a status pill; a **locked** task shows its **precondition** (§2.4). Sign-off tasks expose the same inline Approve / Reject.
- **Activity.** An **immutable-comment composer** (comments can't be edited once posted, §9) above the **activity thread**: system events and comments interleaved, with event-type indicators; field and stage changes show **old → new**; escalation, assignment, gate decisions, and holds all appear (§12).

### 23.4 The side panel

A right rail of small cards, visible beside the tabs:

- **Typed links** — the record's `related`, `duplicate-of`, and `re-pursuit-of` links (§2.2), each showing the link type and the linked record's ID + name, with a **"Link a record"** action.
- **Attachments** — files (which follow the record, §2.3) and external links, each labeled by type.
- **Watchers** — the current watcher list (§17.3) with a **"Watch this record"** toggle (self-subscribe, §11.2).

### 23.5 Task and sign-off handling

Approvals live **on the record**, not on a separate screen: a gate's approvers act **inline** (§23.3), and the same Approve / Reject also surfaces on the Home's "needs your decision" panel (§10.7). This is "approvals surface as tasks" (§7.2) — the **Approval Request** object holds the frozen approver set, decisions, and timestamps, so the inline control is a view onto that record. A task with substantive content still opens to its **own detail** (its fields, thread, and metadata) when there is real work to do; the lightweight approve/reject path never forces a page change.

### 23.6 The intake form

- **Two columns.** The form on the left and an **always-on "Similar requests" nudge** on the right — the duplicate defense at intake (§9.8), surfacing up to three likely matches as the requestor types the name and description.
- **Grouped sections.** The form renders its **field groups as numbered sections** (Intake, Value mapping, …) drawn from the schema (§17), with **required markers** and paired two-column rows where fields belong together.
- **Conditional reveal.** A field appears when another's value calls for it — e.g. **Client number** when Dept/PG/Client = Client — the condition engine's show/hide (§3.1), rendered as a distinct revealed block.
- **The score widget.** Sliders for **Business Value / Efficiency Gain / Level of Effort** with a **live-computed Priority score** that shows its formula (§3.3), so the requestor watches the derived value form as they set the inputs.
- **Submit vs Save draft.** **Submit** creates the record and mints its canonical ID (§6.7); **Save draft** keeps a personal **Draft** that does not appear on lists, notify the team, or enter the audit trail until it is submitted (§9.7).
