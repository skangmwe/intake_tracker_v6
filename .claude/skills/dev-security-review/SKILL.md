---
name: dev-security-review
description: Reviews code changes for OWASP-class security vulnerabilities (XSS, exposed secrets, insecure storage, authentication flaws, dependency risks). Diff-only, focused, capped tool budget. Do NOT use for code quality or standards checks — use /dev-code-review for that.
version: "0.2"
---

# /dev-security-review — Lean OWASP review (diff-only)

Reviews staged or changed files for **OWASP Top 10**-class security vulnerabilities using the appropriate layer checklist. Designed to finish in 5–10 minutes. Diff-only; OWASP-only; capped tool budget.

## Scope discipline (read this first)

**In scope** — issues mapped to OWASP A01–A10 (or container/data-protection extensions for the relevant layer): XSS, injection, broken auth, sensitive data exposure, security misconfiguration, vulnerable components, exposed secrets, deserialization, insecure logging of secrets/PII, missing security controls.

**Out of scope** — anything that isn't an OWASP-class issue. If you're reading a file and tempted to flag it, ask: "Is this an OWASP A01–A10 issue?" If no, **drop it**. Code quality, naming, performance, accessibility, missing tests, error-message wording, refactoring opportunities — all out of scope. Defer those to `/dev-code-review`.

**Tool-call budget** — target ≤ 25 tool calls per review (Read, Grep, Bash). If you're approaching 20, you're going too deep. The review is a focused diff scan, not an audit.

## Review Process

1. **Identify the diff.** Run `git diff --cached --name-only`; if empty, `git diff --name-only`. If `$ARGUMENTS` is provided, review only that file or finding. **Read only the changed files** — do not read unchanged files for "context" unless a finding cannot be classified without it.
2. **Identify layers** affected by the diff:
   - `**/*.tsx`, `**/*.ts` (frontend), `**/*.scss`, `**/*.css` → load `@web-frontend-security.md`
   - `**/*.cs`, `**/*.csproj`, `**/appsettings*.json`, `**/Dockerfile`, `**/Program.cs`, `**/NuGet.Config` → load `@api-middletier-security.md`
   - `sql/**`, `migrations/**`, `**/*.sql` → load `@database-backend-security.md`
3. **Walk OWASP A01–A10 + the layer's extensions** against the diff. For each potential finding, apply the in-scope/out-of-scope filter above before recording it.
4. **Classify each finding by severity** (table below).
5. **Apply blocking rules** (table below).
6. **Generate the Outcome Report.**

## Hard limits

- **Do not** read files outside the diff "to be thorough" — that's the audit pattern that bloated this skill to 80+ tool calls. If a finding's context isn't in the diff, drop the finding or note it as `Requires Manual Review`.
- **Do not** chase OWASP-adjacent concerns (perf, a11y, code style). Out of scope.
- **Do not** propose remediations beyond the canonical fix for the OWASP class. Detail belongs in `/dev-remediation`, not here.
- **Do** stop when the layer checklists have been walked once against the diff. There is no "second pass".

## Severity and Blocking Policy

| Severity | Criteria | Blocks Commit? |
|----------|----------|----------------|
| **Critical** | Actively exploitable vulnerability, exposed secrets, credential leaks | Yes |
| **High** | XSS vectors, authentication bypasses, insecure data exposure | Yes |
| **Medium** | Missing security headers, misconfiguration, weak defaults | No — requires developer acknowledgment |
| **Low** | Best practice improvements, defense-in-depth suggestions | No — reported for awareness |

## Actions After Review

- For **Critical** and **High** findings: apply the fix using the appropriate remediation logic (via /dev-remediation), and ask the developer for approval. Block the commit until resolved.
- For **Medium** findings: propose the fix, require the developer to explicitly acknowledge the risk if they choose not to fix.
- For **Low** findings: include in the report only. Developer decides when to address.

## Outcome Report

For each finding:

```
**Finding #[n]**
- OWASP Category: [A01–A10 with name]
- Severity: [Critical | High | Medium | Low]
- File: [fileName]
- Line: [lineNumber]
- Issue: [description of the vulnerability]
- Code: [snippet showing the vulnerable pattern]
- Fix: [what was changed or what needs to change]
- Status: [Fixed | Pending Approval | Requires Manual Fix | Acknowledged]
```

**Review Summary**
- Total findings: [n]
- Critical: [n] — Commit blocked: [Yes | No]
- High: [n] — Commit blocked: [Yes | No]
- Medium: [n] — Acknowledged: [Yes | No]
- Low: [n]
- Overall status: [PASS | FAIL]
  - PASS = zero Critical and zero High findings
  - FAIL = one or more Critical or High findings

## Security Checklists

- Frontend (React / TypeScript / Node): @web-frontend-security.md
- Middle Tier (.NET / Azure): @api-middletier-security.md
- Backend (SQL Server / Database): @database-backend-security.md
