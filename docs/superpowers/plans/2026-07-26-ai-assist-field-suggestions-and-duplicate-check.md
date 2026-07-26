# AI-Assist Field Suggestions + Duplicate Check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This repo's commit discipline overrides the generic per-step `git commit`.** Direct `git commit` is blocked by a PreToolUse hook. Each slice is implemented in its own worktree (via `bash .claude/hooks/begin-change.sh --type slice <name>`), verified with the project gate `/dev-review-and-remediate`, and committed **only** through `/dev-ship`. Do not hand-commit. Within a slice, "run the tests" means the layer's gate (`dotnet test api/Api.Tests`, `npm run test:coverage`, tSQLt in CI). Worktree note: a fresh worktree has no `web/node_modules` — run `npm ci` in `web/` before running jest/tsc there. `.last-clean-run.json` is gitignored.

**Goal:** Ship the two remaining reprioritised Phase-4 AI-assist features — per-field value suggestions and an on-demand record-level duplicate check — reusing the foundation shipped in Slices 1–3, keeping the four §14 guardrails intact.

**Architecture:** Two slices. (A) A non-streaming field-suggestion service + endpoint that proposes one field's value from a record's allowlisted context (free-text generative, single-select classified-and-validated), surfaced as a "Suggest" affordance on the shared `FieldControl`. (B) An on-demand duplicate-check service that embeds the subject record, retrieves permission-safe candidates via the shipped `IRecordRetriever`, asks Claude for a per-match rationale, and — on explicit confirm — closes the record as Duplicate through the existing `ClosureService` + `duplicate-of` typed link + event-spine notification, surfaced as a record-detail action + matches panel + confirm modal.

**Tech Stack:** ASP.NET Core (net10.0), official `Anthropic` SDK, EF Core + stored procedures (Azure SQL), Serilog, React 19 + TypeScript + SCSS Modules (webpack, Node 24), xUnit / tSQLt / jest + jest-axe. All AI infra (`ILlmProviderFactory`, `IEmbeddingService`, `IRecordRetriever`, `IAiConfigService`) already exists.

## Global Constraints

- **Source spec:** `docs/superpowers/specs/2026-07-26-ai-assist-field-suggestions-and-duplicate-check-design.md`. Build-spec authority: `.claude` build spec §14 (AI-assist guardrails + duplicate worked example), §9.8 (similar-requests nudge), §8 (closure / Duplicate outcome), §2.2 (typed links).
- **Read the governing rule files before writing code for each task** (root `CLAUDE.md` mandatory step). Especially `api-llm-auth.md`, `api-pii-handling.md`, `api-logging.md`, `api-error-handling.md`, `api-validation.md`, `api-performance.md`, `api-data-access.md`, and the design `ai-*.md` rules for the UI.
- **The four §14 guardrails are invariants, enforced by tests:** off-by-default (both features gate on workspace `AiAssistEnabled`; disabled → 403, no provider call), permission-respecting (dupe candidates only from records the caller can see — retriever `WorkspaceMembership` boundary + per-record re-check; field-suggest reads only the record the caller is editing), transparent/human-in-loop (AI-labelled; explicit Accept / Confirm; nothing auto-applied), data-floor (only allowlisted content — Name/Description/WorkflowDetails — reaches a provider; never log prompts/responses/content).
- **Reuse, don't rebuild.** `ILlmProviderFactory.Get(provider)` + `ILlmProvider` (non-streaming: `client.Messages.Create*`), `IEmbeddingService.EmbedAsync`, `IRecordRetriever.RetrieveAsync`, `IAiConfigService.GetAsync` (+ `AiContentAllowlist.Allowed`), `IRequestsService.GetByIdAsync` (permission-filtered read), `ClosureService` (close-as-Duplicate), `usp_CreateTypedLink` (`duplicate-of`), the event spine (`IEventSpine.EmitAsync` → `usp_FanOutNotification`). Read each before calling — confirm the current signature.
- **No new limits invented.** Provider `MaxRetries=3`, allowlist = the fixed closed set, non-streaming suggestions with a small named `MaxTokens`, the dupe threshold + top-k are named constants (start the top-k from the retriever's existing default family, justify inline). Enums serialize as strings (already configured).
- **Async discipline:** every async method takes + passes `CancellationToken`; `ConfigureAwait(false)` in library code; no `.Result`/`.Wait()`; time via `IClock`. DI via `Program.cs` + `IOptions<T>`; never inject Scoped into Singleton.
- **API:** thin controllers; ProblemDetails on error; `[Authorize]`; workspace-member gate + ownership re-checks (403 not 404 for domain-record access; dupe-subject inaccessible → 403); `Cache-Control: private, no-store` on AI responses.
- **Web:** feature-folder structure; `data-ds` on every design-system component; every remote-data component renders loading/error/empty explicitly; colocated `.test.tsx` with jest-axe across meaningful states; tokens only (no raw hex/radii); TanStack Query for server state; App Insights error logging.
- **Tests ship in the same slice.** xUnit: happy / permanent-failure-no-retry / cancellation + every branch + the data-floor gate. tSQLt only if a new proc is added. Web: jest + jest-axe across states, ≥80% coverage floor.

---

## Slice sequencing

Each slice is a shippable increment behind its own worktree + `/dev-ship`.

1. **`slice/ai-field-suggest`** — field-suggestion service + endpoint + shared `FieldControl` affordance. No retrieval, no close-flow. Branch off the current `dev` (which already carries the spec/plan docs once this slice ships).
2. **`slice/ai-duplicate-check`** — duplicate-check service (retrieval + rationale) + check/confirm endpoints (reuse `ClosureService` + typed links + event spine) + record-detail action + matches/confirm UI. Branch off `dev` after Slice A ships.

---

# SLICE A — Field-value suggestions

**Read first:** `api-llm-auth.md` (provider factory, official Anthropic SDK non-streaming surface, `MaxRetries=3`), `api-pii-handling.md` + `api-logging.md` (never log prompts/responses), `api-error-handling.md` + `api-validation.md` (403/400 shapes), `api-performance.md` (Cache-Control). Re-read `api/Api/Modules/Ai/Providers/ILlmProvider.cs` + `ClaudeLlmProvider.cs` (the streaming path — you'll add a non-streaming call alongside it), `api/Api/Modules/Ai/Config/AiConfigController.cs` (the exact member/admin gate + ProblemDetails helpers to mirror), `api/Api/Modules/Ai/Config/AiConfigDtos.cs` (`AiContentAllowlist.Allowed`), and the web shared `FieldControl` + `fieldForm` (the field renderer to extend — locate via `grep -rl "FieldControl" web/src`).

### Task A.1: LLM one-shot completion + field-suggestion service

**Files:**
- Modify: `api/Api/Modules/Ai/Providers/ILlmProvider.cs` (+ `ClaudeLlmProvider.cs`, `OpenAiLlmProvider.cs`) — add a non-streaming `CompleteAsync`.
- Create: `api/Api/Modules/Ai/Drafting/FieldSuggestionContracts.cs`, `IFieldSuggestionService.cs`, `FieldSuggestionService.cs`.
- Create tests: `api/Api.Tests/Ai/FieldSuggestionServiceTests.cs`.

**Interfaces (Produces):**
- `record LlmCompletion(string Text);` and on `ILlmProvider`: `Task<LlmCompletion> CompleteAsync(LlmRequest request, int maxTokens, CancellationToken ct);` — a single non-streaming call (streaming already exists for chat; suggestions are short).
- `record FieldSuggestion(string? Value, string Rationale);` — `Value` null = no confident suggestion.
- `interface IFieldSuggestionService { Task<FieldSuggestion> SuggestAsync(Guid workspaceId, Guid userId, string objectType, string targetFieldKey, IReadOnlyDictionary<string,string> allowlistedContext, IReadOnlyList<string>? selectOptions, string? provider, CancellationToken ct); }`

- [ ] **Step 1: Add `CompleteAsync` to `ILlmProvider` + both providers.** Claude: `var msg = await _client.Messages.CreateAsync(new MessageCreateParams { Model = "claude-opus-4-8", MaxTokens = maxTokens, System = request.System, Messages = [ map ] }, ct); return new LlmCompletion(<concatenated text blocks>);` (verify the non-streaming create + text-extraction surface via the `claude-api` skill before writing). OpenAI equivalent. Never log content. Build clean.
- [ ] **Step 2: Failing service test.** `FieldSuggestionServiceTests.Suggest_FreeText_ReturnsGeneratedValue`: fake `ILlmProviderFactory` → a provider whose `CompleteAsync` returns a JSON `{ "value": "...", "rationale": "..." }`; assert the service returns that `Value`/`Rationale`. Run → FAIL (types undefined).
- [ ] **Step 3: Write the contracts + `FieldSuggestionService`.** Build the prompt from `allowlistedContext` (key: value lines) + the target field key; for a select, append the `selectOptions` list and instruct "return exactly one option verbatim, or an empty value if none fits; never invent." System prompt: propose only from the given fields, no legal conclusions, no invented facts. Call `_factory.Get(provider).CompleteAsync(request, MaxSuggestionTokens, ct)` (`MaxSuggestionTokens` a named const ~512). Parse the JSON; for a select, **validate `Value ∈ selectOptions`** (case-sensitive) → else `Value = null`. Empty context → `Value = null` without a provider call. Never log content; log only field key + duration.
- [ ] **Step 4:** Run the free-text test → PASS.
- [ ] **Step 5: Branch + discipline tests.** `Suggest_SelectInSet_ReturnsOption`, `Suggest_SelectOutOfSet_ReturnsNullValue`, `Suggest_EmptyContext_ReturnsNullValue_NoProviderCall`, `Suggest_ProviderThrows_NoRetry_Propagates` (permanent-failure), `Suggest_Cancellation_StopsCleanly`, and the **data-floor** `Suggest_OnlyAllowlistedContextInPrompt` (spy the `LlmRequest`; assert it contains an allowlisted value but not a seeded off-allowlist string — the service only ever receives `allowlistedContext`, so this asserts the contract). Register `IFieldSuggestionService` in `Program.cs`. `dotnet test api/Api.Tests --filter FieldSuggestion` → PASS.

### Task A.2: Field-suggestion endpoint

**Files:**
- Create: `api/Api/Modules/Ai/Drafting/FieldSuggestionController.cs`, `FieldSuggestionDtos.cs`.
- Create tests: `api/Api.Tests/Ai/FieldSuggestionControllerTests.cs`.

**Interfaces (Produces):**
- `record FieldSuggestionRequest(string ObjectType, string? RecordId, string TargetFieldKey, IReadOnlyDictionary<string,string> Fields, IReadOnlyList<string>? SelectOptions, string? Provider);`
- REST: `POST /v1/workspaces/{workspaceId}/ai/field-suggestion` → `200 FieldSuggestion`.

- [ ] **Step 1:** Write `FieldSuggestionController` — member gate via `IAccessGuard.HasWorkspaceLevelAsync(userId, workspaceId, WorkspaceLevel.Viewer, ct)` (mirror `AiConfigController`); read `IAiConfigService.GetAsync` → **disabled → 403** (off-switch, no provider call); **project `request.Fields` to the allowlisted subset server-side** using `AiContentAllowlist.Allowed` (never trust the client to pre-filter — the data floor is enforced here); call `IFieldSuggestionService.SuggestAsync(...)`; `Cache-Control: private, no-store`; return `Ok(suggestion)`. Validate `TargetFieldKey` non-empty → 400 otherwise.
- [ ] **Step 2: xUnit** `FieldSuggestionControllerTests` — happy (member, enabled → 200 with value); non-member → 403; disabled → 403 (service never called); empty `TargetFieldKey` → 400; assert only allowlisted keys are forwarded to the mocked service (data-floor at the controller). `dotnet test api/Api.Tests --filter FieldSuggestionController` → PASS.

### Task A.3: Web — the "Suggest" affordance

**Files:**
- Create: `web/src/features/ai-suggest/` — `api.ts`, `useFieldSuggestion.ts` (TanStack mutation), `components/SuggestButton.tsx` (the sparkle trigger + inline AI-labelled result panel: value, rationale, Accept/Dismiss), `types.ts`, `ai-suggest.css`, colocated `.test.tsx`, `index.ts`.
- Modify: the shared `FieldControl` to render `<SuggestButton>` beside an editable field **only when** `ai/config.enabled` (read via the Slice-1 `useAiConfig`), wired to fill the field on Accept. Pass the field key, the field's current sibling values, and (for a select) its options.

- [ ] **Step 1:** `api.ts` `requestFieldSuggestion(workspaceId, body)` → `apiFetch` POST. `useFieldSuggestion` mutation. `SuggestButton` — sparkle button (`data-ds`), on click calls the mutation with the form's current allowlisted-eligible field values + target key/options; renders loading (thinking dots), error (inline alert), no-suggestion ("No confident suggestion"), and the result panel (AI label + value + rationale + **Accept**/**Dismiss**). Accept calls an `onAccept(value)` prop; for a select, highlight the option. Abort on unmount.
- [ ] **Step 2:** Wire into `FieldControl` behind the enabled flag (gate with `useAiConfig(activeWorkspaceId)` — resolve the active workspace exactly as the surrounding form already does). Ensure it appears at intake, record edit, and custom-object records (all use `FieldControl`).
- [ ] **Step 3:** jest + jest-axe across states (hidden when disabled, loading, error, no-suggestion, result → accept fills, dismiss clears). Query by role/label. `npm run test:coverage` green (≥80%).
- [ ] **Step 4: Ship** — `/dev-review-and-remediate` then `/dev-ship` (branch `slice/ai-field-suggest`). This commits the spec + plan docs too.

---

# SLICE B — Duplicate check (on-demand, record-level)

**Read first:** `api-llm-auth.md`, `api-pii-handling.md`/`api-logging.md`, `api-error-handling.md`/`api-validation.md`, `api-performance.md`, `api-data-access.md`; design `ai-trust-and-provenance.md` (ranked matches, AI label, rationale), `ai-tool-use-and-agency.md` (confirm-before-consequential-action, name the specific record), `disclosure-surfaces.md` (confirm modal), `web-*`. Re-read `api/Api/Modules/Ai/Retrieval/IRecordRetriever.cs` + `RecordRetriever.cs` (candidate shape + top-k), `api/Api/Modules/Ai/Providers/IEmbeddingService.cs`, `IRequestsService.GetByIdAsync` (allowlisted content load), the **`ClosureService`** close-as-Duplicate path + the Outcome enum (§8), **`usp_CreateTypedLink`** (`duplicate-of` link + rationale slot), and the event-spine notify path (`IEventSpine`). Confirm each signature before wiring — do not assume.

### Task B.1: Duplicate-check service

**Files:**
- Create: `api/Api/Modules/Ai/Duplicates/DuplicateCheckContracts.cs`, `IDuplicateCheckService.cs`, `DuplicateCheckService.cs`.
- Create tests: `api/Api.Tests/Ai/DuplicateCheckServiceTests.cs`.

**Interfaces (Produces):**
- `record DuplicateCandidate(string RecordId, string Title, double Score, string Rationale);`
- `interface IDuplicateCheckService { Task<IReadOnlyList<DuplicateCandidate>> CheckAsync(Guid workspaceId, Guid userId, string recordId, CancellationToken ct); }`

- [ ] **Step 1: Failing test.** `DuplicateCheckServiceTests.Check_RanksMatches_ExcludesSelf`: fake config enabled; fake `IRequestsService.GetByIdAsync` → the subject's allowlisted content; fake `IEmbeddingService` → a vector; fake `IRecordRetriever.RetrieveAsync` → three `RetrievedRecord`s including the subject's own id; fake provider `CompleteAsync` → a rationale; assert the result excludes the subject id, is ranked, and each carries a rationale. Run → FAIL.
- [ ] **Step 2:** Implement `DuplicateCheckService.CheckAsync`: config gate (disabled → return empty; the controller enforces the 403 — the service stays pure); load the subject via `IRequestsService.GetByIdAsync` (null → empty); build its allowlisted content; `EmbedAsync`; `RetrieveAsync(workspaceId, userId, <subject content as query>, embedding, DuplicateTopK, ct)`; drop the subject's own `RecordId`; keep `Score >= DuplicateThreshold` (`DuplicateTopK` + `DuplicateThreshold` named consts — top-k from the retriever's default family, threshold a stated tunable start, both justified inline); for each surviving match, load its allowlisted content and ask the provider for a one-line rationale over the two records' allowlisted content only; return ranked. Never log content.
- [ ] **Step 3:** Run → PASS. Branch/discipline tests: `Check_BelowThreshold_Dropped`, `Check_NoCandidates_ReturnsEmpty`, `Check_ProviderThrows_NoRetry`, `Check_Cancellation_StopsCleanly`, `Check_OnlyAllowlistedContentInRationalePrompt` (data-floor spy). Register in `Program.cs`. `dotnet test api/Api.Tests --filter DuplicateCheckService` → PASS.

### Task B.2: Check + confirm endpoints (reuse close-as-Duplicate)

**Files:**
- Create: `api/Api/Modules/Ai/Duplicates/DuplicateCheckController.cs`, `DuplicateCheckDtos.cs`.
- Create tests: `api/Api.Tests/Ai/DuplicateCheckControllerTests.cs`.

**Interfaces (Produces):**
- `record ConfirmDuplicateRequest(string DuplicateOfRecordId, string Rationale);`
- REST: `POST /v1/workspaces/{workspaceId}/ai/duplicate-check/{recordId}` → `200 DuplicateCandidate[]`; `POST .../{recordId}/confirm` → `204`.

- [ ] **Step 1:** `DuplicateCheckController`. Check action: member gate; config disabled → 403; re-check the subject is visible to the caller via `IRequestsService.GetByIdAsync` (null → 403, never 404 for an inaccessible domain record); call `IDuplicateCheckService.CheckAsync`; `no-store`; `Ok(candidates)`.
- [ ] **Step 2:** Confirm action: member gate; validate `DuplicateOfRecordId` is a real record visible to the caller (`GetByIdAsync` → 400/404 if missing/invisible); then **reuse the existing close path** — call `ClosureService` to close the subject with Outcome `Duplicate` + the notes/rationale, which (per the existing closure flow) writes the `duplicate-of` typed link and fans out the requestor notification. If the existing `ClosureService` signature does not already take the duplicate target + rationale, wire the `duplicate-of` link via `usp_CreateTypedLink` and let the closure event notify — **do not build a new close/notify path**. Return `204`.
- [ ] **Step 3: xUnit** `DuplicateCheckControllerTests` — check happy (200); check non-member 403; check disabled 403; check inaccessible subject 403; confirm happy (asserts the close/link/notify collaborators were invoked with the right ids); confirm invalid `DuplicateOfRecordId` → 400/404; confirm non-member 403. Register in `Program.cs`. `dotnet test api/Api.Tests` green.

### Task B.3: Web — record-detail duplicate check

**Files:**
- Create: `web/src/features/ai-duplicates/` — `api.ts`, `useDuplicateCheck.ts` (query for candidates) + `useConfirmDuplicate.ts` (mutation), `components/DuplicateCheckAction.tsx` (the "Check for duplicates" button → opens the panel), `components/DuplicateMatchesPanel.tsx` (ranked list: title, score, AI-labelled rationale, open-link, "Mark as duplicate of this"), `components/ConfirmDuplicateModal.tsx` (names the surviving record + "closes as Duplicate, can't be undone" → confirm), `types.ts`, `ai-duplicates.css`, colocated `.test.tsx`, `index.ts`.
- Modify: the record-detail surface (`web/src/features/requests/.../RecordDetailPage` region) to mount `<DuplicateCheckAction>` only when `ai/config.enabled`.

- [ ] **Step 1:** `api.ts` (`checkDuplicates`, `confirmDuplicate`) + the two hooks. `DuplicateCheckAction` gated on `useAiConfig`; opens `DuplicateMatchesPanel`.
- [ ] **Step 2:** `DuplicateMatchesPanel` — loading / empty ("No likely duplicates found") / error / ranked-list states; each row AI-labelled with rationale + open-link + "Mark as duplicate of this" → opens `ConfirmDuplicateModal`. `ConfirmDuplicateModal` (disclosure-surface pattern) names the surviving record and states the consequence; Confirm calls `useConfirmDuplicate` → on success closes the panel + invalidates the record query (it's now closed as Duplicate). Follow `ai-tool-use-and-agency.md` (explicit confirm naming the record; consequential action).
- [ ] **Step 3:** jest + jest-axe across states (hidden when disabled, loading, empty, error, ranked list, confirm flow, post-confirm). `npm run test:coverage` green (≥80%).
- [ ] **Step 4: Ship** — `/dev-review-and-remediate` then `/dev-ship` (branch `slice/ai-duplicate-check`).

---

## Self-review

- **Spec coverage:** Slice A (field-suggest) → Tasks A.1 (service + non-streaming provider call), A.2 (endpoint + server-side allowlist projection), A.3 (FieldControl affordance). Slice B (dupe check) → B.1 (retrieval + rationale service), B.2 (check + confirm endpoints reusing ClosureService/typed-link/event-spine), B.3 (record-detail action + matches panel + confirm modal). The four §14 guardrails: off-by-default (A.2/B.2 disabled→403 + gated UI), permission-respecting (B.1 retriever boundary + B.2 subject re-check; A reads only the caller's record), transparent/human-in-loop (A.3 Accept, B.3 Confirm modal, AI labels), data-floor (A.1/A.2 allowlist projection + B.1 allowlisted rationale prompt + never-log). Deferred items (admin threshold/scope, hub scope, sweep/intake triggers, other field types, reuse/link/summarise) are explicitly out of scope. ✓
- **Placeholder scan:** no "TBD"/"handle edge cases"/"write tests for the above" — each task names files, interfaces, concrete tests, and the reuse targets; the few tunables (MaxSuggestionTokens, DuplicateTopK, DuplicateThreshold) are flagged "named const, start from the existing family, justify inline," not invented silently. The existing-mechanism reuse points (ClosureService signature, FieldControl props, usp_CreateTypedLink) carry an explicit "read + confirm the signature before wiring" instruction rather than a guessed API — correct for this codebase. ✓
- **Type consistency:** `LlmCompletion`/`CompleteAsync`, `FieldSuggestion`/`IFieldSuggestionService.SuggestAsync`, `FieldSuggestionRequest`, `DuplicateCandidate`/`IDuplicateCheckService.CheckAsync`, `ConfirmDuplicateRequest` — names/signatures consistent across the tasks that produce and consume them. ✓
- **Commit discipline:** no hand-`git commit`; each slice ends at `/dev-review-and-remediate` → `/dev-ship` on its named branch; docs ride along with Slice A. ✓
