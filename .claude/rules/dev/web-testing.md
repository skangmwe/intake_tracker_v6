# Testing

Testing is mandatory. All new features and bug fixes must include tests.

## Jest + React Testing Library

- Test behavior, not implementation — query by role, label, and text, not by class or test ID unless unavoidable.
- Prefer `userEvent` over `fireEvent` for simulating user interactions.
- Aim for meaningful coverage, not 100% line coverage for its own sake — focus on critical paths and edge cases.
- Mock only at the boundary (API calls, third-party modules) — do not over-mock.
- Shared test fixtures must be module-level constants defined before the `describe` block, not inside individual `it` callbacks.
- Recurring test setup (provider wrappers, hook mocks, timer resets) used by 3+ files must be extracted to `src/test-utils.{ts,tsx}` and imported, not re-implemented per file. Update the helper rather than duplicating when a fourth pattern appears. `renderHook` tests may keep a local wrapper — TanStack Query's `wrapper` option does not compose with a JSX render helper.
- jsdom is missing several browser APIs. Add all polyfills and stubs to `src/setupTests.ts` — do not patch globals inline inside individual test files.
- Name test cases using the pattern `unitName — scenario — expected result`, for example: `filterRecords — no date range provided — returns all records`. This makes CI failure output self-describing. The SUT (the component or function under test) should be held in a variable named `sut` or `component` for consistency across test files.
- Structure every test with explicit Arrange / Act / Assert phases, separated by blank lines and labelled with `// Arrange`, `// Act`, `// Assert` comments. This makes intent scannable without reading the assertion logic and is especially useful for complex setup:

  ```ts
  it('filterRecords — past reminder date — excludes record', () => {
    // Arrange
    const records = [buildRecord({ reminderDate: '2020-01-01' })];

    // Act
    const result = filterRecords(records, { from: '2024-01-01' });

    // Assert
    expect(result).toHaveLength(0);
  });
  ```

## Test categories

Tag tests by category to enable selective CI execution:

| Category    | What it covers                             | CI stage                |
| ----------- | ------------------------------------------ | ----------------------- |
| Unit        | Pure functions, hooks, services (no I/O)   | Every push, every PR    |
| Component   | Rendered component behaviour (mocked deps) | Every PR                |
| Integration | Real API / real app stack                  | PR merge gate           |
| Browser     | Playwright / full user flows               | PR merge gate + nightly |

In Jest: use `describe` block names or `--testPathPattern` to filter by category. Run unit and component tests first; gate integration and browser tests on their passing.

## Coverage

- Floor is **80%** for branches, functions, lines, and statements at the project level. Per-run, accept anything in **[78%, 80%)** without adding filler tests if (a) every required behaviour case from this rule file is already covered, and (b) the uncovered branches are documented in the slice doc (or `slice-plan.md` timing row when no slice doc is written) with a one-line justification (e.g. "uncaught defensive branch — input validated upstream"). Only add tests when a _behaviour_ is uncovered, not to move the percentage. Raise the threshold as the project matures; never lower the floor in `jest.config.ts`.
- Coverage config lives in `jest.config.ts`. Run locally with `npm run test:coverage`.

## CI gate — no empty or placeholder tests

The CI pipeline must fail if any test file contains test cases with no assertions. Configure Jest with `--ci` and add a custom reporter or use `jest-circus` to detect zero-assertion tests. A test file that contains only `it('does something', () => {})` or `it.todo(...)` blocks provides false confidence — it inflates the test count without verifying any behaviour.

Treat a test file that ships with no assertions as equivalent to no test coverage for that unit.

## jest-axe

- **Every component test must include an axe accessibility assertion.** A failing axe assertion blocks merging.
- Logic-only hooks (no rendered DOM output) cannot be passed to `axe` — include a comment explaining why no axe assertion is present.

## Playwright

- **E2E tests are required for every critical user flow** — all primary CRUD operations, any multi-step flow, and data persistence (verify state survives a page reload).
- Tests live in `e2e/` at the project root, split by concern: `<feature>.spec.ts` for user flows, `accessibility.spec.ts` for axe checks.
- Use `getByRole`, `getByLabel`, and `getByText` locators — avoid CSS selectors and `data-testid` where possible.
- Each test must be independent. Reset `localStorage` in `beforeEach` using the `goto + evaluate(clear) + reload` pattern — **not** `addInitScript` (it re-runs on every subsequent reload, breaking persistence tests):
  ```ts
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });
  ```
- **Run `@axe-core/playwright` on every key page/state** in a dedicated `accessibility.spec.ts`. A violation fails the build.
- In CI, set `forbidOnly: !!process.env.CI` and `retries: 2` in the Playwright config.
