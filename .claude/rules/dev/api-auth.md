# Server-side Auth — .NET / Azure

> For client-side concerns (SPA / desktop / CLI / MSAL / PKCE / CORS / AADSTS diagnostics) see `api-client-auth.md`.

## Token validation

- Entra ID issues tokens; `Microsoft.Identity.Web` validates them — no custom JWT parsing
- `[Authorize]` on all controllers — only `GET /health` is anonymous
- Services authenticate to Azure resources via Managed Identity — no passwords in connection strings, no API keys for first-party Azure services
- **Secrets live in Azure Key Vault and are loaded at startup via `DefaultAzureCredential`** — this includes LLM provider API keys (see `api-llm-auth.md`) and any other third-party credentials that cannot use Managed Identity. Container app environment variables hold **non-secret configuration only** (endpoints, queue names, container names, allowed origins). Do not put API keys, connection strings with passwords, or other secrets in env vars — even in dev.

## AFD lockdown

When the API is fronted by Azure Front Door, restrict ingress to AFD only. Container Apps `ipSecurityRestrictions` does **not** accept the `AzureFrontDoor.Backend` service tag, so this must be enforced in-process by validating the `X-Azure-FDID` header in middleware against the configured Front Door ID.

- Pipeline placement: after OperationId middleware, before `UseAuthentication` — failed requests should still be correlated, but unauthenticated callers must not reach token validation if they bypassed AFD.
- No-op when the `Security:FrontDoor:FrontDoorId` configuration value is unset, so local development and dev-tenant deploys that do not run behind AFD continue to work.
- Reject with `403` on header mismatch — never `401` (which would prompt the SPA to refresh the token).

## User row provisioning

New caller registration is an API concern, not a database-layer concern. On the first authenticated request from each Entra `oid`, the API must idempotently upsert a row in `dbo.Users` before any controller runs.

- Implement as middleware (`EnsureUserMiddleware`) with a per-replica `ConcurrentDictionary<Guid, byte>` cache so the upsert proc is called at most once per replica per user.
- Best-effort — failures log at `Warning` and the request continues. The next request retries.
- Read claims from the JWT (`oid`, `name`, `preferred_username`) — no Microsoft Graph round-trip required for the upsert itself.
- Pipeline placement: after `UseAuthorization`, before `MapControllers` — the user must be authenticated and authorised before we touch the database, and the upsert must complete before the controller runs.
- Clients must NEVER be expected to call a "register" endpoint first.
