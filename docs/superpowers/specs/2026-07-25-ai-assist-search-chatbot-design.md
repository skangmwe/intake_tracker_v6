# AI-Assist Layer — Grounded Search Chatbot ("Ask") — Design

> **Status:** Approved shape (2026-07-25). This is the Phase 4 walking-skeleton design.
> **Phase:** 4 (AI and connectors) — the AI-assist layer, build spec §14.
> **Scope of this spec:** the **search chatbot only** — the walking skeleton that stands up
> the entire AI foundation. The other prioritised AI features (field-value suggestions,
> duplicate detection) and the deferred §14 trio (link suggestions, reuse detection, thread
> summarisation) are **named but not specced here**; each gets its own spec+plan cycle once
> this foundation ships.

---

## 1. Context & goal

Phase 4 adds the AI-assist layer (build spec §14) on top of the shipped Phases 1–3 platform.
The user's prioritised order is **search chatbot first**, then field-value suggestions, then
duplicate detection. The chatbot is the heaviest of the three, but building it exercises the
**entire** greenfield AI foundation (LLM provider, embeddings, SSE streaming, permission-safe
retrieval, guardrail scaffold), so the two lighter features become cheap follow-ons that reuse
all of it. This is a deliberate walking-skeleton choice.

**Goal:** a conversational, permission-respecting search assistant ("Ask"). A user asks a
question in natural language; the system retrieves **only records they are entitled to see**,
and Claude writes a short answer in which **every specific claim cites a source record**, with
the ranked source-record list always shown beneath. When nothing relevant is retrieved, it
says so — it never invents records or facts.

**Non-goal:** a general-purpose assistant, free-form generation, or answering from model
knowledge. Ask is grounded search-with-citations, nothing more.

## 2. The four §14 guardrails (invariants — enforced by tests, not just intent)

Every AI feature in this platform obeys these; the chatbot establishes them:

1. **Human-in-the-loop** — Ask proposes answers and record links; it never writes to a record.
   (The write-through features that follow — field-suggestions, dupe-close — will confirm
   before writing; Ask has no write path at all.)
2. **Permission-respecting** — retrieval runs *through the existing permission-filtered read
   paths*. A record the user cannot see is never a candidate, never retrieved, never cited.
   This is the single most safety-critical property and is a hard test gate (§9).
3. **Transparent** — output is labelled AI, carries a first-use "verify AI output" disclosure,
   and every claim is traceable to a cited record.
4. **Off the critical path** — the AI layer is **default-OFF**, enabled per workspace by an
   admin (§14: "an admin enables it for a workspace"). With it off, every existing workflow
   runs unchanged and the Ask surface is absent.

## 3. Scope

**In scope (this spec / cycle):**
- The AI **foundation**, reused by all later AI features:
  - `ILlmProvider` factory — **Claude via the official `Anthropic` NuGet SDK** (`MaxRetries=3`),
    with **OpenAI as the alt chat provider** (`api-llm-auth.md`). Keys from Key Vault.
  - `IEmbeddingService` — **Azure OpenAI `text-embedding-3-large`** via Managed Identity.
  - **SSE streaming** — the first `text/event-stream` endpoint in the API (`api-streaming.md`).
  - **Guardrail scaffold** — AI-label chrome, first-use disclosure, thumbs feedback, the
    workspace **off-switch**, and the **content-field allowlist** config.
- **Embedding store + once-daily refresh sweep** (SQL-stored vectors; BackgroundService reusing
  the Phase 3 `ScheduledTriggerService` pattern).
- **Permission-safe hybrid retrieval** (semantic cosine + keyword/faceted filter) over
  **Requests**, built object-agnostically.
- The **Ask** chat endpoint (SSE, grounded prompt, citation events) + conversation persistence.
- The **Ask** web surface (dedicated route + top-bar entry).

**Out of scope (named, deferred to their own cycles):**
- Field-value suggestions (§14 drafting) — pure-LLM, no embeddings; next cycle.
- Duplicate detection (§14) — reuses the retrieval engine; auto-materialises the `duplicate-of`
  typed link on close; a cycle after that.
- §14 link suggestions, reuse detection (Feature Catalog), thread summarisation.
- Objects beyond Requests (Features / Toolkit / Announcements) in retrieval — the engine is
  object-agnostic so they plug in later without rework.
- Azure AI Search vector index (the documented scale-out path); Service Bus / Worker embedding
  jobs; command-palette integration; email/export of answers.

## 4. What already exists (Phase 4 bolts onto these)

Confirmed by codebase survey:
- **Similar-requests nudge (§9.8)** — `usp_FindSimilarRequests.sql` (LIKE token-overlap, not
  semantic), `RequestsService.Reads.cs::FindSimilarAsync`, intake panel. Its permission-baked
  `WorkspaceMembership` join is the pattern the keyword side of retrieval reuses.
- **Search procs** — `usp_SearchFull.sql`, `usp_SearchRecords.sql`.
- **Permission-filtered record reads** — `usp_GetRequestByIdForUser.sql` /
  `IRequestsService.GetByIdAsync` (forbidden and non-existent both return 403, no existence
  disclosure). All content the chatbot reads routes through this.
- **FieldValues JSON** — Requests store content-field values in an open `FieldValues` JSON
  column; read via `OPENJSON`/`JSON_VALUE`.
- **Event spine** — `IEventSpine.EmitAsync(EventEnvelope, ct)` → Audit + `usp_FanOutNotification`
  + ServiceBusPublisher (no-op until a namespace is configured — hence no reliance on Service
  Bus this cycle).
- **Phase 3 `ScheduledTriggerService`** (`api/Api/Modules/Triggers/`) — the BackgroundService +
  daily-sweep + `IClock` + per-item try/continue pattern the embedding refresh reuses.

**Greenfield (this cycle builds):** LLM provider, embeddings, vector store, SSE, chat UI,
conversation persistence, AI config/off-switch.

## 5. Architecture & data flow

### 5.1 Components (new)
- `api/Api/Modules/Ai/Providers/` — `ILlmProvider` + `ClaudeLlmProvider` + `OpenAiLlmProvider`
  + `ILlmProviderFactory`; `IEmbeddingService` + `AzureOpenAiEmbeddingService`.
- `api/Api/Modules/Ai/Retrieval/` — `IRecordRetriever` (permission-safe hybrid retrieval),
  `RecordEmbeddingStore`, cosine util.
- `api/Api/Modules/Ai/Embedding/` — `EmbeddingRefreshService : BackgroundService` +
  `EmbeddingRefreshEvaluator` (one sweep, unit-testable without the timer).
- `api/Api/Modules/Ai/Chat/` — `AskService`, `AskController` (SSE), `AiConversationStore`,
  prompt builder, citation parser.
- `api/Api/Modules/Ai/Config/` — workspace off-switch + content-field allowlist read/write.
- `web/src/features/ask/` — chat page, message list, streaming answer, citation chips, source
  list, thumbs feedback, first-use disclosure, empty/disabled states.

### 5.2 Ask request flow
1. Client opens/continues a conversation and POSTs a query to the SSE endpoint.
2. Server checks the workspace **off-switch**; if disabled → feature unavailable (no-op).
3. Embed the query (`IEmbeddingService`).
4. **Retrieve candidates through the permission-filtered path** — a proc returns candidate
   record IDs + stored embeddings **scoped to the caller's memberships** (same `WorkspaceMembership`
   join as `usp_FindSimilarRequests`). Semantic cosine (C#) + keyword/faceted score combine
   (hybrid); take top-k (default k tuned in the plan, not invented here — start with the
   existing `SimilarTopDefault` family and widen with justification).
5. Load the **whitelisted content fields only** of the top-k via `GetByIdAsync` (defence in
   depth: the permission check runs again on the read).
6. Build the grounded prompt: system instruction ("answer only from the provided records; cite
   each claim as `[cite:N]`; if the records don't answer, say so"), trimmed conversation
   history, the whitelisted record snippets labelled `[N]`.
7. Stream Claude's tokens over SSE (`event: token`); parse `[cite:N]` markers → emit
   `event: citation` mapping N → record id/title; on failure `event: error` and close.
8. Persist the user+assistant turn (with citations) to the SQL conversation store. Never log
   prompt/response content.

### 5.3 Vector store & refresh (decided defaults)
- **Store:** `dbo.RecordEmbedding` — `RecordId`, `ObjectType`, `WorkspaceId`, `Model`, `Dims`,
  `Vector VARBINARY(MAX)` (float32), `ContentHash` (of the allowlisted content used), `EmbeddedAt`
  + audit + soft-delete. Cosine similarity computed **in C#** over the workspace-scoped candidate
  set. Rationale: portable (LocalDB/CI have no native SQL `VECTOR`), no new Azure resource, no
  Service Bus. Azure AI Search is the documented scale-out path if corpus/QPS ever demand it.
- **Refresh:** once-daily `EmbeddingRefreshService` (Phase 3 pattern) embeds records whose
  `ContentHash` changed or that have no embedding; batch; per-record try/continue; `IClock`;
  counts + `DurationMs` + `OperationId` logging only. No inline embedding on the write path.
  Freshness lag (a record created today is a candidate tomorrow) is acceptable for search.

### 5.4 Conversation model
- `dbo.AiConversation` (`ConversationId`, `WorkspaceId`, `UserId`, `Title`, audit, soft-delete)
  and `dbo.AiConversationMessage` (`MessageId`, `ConversationId`, `Role`, `Content`,
  `CitationsJson`, `CreatedAt`, audit). Multi-turn within a session; history trimmed to a
  message/token budget before prompt build. Content lives in **SQL** (an allowed PII location,
  `api-pii-handling.md`) — **never in blob, never in logs**. A user reads only their own
  conversations.

## 6. Data-sensitivity envelope (the hard floor, by design)

- **Sent to Claude:** the user's query + a **whitelisted content-field set** (default
  `Name` / `Description` / `Workflow Details`) of the retrieved records.
- **Never sent:** client number, matter number, requestor/user identities, or any field outside
  the admin-configured allowlist. The allowlist is a workspace setting (§14: admin sets "which
  content fields it reads"); its default excludes every PII/client-matter field.
- **Retrieval is permission-filtered** — answers cite only records the asker may see.
- **Never logged:** prompts, responses, retrieved content. Logs carry counts + `OperationId` +
  `DurationMs` only (`api-logging.md`, `api-pii-handling.md`).
- **Providers:** Claude (Anthropic API) for chat, Azure OpenAI (Managed Identity) for embeddings
  — the sanctioned providers per `api-llm-auth.md`. Keys in Key Vault; embeddings keyless via MI.

## 7. UI surface

A dedicated **"Ask"** route reachable from a top-bar entry (present only when the workspace has
the AI layer enabled). The panel: streaming answer with a blinking cursor
(`ai-streaming-and-perceived-latency.md`), inline citation chips, the ranked source-record list
beneath, thumbs up/down feedback (`ai-feedback-and-correction.md`), an AI-label + dismissible
first-use disclosure (`ai-trust-and-provenance.md`), and explicit loading / empty / "no matching
records" / error / disabled states (`web-component-architecture.md`). `data-ds` on every
design-system element; tokens only. Command-palette integration is a later enhancement.

## 8. Schema (new tables — all with PK + 6 audit columns + soft-delete; FKs indexed)

- `dbo.RecordEmbedding` (§5.3) — unique `(ObjectType, RecordId)` filtered `WHERE IsDeleted = 0`;
  `IX_RecordEmbedding_WorkspaceId`.
- `dbo.AiConversation`, `dbo.AiConversationMessage` (§5.4) — `IX` on `WorkspaceId`, `UserId`,
  `ConversationId`.
- Workspace AI config — `AiAssistEnabled BIT NOT NULL DEFAULT 0` +
  `AiContentFieldAllowlist NVARCHAR(MAX) NOT NULL DEFAULT` (`["Name","Description","WorkflowDetails"]`)
  added to the Workspaces table (mirrors the `DueSoonWindowDays` / `BenefitReviewOffsetDays`
  column precedent).
- **Migration numbering:** next free number is **094**, but uncommitted worktrees may consume
  it — `ls database/migrations/` at the start of each DB task and take the next free number.

## 9. Testing strategy (gates — ship in the same slice)

- **Permission invariant (highest priority):** a user cannot retrieve, receive, or cite a record
  they are not entitled to see — across candidate generation, top-k read, and the SSE response.
  Assert a non-member gets zero candidates and zero citations.
- **Allowlist:** no field outside the allowlist ever appears in the outbound prompt; client/matter
  numbers and user identities never appear. Assert on the constructed prompt.
- **No-logging:** prompt/response/retrieved content never reach any log sink.
- **Grounding:** zero candidates → an honest "no records" answer with no invented citations;
  hallucinated `[cite:N]` with no matching record is discarded.
- **Off-switch:** disabled workspace → Ask endpoint no-ops / surface absent.
- **Provider:** mocked in unit tests (happy / permanent-failure-no-retry / cancellation);
  `MaxRetries=3` on Claude; SSE emits `token` / `citation` / `error` correctly; client
  disconnect (`CancellationToken`) stops cleanly, no retry mid-stream.
- **Embedding sweep:** unchanged records skipped via `ContentHash`; new records embedded; per-record
  failure continues the sweep; cancellation exits clean.
- **Web:** jest + jest-axe across states (empty, streaming, answered, no-match, error, disabled);
  SSE mocked; query by role/label.
- Layer gates unchanged: `dotnet test`, `npm run test:coverage`, tSQLt (CI), design-fidelity +
  token gates on web.

## 10. Slice sketch (detail belongs to the plan)

1. **Foundation** — `ILlmProvider` (Claude + OpenAI) + `IEmbeddingService` + workspace off-switch
   & allowlist config. No user feature; proven by tests. *(No SSE-facing endpoint yet.)*
2. **Embedding store + daily refresh sweep + permission-safe hybrid retrieval** — `dbo.RecordEmbedding`,
   `EmbeddingRefreshService`, `IRecordRetriever`. Tested against seeded records; no chat UI.
3. **Ask** — SSE endpoint + grounded prompt + citation events + conversation persistence + the
   Ask web surface → **ship**.

Each slice is its own worktree + `/dev-review-and-remediate` + `/dev-ship`.

## 11. Follow-on features (future cycles, this foundation)

- **Field-value suggestions** (§14 drafting) — read whitelisted fields → Claude proposes a value
  for another field → user confirms before write. No embeddings.
- **Duplicate detection** (§14) — reuse `IRecordRetriever` for ranked candidates + Claude
  rationale; on confirm, close as `Duplicate` **and materialise the `duplicate-of` typed link**
  (`usp_CreateTypedLink` already enforces the rules; wiring it into the close path is the new work).
- §14 link suggestions, Feature-Catalog reuse detection, thread summarisation.

## 12. Resolved decisions

- Match engine = **hybrid** (embeddings recall + Claude rationale/answer). *(User.)*
- Sequence = **chatbot first** as the walking skeleton. *(User.)*
- Chatbot output = **grounded answer + cited source-record list**. *(User.)*
- Vector store = **SQL-stored embeddings + C# cosine** (not Azure AI Search this cycle). *(Deferred to build judgement.)*
- Skeleton object scope = **Requests only**, object-agnostic engine. *(Deferred to build judgement.)*
- AI layer = **default-OFF, workspace-admin opt-in**. *(Deferred to build judgement.)*
- UI = **dedicated "Ask" page from the top bar**. *(Deferred to build judgement.)*
- Provider = **Claude (Anthropic SDK, MaxRetries=3)** default, OpenAI alt; embeddings **Azure
  OpenAI text-embedding-3-large** via MI. *(Per `api-llm-auth.md`.)*
