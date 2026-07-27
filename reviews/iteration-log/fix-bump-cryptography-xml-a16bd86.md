# fix-bump-cryptography-xml-a16bd86 — iteration log

**Label:** fix-bump-cryptography-xml-a16bd86
**Scope source:** uncommitted working tree (clear NU1903 — pin the vulnerable transitive System.Security.Cryptography.Xml to the patched version)
**Files reviewed:** 1 — `api/Api.Tests/Api.Tests.csproj` (API build config)
**Layers in scope:** API build config only. No source, no DB, no frontend → no design/tSQLt gates.
**Started:** 2026-07-27T13:40:00Z
**Ended:** 2026-07-27T13:52:00Z
**Final status:** CLEAN

## Iteration 1 — 0 code findings, security-improving change

### The change
`Api.Tests.csproj` gains an explicit `<PackageReference Include="System.Security.Cryptography.Xml" Version="10.0.10" />` (with a documented comment) to pin the transitive dependency past advisory **GHSA-cvvh-rhrc-wg4q** (+ 4 siblings) / **NU1903**.

- **Advisory:** High-severity DoS (CWE-770, CVSS 7.5, availability-only) in XML encryption handling. .NET 10.0 affected `>= 10.0.0, <= 10.0.9`; **patched `10.0.10`**.
- **Transitive path (Api.Tests):** `Api → Microsoft.Identity.Web 4.12.2 → …TokenCache → Microsoft.AspNetCore.DataProtection 10.0.7 → System.Security.Cryptography.Xml 10.0.7`.
- **Why only Api.Tests:** `dotnet list --vulnerable` reports **Api and Worker have no vulnerable packages** — those `Microsoft.NET.Sdk.Web`/Worker apps get `Cryptography.Xml` from the ASP.NET Core **shared framework** (not a NuGet package), remediated by the runtime/base-image update path (`api-containers.md`), not a package reference. Only the plain-SDK test project resolves the concrete vulnerable package, so the pin is scoped there.

### Phase 0 — tests
- No new tests (a dependency pin has no testable unit per `api-testing-guidelines.md`). Verification is the advisory clearing + the suite staying green.
- **Full `Api.Tests` suite: 1101 passed / 1101, 0 failed** — the 10.0.7→10.0.10 servicing bump (ABI-compatible) breaks nothing, including auth/token/crypto-adjacent paths.

### Phase 1 — code review (0 findings)
- The pin targets the correct patched version (10.0.10, per the advisory), is scoped to the only affected project, carries a comment documenting the GHSA/CWE/path and the framework-provided production angle, and includes a removal condition (once Identity.Web resolves ≥ 10.0.10 on its own). No `.cs`/DB/frontend touched.

### Phase 2 — security review (net improvement, 0 new risk)
- This **is** the remediation: it removes a High advisory from the test project's dependency graph. The pinned package is a legitimate first-party Microsoft servicing release; no new attack surface, no downgrade. Verified: post-pin `dotnet list --vulnerable` → **"no vulnerable packages"**, resolved version **10.0.10**, build emits **0 NU1903**.
- **Surfaced for ops (not a code change):** production API/Worker use the framework-provided assembly — ensure the deployed .NET 10 runtime / base image is on a patched servicing (≥ 10.0.10) so production isn't exposed to the same DoS. Tracked in the commit body.

- Auto-applied: none. Architectural: none. Developer decisions: none.
- End-of-iteration open set: {} (empty)

## Final Status: CLEAN
- Total iterations: 1 · findings fixed: 0 (the change itself is the security fix) · deferred/rejected: 0
