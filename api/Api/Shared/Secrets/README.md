# Secrets

## What belongs here

IOptions<T> wiring for Key Vault secrets loaded via DefaultAzureCredential at startup. Refresh interval configuration (1 hour default per api-secrets.md).

## What does not belong here

The secrets themselves — those live in Azure Key Vault only. NEVER in appsettings.json, .env, or environment variables.

_Traced from `/artifacts/docs/dev/architecture/shared-inventory.md`._
