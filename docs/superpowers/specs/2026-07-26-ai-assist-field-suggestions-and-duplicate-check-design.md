# AI-Assist Phase 4, Batch 2 — Field-Value Suggestions + Duplicate Check

**Status:** Design approved (2026-07-26). Feeds `writing-plans`.
**Program:** Phase 4 AI-assist (`.claude` build spec §14). Continues the chatbot walking skeleton (Slices 1–3, shipped) with the next two of the reprioritised three AI-assist features. The chatbot already shipped; these two are the "lighter follow-ons" the foundation was built to make cheap.

## Goal

Add two human-in-the-loop AI-assist features that reuse the shipped foundation, deliver visible intake value, and never widen the data-sensitivity floor:

1. **Field-value suggestions** — a per-field "Suggest" affordance that proposes a value for the field the analyst is editing, drawn from the record's own other allowlisted fields. Generative (free-text) or classifying (single-select).
2. **Duplicate check** — an on-demand, record-level "Check for duplicates" action that surfaces ranked likely-duplicate requests (each with a short AI rationale) and, on confirm, closes the record as **Duplicate** with a `duplicate-of` link and notifies the requestor.

## Foundation reused (already shipped, Slices 1–3)

- `ILlmProviderFactory` / `ILlmProvider` — Claude default via the official `Anthropic` SDK, OpenAI alt (`api-llm-auth.md`).
- `IRecordRetriever.RetrieveAsync(workspaceId, userId, query, queryEmbedding, topK, ct)` — permission-safe hybrid retrieval; the `WorkspaceMembership` join is the access boundary (a non-member gets zero candidates).
- `IEmbeddingService` — Azure OpenAI `text-embedding-3-large` via Managed Identity.
- `IAiConfigService` — the workspace `AiAssistEnabled` off-switch and the content-field **allowlist** (`Name` / `Description` / `WorkflowDetails`, a fixed closed non-PII set).
- The `RecordEmbedding` store + daily refresh sweep (keeps embeddings current for retrieval).

## Global constraints (the four §14 guardrails, enforced by tests)

- **Off by default** — both features gate on the workspace's `AiAssistEnabled`; with it off, the surfaces are absent and no provider call is made.
- **Permission-respecting** — the duplicate check only ever compares against records the caller can see (the retriever's `WorkspaceMembership` boundary + a per-record re-check). Field-suggest reads only the current record the caller is already editing.
- **Transparent / human-in-loop** — every output is AI-labelled; nothing is auto-applied. Field-suggest requires an explicit **Accept**; the duplicate check requires an explicit **Confirm** before the consequential close-as-Duplicate action.
- **Data-sensitivity floor** — only the workspace's **allowlisted content fields** ever reach a provider (never client/matter numbers, requestor identities, or any off-allowlist field). Prompts, responses, and record content are **never logged** — counts + `OperationId` + `DurationMs` only (`api-pii-handling.md`, `api-logging.md`).
- **Providers** — Claude default (`MaxRetries = 3`), OpenAI alt, per `api-llm-auth.md`. No streaming for these (both outputs are short) — plain JSON responses.

## Slice A — Field-value suggestions

### Behaviour

A per-field **"Suggest"** affordance (sparkle) on any editable field, shown only when AI is enabled. Clicking it asks the model to propose a value for that field from the record's other **allowlisted** fields, shows the proposal + a one-line AI-labelled rationale inline, and lets the analyst **Accept** (fills the field) or **Dismiss**. Works both at intake (pre-record: the current form values are the context) and when editing an existing record.

- **Free-text target** (Name, Description, Workflow Details) → generated prose.
- **Single-select target** (Priority, Solution Pattern, request type, …) → a pick from the field's **own option set**. The option list is injected into the prompt and the model's return is **validated to be in-set** — an out-of-set value is rejected (the hallucination guard), surfaced as "no confident suggestion."

### API

- `record FieldSuggestion(string? Value, string Rationale);` — `Value` null when the model has no confident suggestion (out-of-set select, or empty context).
- `interface IFieldSuggestionService { Task<FieldSuggestion> SuggestAsync(Guid workspaceId, Guid userId, string objectType, string targetFieldKey, IReadOnlyDictionary<string,string> allowlistedContext, IReadOnlyList<string>? selectOptions, CancellationToken ct); }`
  - The controller enforces the off-switch (disabled → 403 before calling); the service is never invoked disabled.
  - Builds a prompt from the **allowlisted** context only, plus the target field key and (for a select) its options. Instructs: propose only from the given context; for a select, return exactly one of the listed options or "none"; never invent facts.
  - One `ILlmProviderFactory.Get(...)` call (non-streaming — `MessageCreateParams` with a small `MaxTokens`). Parses `{value, rationale}`; validates a select value against `selectOptions`.
- REST: `POST /v1/workspaces/{workspaceId}/ai/field-suggestion`, body `{ objectType, recordId?, targetFieldKey, fields }` (`fields` = the caller's current values, from which the **controller** projects the allowlisted subset — the data floor is enforced server-side, never trusting the client to pre-filter) → `200 { value, rationale }`. Workspace-member gated; `Cache-Control: private, no-store`. Disabled workspace → 403.

### Web

- A `data-ds`-tagged **"Suggest"** control added to the shared `FieldControl` (the field renderer reused by Requests intake, record edit, and custom-object records), rendered only when `ai/config.enabled`. It calls the endpoint with the form's current field values + the target field key/options, then shows a small inline AI-labelled panel: proposed value, rationale, **Accept** / **Dismiss**. For a select it highlights the proposed option. Loading / error / no-suggestion states rendered explicitly; jest-axe across states.

### Tests

- Service: free-text happy; select-in-set happy; select-out-of-set → `Value == null`; empty context → `Value == null`; permanent-failure no-retry; cancellation; **data-floor** (assert the prompt carries allowlisted text but not a seeded off-allowlist value).
- Controller: happy; member 200; non-member 403; disabled 403; `no-store`.
- Web: the Suggest affordance renders only when enabled; accept fills the field; dismiss clears; error + no-suggestion states; jest-axe across states.

## Slice B — Duplicate check (on-demand, record-level)

### Behaviour

A **"Check for duplicates"** action on a request's detail (shown only when AI is enabled). It ranks likely-duplicate requests the caller can see — each with a short AI rationale (labelled AI) — and lets the caller **Mark as duplicate of** a chosen match. Confirming closes the current record as **Duplicate** with a `duplicate-of` link carrying the rationale and notifies the requestor, pointed at the surviving record (the §14 worked example's propose → confirm → write-through-existing-mechanism).

### API

- `record DuplicateCandidate(string RecordId, string Title, double Score, string Rationale);`
- `interface IDuplicateCheckService { Task<IReadOnlyList<DuplicateCandidate>> CheckAsync(Guid workspaceId, Guid userId, string recordId, CancellationToken ct); }`
  - Off-switch gate; loads the subject record's allowlisted content; embeds it (`IEmbeddingService`); retrieves via `IRecordRetriever` (permission-safe, **excludes the subject record itself**); keeps matches at/above a tunable threshold; for each, asks Claude for a **one-line rationale** built only from the two records' allowlisted content; returns ranked. Never logs content.
- **Confirm** reuses existing mechanisms (no new close/link/notify machinery): closes the subject as **Duplicate** through `ClosureService`, writes the `duplicate-of` typed link (`usp_CreateTypedLink`) with the rationale in the link's rationale slot, and the closure event fans out the requestor notification via the event spine.
- REST:
  - `POST /v1/workspaces/{workspaceId}/ai/duplicate-check/{recordId}` → `200 DuplicateCandidate[]`. Member-gated; visibility of the subject re-checked (403 otherwise); disabled → 403; `no-store`.
  - `POST /v1/workspaces/{workspaceId}/ai/duplicate-check/{recordId}/confirm`, body `{ duplicateOfRecordId, rationale }` → closes-as-Duplicate + link + notify. Re-checks the caller may act on both records (403 otherwise); validates `duplicateOfRecordId` is a real, visible record.

### Web

- A **"Check for duplicates"** action on the record detail (enabled-gated) → a ranked-matches panel: each match shows title, score, the AI rationale (AI-labelled), and an open-link, plus **"Mark as duplicate of this."** Selecting one opens a confirm modal that names the surviving record and states plainly *"This closes this record as Duplicate and can't be undone,"* then calls confirm. Loading / empty (no likely duplicates) / error states explicit; jest-axe across states; the confirm modal follows the disclosure-surface + AI-tool-use rules (consequential action → explicit confirm naming the specific record).

### Tests

- Service: ranked candidates; subject self-excluded; below-threshold dropped; no-candidates → empty; permanent-failure no-retry; cancellation; **data-floor** (only allowlisted content in the rationale prompt).
- Confirm: closes-as-Duplicate + writes `duplicate-of` + emits the notification; non-owner/invisible subject → 403; invalid `duplicateOfRecordId` → 400/404.
- Web: matches panel renders ranked; empty state; the mark-as-duplicate → confirm → close flow; jest-axe across states.

## Deliberately deferred (fast-follows, not this batch)

- **Admin duplicate-check config** — the §14 admin controls for sensitivity threshold, comparison scope, and per-check content fields. Batch 2 ships gated only on `AiAssistEnabled`, with a fixed tunable threshold and **workspace-only** scope (matching the retriever's permission boundary).
- **Hub / cross-workspace duplicate scope**, and the **periodic-sweep** and **at-intake overlay** triggers.
- **Field-suggest for other field types** (multi-select, number, date) and proactive inline suggestions.
- **Feature-Catalog reuse detection**, **link suggestions** (`related` / `re-pursuit-of`), and **thread summarisation** — the remaining §14 candidates, out of scope here.

## Slice sequencing

Two shippable slices, each behind its own worktree + `/dev-ship`:

1. **`slice/ai-field-suggest`** — the field-suggestion service + endpoint + the shared `FieldControl` affordance. Smaller (generative, no retrieval, no close-flow).
2. **`slice/ai-duplicate-check`** — the duplicate-check service (retrieval + rationale) + the check/confirm endpoints (reusing `ClosureService` + typed links + event spine) + the record-detail action and matches/confirm UI.

Field-suggest first — it is self-contained and proves the non-streaming suggestion path; the duplicate check then layers the retrieval + close-flow wiring on top.
