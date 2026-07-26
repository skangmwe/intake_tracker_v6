# Security-review findings — slice-ai-foundation-b305ed0

## Iteration 1

No findings. OWASP A01–A10 walked across the API + database changes:

- **A01 Broken access control:** `AiConfigController` gates reads at `WorkspaceLevel.Viewer` and writes at `WorkspaceLevel.WorkspaceAdmin` via `IAccessGuard`, returning **403 (never 404)** on violation — no existence disclosure.
- **A02 Cryptographic failures / secrets:** Anthropic and OpenAI API keys load from **Key Vault via configuration** (`Ai:AnthropicApiKey` / `Ai:OpenAiApiKey`), never hardcoded; embeddings use **Managed Identity** (no key). No secret is written to a log or an error message. (`api-secrets.md`.)
- **A03 Injection:** `AiConfigService` uses EF Core LINQ (parameterized); the migration is static DDL with no dynamic values. No `FromSqlRaw`/`ExecuteSqlRaw`.
- **A04 Insecure design / data-sensitivity floor:** the content-field allowlist is validated at the controller boundary against a **fixed non-PII set** (`Name` / `Description` / `WorkflowDetails`) — client/matter numbers and identities cannot be configured into what the AI layer may send to a provider.
- **A09 Logging & monitoring:** the providers never log prompts, responses, or record content (`api-logging.md`, `api-pii-handling.md`); no PII is introduced into any log statement.
- A05/A06/A07/A08/A10: no config exposure, no new vulnerable dependency introduced beyond the audited SDKs, no auth/session change, no deserialization of untrusted data, no SSRF surface.
