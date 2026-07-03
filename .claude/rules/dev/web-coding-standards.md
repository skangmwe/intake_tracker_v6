# Coding Standards

## Error Handling

- Never let errors crash the UI. Use React error boundaries at route and feature boundaries to catch rendering failures gracefully.
- All `async` operations (API calls, IndexedDB, etc.) must have explicit error handling — no unhandled promise rejections.
- Show user-friendly error states, not raw error messages or blank screens.
- Do not silently swallow errors — always log them via the App Insights SDK (see `web-error-logging.md`).

## Naming Conventions

- Components: `PascalCase` — file and export name must match.
- Hooks: `camelCase` prefixed with `use` (e.g. `useTodos`).
- Constants: `UPPER_SNAKE_CASE`.
- Everything else: `camelCase`.
- Boolean variables/props: prefix with `is`, `has`, `should`, or `can`.
- Variables must be descriptive and self-documenting — single-letter variable names are not allowed (including loop counters such as `i`, `j`, `k`; use `index`, `rowIndex`, etc. instead).

## TypeScript Discipline

- No `any` without a justification comment explaining why it cannot be typed.
- No `@ts-ignore` or `@ts-expect-error` without a documented reason.
- No type assertions (`as`) unless necessary and commented.
- Props must be typed with explicit interfaces — not `React.FC`, not inline object types.
- Exhaustive switch statements in reducers: use a `never` type in the default case to catch unhandled actions at compile time.
- Never create a floating async call that discards its Promise — no `someAsync()` without `await`, `.then()`, or `.catch()`. The only exception is a top-level browser event handler (e.g. `element.addEventListener('click', async () => { ... })`), where the void return is imposed by the DOM API. In all other cases, propagate the Promise or `await` it.

## Code Hygiene

- No commented-out code — delete it or open an issue to track it.
- No `TODO` without a linked issue reference (e.g. `// TODO(#123): ...`).
- No magic numbers — extract constants with descriptive names.
- No `console.log` left in committed code — use proper error reporting.
- No `eslint-disable` without a justification comment on the same line.
- Never pass user-supplied content to `dangerouslySetInnerHTML` — treat it as an XSS injection vector. If rich text rendering is genuinely required, use a sanitization library (e.g. DOMPurify) and document why on the component. The same rule applies to `eval()`, `new Function()`, and any other dynamic code execution with external input.
- Debounce delays, polling intervals, and search-input timeouts must be named constants (e.g. `SEARCH_DEBOUNCE_MS`, `POLL_INTERVAL_MS`). Define them once in a shared `constants.ts` module. Every component that needs the same delay must import that constant — never redefine it as a different literal in a different file.
- Pagination and export page-size values must be named constants (e.g. `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`, `EXPORT_PAGE_SIZE`). Never inline an integer literal in a fetch URL or a TanStack Query `pageSize` parameter.
- URL query strings must be built through a single shared utility function — never assembled via manual template literals or repeated `URLSearchParams` blocks in component files. Centralising URL construction makes encoding consistent and keeps components testable without reproducing URL logic.

## Import Ordering

Organize imports in this order, separated by blank lines:

1. External packages (e.g. `react`, `redux`)
2. Internal aliases / shared modules (e.g. `@/components`, `@/hooks`)
3. Relative imports (e.g. `./utils`, `../types`)
