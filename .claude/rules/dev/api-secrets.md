# Secrets Handling

A "secret" is any value whose disclosure would let an attacker impersonate a
service, decrypt protected data, or access a paid third-party account. This
includes: API keys, connection strings containing passwords, signing keys,
OAuth client secrets, webhook signing secrets, encryption keys.

It does **not** include: endpoint URIs, queue names, container names,
allowed CORS origins, region names, or other configuration that is
non-secret on its own. Those go in container app environment variables.

## Storage — Azure Key Vault is the only sanctioned secrets store
- All secrets live in Azure Key Vault, in every environment (dev, staging,
  prod). There is no "dev mode" exemption. Local development uses a
  developer-scoped Key Vault accessed via `DefaultAzureCredential` — i.e.
  the developer's own Azure login, not a shared key.
- Secrets are loaded at startup via `DefaultAzureCredential`. No secret is
  ever read from `appsettings.json`, `.env`, environment variables,
  hardcoded constants, or build-time substitution.
- Service-to-service auth inside Azure uses Managed Identity, which means
  there is no secret to store at all. Prefer this over any API key whenever
  the target service supports it. **Azure OpenAI (used only for embeddings)
  is in this category** — embedding access is never represented as a key
  and is never stored in Key Vault. Two third-party LLM credentials remain
  in Key Vault: (1) the Anthropic API key (Anthropic does not offer a
  first-party Azure service), and (2) the public OpenAI API key for the
  chat alt provider (kept on public OpenAI deliberately to avoid Azure
  OpenAI's 2–8 week lag on new GPT model releases — see
  `api-llm-auth.md`).

## What goes in environment variables instead
Container app environment variables hold non-secret configuration: Key
Vault URI, Service Bus namespace, Blob Storage account URI, queue names,
container names, allowed CORS origins, log levels, feature flags. The
application code reads the Key Vault URI from the environment, then loads
actual secrets from Key Vault.

## Forbidden patterns
- API keys, connection strings with passwords, or any other secret in
  `appsettings.json`, `appsettings.*.json`, `.env`, or environment variables
- Secrets in container image layers (set via `ENV`, `ARG`, or `COPY`)
- Secrets in source control under any branch, including private forks
- Secrets in commit messages, PR descriptions, or issue comments
- Secrets in log statements, exception messages, or telemetry
- Logging the result of `KeyVaultSecret.Value` even at `Debug`

## Rotation and revocation
- Every secret has a documented owner and rotation cadence
- Rotation is a Key Vault operation, never a code change. The application
  must re-read secrets without a redeploy — implement Key Vault refresh on
  a configurable interval (template default: **1 hour** — tune per project
  based on rotation cadence and tolerable staleness window) using
  `Azure.Extensions.AspNetCore.Configuration.Secrets`
- On suspected leak: revoke first, investigate second. Record the incident
  in the project's incident log

## Pre-commit gating
The repository must run `gitleaks` (or an equivalent secret scanner) on
every commit. The `/dev-security-review` skill includes a secret-scan pass.
Any finding blocks the commit until either the value is removed and the
git history is rewritten, or the value is confirmed false-positive and
allowlisted with a comment.

## Required MI role assignments at first deploy

The API and Worker share a single user-assigned Managed Identity (recommended) or each has its own. Before either container will start successfully on a fresh deployment, the MI must hold every role below. **Missing any one of these surfaces only as a runtime crashloop, not as a deploy-time error** — verify with `az role assignment list --assignee <MI principal ID>` before bringing up the API or Worker.

| Resource | Role | Purpose |
|---|---|---|
| Key Vault | **Key Vault Secrets User** | Read application secrets (Anthropic API key, public OpenAI key, third-party credentials) at startup. |
| Storage account | **Storage Blob Data Contributor** | Read/write document blobs and conversation history blobs. |
| Service Bus namespace | **Azure Service Bus Data Sender** (API) / **Data Receiver** (Worker) | Publish or consume `DocumentIndexMessage`. The API and Worker have different roles when MIs are split. |
| Azure SQL (database scope) | Custom DB role with `EXECUTE` on app procedures and `SELECT` on app views | Database access. SQL is gated by AAD-only auth, not connection-string secrets. |
| Azure OpenAI account | **Cognitive Services OpenAI User** | Embeddings via Azure OpenAI Service — there is no API key in Key Vault for this resource (see `api-llm-auth.md`). |
| Azure AI Search service | **Search Index Data Contributor** + **Search Service Contributor** | Read and write vector index documents. Both roles are required — the data role alone cannot create or update the index definition. |

The migrations runner Container App Job (test tenant only — see `database-migrations.md`) does not read Key Vault but its MI still needs the database EXECUTE role to apply schema changes. If the runner's MI is separate from the API/Worker MI, grant it the database role independently.

## Reviewer checklist
- [ ] No new secret is read from configuration outside Key Vault
- [ ] No new logging statement could log a secret value (including
      structured properties on a DTO that holds one)
- [ ] No new test fixture contains a real secret — synthetic values only
- [ ] Any new third-party integration uses Managed Identity if available;
      if not, the API key is in Key Vault and the rotation cadence is
      recorded
