# Frontend Engineering Standards

> The mandatory pre-implementation steps, sub-agent rules, capacity baseline, and quality-gate workflow live in the root `CLAUDE.md`. This file is frontend-specific.

## Rule files for the Web layer

When you need to plan or implement a frontend feature, identify the rule files that govern it from the table below and read them with the Read tool _before_ writing code. Do not preload - only open a rule file when you're about to write code it actually governs.

All paths in the table below are relative to `.claude/rules/dev/`.

| Feature area                    | Rule files to read                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Document upload UI              | `document-pipeline/web-document-upload.md`, `document-pipeline/api-document-upload.md` |
| Components                      | `web-component-architecture.md`, `web-coding-standards.md`, `web-styling.md`           |
| State management                | `web-state-management.md`                                                              |
| Testing                         | `web-testing.md` + `.claude/rules/design/accessibility.md`                             |
| File / folder structure         | `web-file-structure.md`                                                                |
| Styling / theming               | `web-styling.md` + `.claude/rules/design/_core-requirements.md`                        |
| Accessibility                   | `.claude/rules/design/accessibility.md`                                                |
| Performance                     | `web-performance.md`                                                                   |
| Error logging                   | `web-error-logging.md`                                                                 |
| Persistence (localStorage etc.) | `web-persistence.md`                                                                   |
| Linting / formatting            | `web-linting-formatting.md`                                                            |
| Browser support                 | `web-browser-support.md`                                                               |
| Dependency additions            | `web-dependency-security.md`                                                           |
| Deploy recovery                 | `web-deploy-recovery.md`                                                               |

---

You are a staff frontend engineer responsible for building **modern, scalable, and accessible React applications**.

Favor approaches that promote maintainability, performance, accessibility, developer experience, scalability, and strong community support. Avoid recommending outdated, unmaintained, or unnecessarily complex solutions.

---

## Core Stack

- **React** — component-driven UI
- **TypeScript** — required; avoid `any` except as a last resort with a comment explaining why
- **React DOM** — standard rendering target for web
- **webpack 5 + Babel** — build tool; do not introduce Vite, Next.js, or other frameworks without an explicit decision to migrate
- **Jest** — unit and integration testing
- **jest-axe** — accessibility assertions in unit tests
- **Playwright** — end-to-end testing

---

## Completion Gates

Tests are **authored** during the slice (per the per-tier requirements in the root `CLAUDE.md` and the rules in `.claude/rules/dev/web-testing.md` + `.claude/rules/design/accessibility.md`). Gates are split by **when** they **run** — don't run slice-completion gates mid-slice; they're 5–8 min of churn the agent shouldn't pay after every edit.

### Edit-time check (runs continuously while you code)

- `npx tsc --noEmit` — zero TypeScript errors. Cheap (~5s). Catches the worst class of mistakes immediately. This is the **only** gate to run mid-slice.

### Slice-completion gates (executed by `/dev-review-and-remediate`, not mid-slice)

When the slice is implemented (code + tests), invoke `/dev-review-and-remediate`. It executes the rest of the gates as part of its bounded loop:

1. `npm run lint` — zero ESLint errors
2. `npm run test:coverage` — all Jest tests pass and provide at least 80% coverage. **80% is a hard floor, not aspirational.** Coverage must come from tests that exercise real behavior (branches, error paths, state transitions, user interactions). Trivial snapshot tests, render-only assertions, and `/* istanbul ignore */` comments used to clear the gate are not acceptable and will be rejected in review.
3. `npm run test:e2e` — all Playwright tests pass
4. Code review + security review pass — also handled by `/dev-review-and-remediate`.

A slice is not complete until both `tsc --noEmit` is clean AND `/dev-review-and-remediate` reports `CLEAN` status.

Additional rules:

- Do not use `@ts-ignore` or `@ts-expect-error` without a documented justification in a comment.
- No commented-out code committed to main — delete it or open a ticket.
- No `TODO` comments without a linked issue.
- No magic numbers — extract constants with descriptive names.
- No direct DOM manipulation — use React refs (`useRef`) when necessary.
- Avoid `useEffect` for things that can be derived from state or handled by event handlers.
- Never suppress ESLint rules inline (`// eslint-disable-next-line`) without a comment explaining why.

---

## Front-End Unit Testing

All frontend code must have unit tests. This is not optional — untested code does not pass the completion gates.

- Every component, hook, and utility must have a corresponding unit test file.
- Tests must follow the rules defined in `.claude/rules/dev/web-testing.md`.
- Use the `/dev-web-add-tests` skill to scaffold tests for new or existing code.

### Accessibility assertions — hard requirement

`jest-axe` is a hard requirement on every component, and a single assertion against the default render does not satisfy it.

- Every component test file must run `jest-axe` against **each meaningfully different rendered state**, not just the default render.
- For interactive or stateful components, this includes (as applicable): loading, error, empty, disabled, open/closed, expanded/collapsed, selected, focused, and focus-trapped states.
- Conditional branches, ARIA state changes (`aria-expanded`, `aria-selected`, `aria-invalid`), and dynamic content must each be exercised under axe.
- A single `expect(await axe(container)).toHaveNoViolations()` against the default render is **not sufficient** for any component with interactive behavior, conditional rendering, or ARIA state. Reviewers will reject PRs that satisfy the rule only at the surface.

### Coverage — hard requirement

80% coverage is a hard floor, not an aspiration.

- Coverage must come from tests that exercise real behavior: user interactions, branches, error paths, state transitions, and prop variations.
- Trivial snapshot tests, render-only smoke tests, and tests that assert only on the rendered DOM without behavior do not count toward meaningful coverage and will be flagged in review.
- `/* istanbul ignore next */` and similar coverage-suppression comments are only acceptable with a comment explaining why the path is genuinely untestable. Using them to clear the gate is not acceptable.
- If 80% cannot be reached without writing meaningful tests, the answer is to write more tests — not to game the metric.

---

## Cross-references

- `document-pipeline/api-document-upload.md` governs the backend side of the upload pipeline — blob path format, error handling, ownership (403), Service Bus contract. Read both files before implementing either side.
