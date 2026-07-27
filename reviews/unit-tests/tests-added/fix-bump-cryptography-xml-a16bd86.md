# Unit tests added / extended — fix-bump-cryptography-xml-a16bd86

## Iteration 1

**None added.** A dependency-version pin has no testable unit (`api-testing-guidelines.md`). Verification is behavioural: the full `Api.Tests` suite stays green under the bump and the advisory clears.

- **Full `Api.Tests` suite: 1101 passed / 1101** (0 failed, 0 skipped) with `System.Security.Cryptography.Xml 10.0.10`.
- `dotnet list --vulnerable` → "no vulnerable packages"; build → 0 NU1903.
