# Security-review findings — fix-bump-cryptography-xml-a16bd86

## Iteration 1

**Result: CLEAN — this change IS a security remediation (0 new risk).**

| Area | Assessment |
|---|---|
| Dependency risk (the fix) | Pins `System.Security.Cryptography.Xml` from vulnerable `10.0.7` to patched `10.0.10`, clearing **NU1903 / GHSA-cvvh-rhrc-wg4q** (+4 siblings) — High DoS (CWE-770, CVSS 7.5) in XML encryption handling. Verified post-pin: `dotnet list --vulnerable` → "no vulnerable packages"; build emits 0 NU1903. |
| Supply-chain | Pinned package is a first-party Microsoft servicing release (10.0.10); no new/untrusted dependency introduced, no version downgrade. |
| Attack surface | Unchanged except for the DoS being removed from the test project's graph. |
| Regression | Full `Api.Tests` suite 1101/1101 green — auth/token/crypto-adjacent paths unaffected by the servicing bump. |

### Surfaced for ops (not a code change)
Production `Api`/`Worker` resolve `Cryptography.Xml` from the ASP.NET Core **shared framework**, so `dotnet list --vulnerable` does not flag them and a package pin is not the right fix there. Ensure the deployed .NET 10 runtime / container base image is on a patched servicing (≥ 10.0.10) so production is not exposed to the same DoS. Noted in the commit body; base-image pinning is owned per `api-containers.md`.
