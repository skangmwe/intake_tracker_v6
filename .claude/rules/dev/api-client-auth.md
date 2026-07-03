# Client-side Auth — SPA / Desktop / CLI

> Server-side token validation, Managed Identity, and `EnsureUserMiddleware` are covered in `api-auth.md`. Read that first if you are working on the API side. This file is the client-side companion — what to do when you are building a SPA, a desktop client, or a CLI that calls the API.

The information in this file is non-obvious and most of it does not appear in the Microsoft Identity Platform quickstarts. Each section captures a class of mistake that has been made at least once during a real deployment. Treat it as a checklist on first integration and a reference table when something silently breaks.

---

## Client-type → Entra platform mapping

Entra app registrations have **three platform classifications** and they are not interchangeable. The platform you register under controls which token-redemption flow Entra will allow.

| Client shape | Entra platform | Where redirect URIs go in the manifest | Which library |
|---|---|---|---|
| Single-page application (React, Angular, Vue, etc.) | **Single-page application (SPA)** — Authorization Code with PKCE, no client secret | `spa.redirectUris` | `@azure/msal-browser` + `@azure/msal-react` (or framework equivalent) |
| Desktop or CLI (interactive, no server-side secret) | **Mobile and desktop applications** (public client) | `publicClient.redirectUris` | `Microsoft.Identity.Client` (MSAL.NET) |
| Confidential web app (server-side, holds a secret) | **Web** | `web.redirectUris` | `Microsoft.Identity.Web` |

The classification is enforced server-side at the token endpoint. A SPA registered under `publicClient` will receive `AADSTS9002326` ("Cross-origin token redemption is permitted only for the SPA client-type") even if everything else is correct.

## `isFallbackPublicClient: true` is forbidden on SPAs

The manifest flag `isFallbackPublicClient` overrides platform classification at the token endpoint. If it is set to `true`, the token endpoint treats the app as a public client regardless of where the redirect URI is registered. This is incompatible with the SPA flow.

- For any SPA app, `isFallbackPublicClient` must be `false` (or absent — `false` is the default).
- If an existing app was created with the flag set, **do not flip it.** Some manifest changes are persisted server-side and the redirect-URI binding remains in the public-client classification regardless. Create a fresh SPA-only app instead and migrate.
- Symptom of getting this wrong: `AADSTS9002326` despite `spa.redirectUris` being correctly populated.

## Redirect URIs are exact-match

Entra does not normalise redirect URIs. Trailing slashes, port numbers, and protocol all matter.

- Register the URL **with** and **without** a trailing slash (e.g. `http://localhost:5173` *and* `http://localhost:5173/`). Browsers and dev servers vary in how they advertise the redirect.
- Register **every port** the dev server may pick. Vite, for example, falls back to `5174`, `5175`, and so on if `5173` is in use. Each fallback port needs its own entry, or `acquireTokenRedirect` will fail with `AADSTS50011`.
- For non-prod environments, register both the load-balancer hostname *and* the direct container URL if either may receive a token redemption.

## Token-cache location

- **SPAs use `sessionStorage`**, never `localStorage`. Refresh tokens in `localStorage` survive tab close and are reachable from any same-origin script — that is the leak class MSAL's docs warn about. `sessionStorage` clears on tab close and is not shared across tabs.
- **Desktop/CLI clients (MSAL.NET)** use the library's built-in cache. On Windows it goes to DPAPI-encrypted storage; on macOS to Keychain; on Linux to libsecret if available. Do not roll your own token persistence.
- Never write the access token or refresh token to a file, environment variable, log, or telemetry sink.

## Permissions and consent

- The caller app's manifest `requiredResourceAccess` must list every scope it intends to request. The MSAL library does not auto-discover scopes; it asks for whatever the calling code passes to `acquireTokenSilent` / `acquireTokenRedirect`.
- **Admin consent must be granted via `oauth2PermissionGrants` with `consentType: AllPrincipals`**, not per-user. Per-user consent looks fine in interactive flows but produces silent-fail on `acquireTokenSilent` for users who have not consented individually — the SPA loops through redirect → silent → fail.
- The `az` CLI's first-party app needs separate consent for any custom-API audience. Run `az login --scope "api://<API-app-id>/.default"` once interactively to grant consent for CLI flows.

## MI Graph permission for user lookup

When the API needs to resolve a user by email (e.g. for invitations, share-by-email), the API's Managed Identity must hold **`User.Read.All`** as an **App permission** (not delegated) on Microsoft Graph. App permissions on Graph require admin consent.

- Grant via `New-AzRoleAssignment` is not the path — Graph permissions go through `New-MgServicePrincipalAppRoleAssignment` against the Microsoft Graph service principal.
- Without this, the email-lookup path silently returns no results — Graph returns 200 with an empty value array rather than 403.

## CORS allow-list

The API's `Api:AllowedOrigins` must include every SPA origin, including local-dev port fallbacks (see Redirect URIs above).

- A missing origin produces a CORS preflight failure on the OPTIONS request. The browser surfaces this as "no Access-Control-Allow-Origin header" rather than a backend error, so logs on the API side may show the OPTIONS request was served correctly.
- Browsers cache preflight responses. After changing the allow-list on the API, a hard reload (or DevTools "Disable cache" toggle for one request) is required to verify the change took effect.

## Token-claim contract

The API expects the following claims on every JWT it accepts:

| Claim | Purpose |
|---|---|
| `oid` | Stable, opaque user identifier — the `Entra` object ID GUID. The only user identifier the API logs (see `api-logging.md`) and the lookup key for `EnsureUserMiddleware`. |
| `name` | Human-readable display name. Stored on `dbo.Users.DisplayName` at first-sign-in upsert. Never logged. |
| `preferred_username` | Email-shaped login identifier. Stored on `dbo.Users.Email`. Never logged. |
| `aud` | Must equal `api://<API-app-id>`. Mismatch surfaces as `AADSTS50013` at the API. |

Be aware of v1 vs v2 token-format differences:
- **v1.0 access tokens** use long URIs for claims — e.g. `http://schemas.microsoft.com/identity/claims/objectidentifier` instead of `oid`.
- **v2.0 access tokens** use the short names above.

`Microsoft.Identity.Web` reads both, but if you parse JWT manually anywhere, you must handle both forms or pin the API registration to v2.0 tokens via the `accessTokenAcceptedVersion: 2` setting in the API's app manifest.

## First-sign-in user provisioning is API responsibility

Clients must NEVER be expected to call a "register" endpoint before their first authenticated API request. The API handles user provisioning automatically via `EnsureUserMiddleware` — see `api-auth.md`.

- The middleware reads `oid`, `name`, `preferred_username` from the JWT and idempotently upserts `dbo.Users` before any controller runs.
- A per-replica `ConcurrentDictionary<Guid, byte>` cache means the upsert procedure is called at most once per replica per user.
- Failures are best-effort — the request continues with a `Warning`-level log; the next request retries the upsert.

The contract for clients is therefore: get a token, call any endpoint, and the user record exists by the time the controller responds. Do not bake registration steps into the SPA's auth flow.

## AADSTS diagnostic table

Common AADSTS error codes seen during integration work:

| Code | Meaning | Likely cause |
|---|---|---|
| **AADSTS9002326** | Cross-origin token redemption is permitted only for the SPA client-type | App registered as public client / `isFallbackPublicClient: true`. Re-register as SPA. |
| **AADSTS9002327** | Sibling of 9002326 | Same root cause. |
| **AADSTS50011** | Reply URL specified does not match | Redirect URI mismatch — typically trailing-slash or wrong port. |
| **AADSTS50013** | Audience validation failed | Token's `aud` does not equal `api://<API-app-id>`. SPA is using the wrong scope. |
| **AADSTS54005** | Authorization code already redeemed | React StrictMode double-mount in dev — first redemption succeeds, second fails. Suppress with `React.StrictMode` removed for the auth route, or accept it as a dev-only artefact. |
| **AADSTS65001** | The user or administrator has not consented | Admin consent missing for the requested scope. Grant `oauth2PermissionGrants` with `consentType: AllPrincipals`. |
| **AADSTS50058** | Silent token request failed; user must sign in interactively | Stale cache or refresh-token expiry — clear `sessionStorage` and trigger interactive sign-in. |

## Stale-state recovery recipe

When a normal browser session misbehaves and incognito works, clear in this order:

1. Site data for `localhost:<port>` (or your SPA host) — Chrome DevTools → Application → Storage → Clear site data.
2. Site data for `login.microsoftonline.com` — same panel, different origin. This is what most "I logged in but it keeps redirecting" issues are.
3. Disable HTTP cache for one reload — DevTools → Network → "Disable cache" — to invalidate the preflight cache.
4. Hard reload the SPA.

If this does not fix it, the issue is server-side (CORS allow-list, redirect URI registration, scope/consent) — not browser state.
