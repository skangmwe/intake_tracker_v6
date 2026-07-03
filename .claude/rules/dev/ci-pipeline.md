# CI Pipeline

Every web project must ship a populated `.github/workflows/ci.yml`. The starter at `templates/.github/workflows/ci.yml` is a stub — fill it in; do not leave it empty.

## Required gates

The workflow must run on `pull_request` for changes under `web/src/**`, `api/**`, and `database/**` and enforce the gates already mandated by the rules below. Do not restate thresholds or rule sets here — link out.

Every job that runs Node-based tooling (`prettier`, `eslint`, `npm audit`, `jest`, `playwright`) must pin Node via `actions/setup-node@v5` with `node-version: '24'`. Do not rely on the runner's default Node — it is unpinned and drifts.

## Action versions

Pin every GitHub Action to its **latest major**, using the bare major tag (`@v5`, not `@v5.1.2`) so minor/patch updates are picked up automatically within that major.

**Never pin an action version from memory.** Model knowledge of action versions is stale by construction — a wrong pin (an old major) ships silently as a green-looking workflow that is actually behind. Before you write or edit **any** `uses: <owner>/<repo>@vN` line, **verify the current latest major against the live registry in this session**:

```bash
# Preferred — latest released tag:
gh api repos/<owner>/<repo>/releases/latest --jq .tag_name
# Fallback when the action publishes tags but not GitHub "releases":
gh api repos/<owner>/<repo>/tags --jq '.[].name' | head
# No gh available? Hit the REST API directly:
curl -fsS https://api.github.com/repos/<owner>/<repo>/releases/latest | grep '"tag_name"'
```

Pin the **major** of whatever that returns (e.g. `tag_name: v3.0.0` → pin `@v3`). Do this for **every** action in the workflow — the ones the scaffold ships **and** any you add. This is mandatory, not "pin what looks right": every version you write must trace to a command you ran in this session, not to recollection. The same check applies whenever you edit an existing workflow — re-verify before committing.

**Never pin a major that runs on an end-of-life Node.js runtime.** JavaScript actions (`actions/checkout`, `actions/setup-node`, `actions/setup-dotnet`, etc.) ship the Node runtime they execute on, and GitHub deprecates old majors as their runtime reaches EOL — a major behind the deprecation line ships a green-looking workflow that GitHub is actively warning about and will eventually break. Don't hardcode which majors are affected; that line moves every time a runtime is retired. The verified latest major always clears it — that's the point of verifying rather than remembering.

> Scope note: "latest" drifts after a build ships. Pinning the latest major today does not keep the workflow current when a new major lands months later (pin-to-major only auto-tracks minors/patches). Keeping majors fresh over time is a separate, optional mechanism. This rule governs getting it right at authoring time.

| Gate                     | Command                | Rule                                       |
| ------------------------ | ---------------------- | ------------------------------------------ |
| Formatting               | `prettier --check`     | `web-linting-formatting.md`                |
| Linting                  | `eslint` (flat config) | `web-linting-formatting.md`                |
| Dependency audit         | `npm audit`            | `web-dependency-security.md`               |
| Unit tests (web)         | `jest --ci`            | `web-testing.md`                           |
| E2E (supported browsers) | `playwright test`      | `web-browser-support.md`, `web-testing.md` |
| Unit tests (api)         | `dotnet test`          | `api-testing-guidelines.md`                |
| Integration tests (api)  | `dotnet test`          | `api-testing-guidelines.md`                |
| Unit tests (database)    | `tSQLt.RunAll`         | `database-testing.md`                      |

Any gate failing fails the build. Do not add `continue-on-error` to make a gate advisory.
