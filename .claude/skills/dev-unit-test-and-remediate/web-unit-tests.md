# Web unit tests — templates and required cases

Companion to `/dev-unit-test-and-remediate` for `.ts` / `.tsx` / `.scss` / `.css` source files. Used in tandem with `.claude/rules/dev/web-testing.md` (Jest + RTL conventions, coverage thresholds, jest-axe requirement) and `.claude/rules/design/accessibility.md` (WCAG 2.2 AA standards that the axe assertions enforce).

This file holds: the file-pattern decision, the colocated test-file template (component + hook variants), the required-case checklist, and common mechanical fixes.

---

## Decide test action for the in-scope file

| File pattern | Default test type |
|---|---|
| `src/components/**/*.tsx`, `src/features/**/index.tsx` | **Component test** with axe + render + behaviour cases |
| `src/**/use*.ts` (hooks) | **Hook test** via `renderHook` from RTL — no axe assertion (see web-testing.md note about logic-only hooks; include the explanatory comment) |
| `src/**/*.utils.ts`, `src/**/helpers.ts`, pure functions | **Pure unit test** — input/output assertions, no DOM, no axe |
| `*.scss`, `*.css`, `tokens.ts` | Skip — covered by visual / E2E, not unit-tested |
| `src/setupTests.ts`, `jest.config.ts`, `vite.config.ts` | Skip — config |
| Pages with E2E coverage and minimal logic | Skip — surface a finding noting E2E coverage assumption is in `e2e/` |

---

## Test file conventions

- Co-locate: `Component/index.tsx` → `Component/index.test.tsx`. Hook `useFoo.ts` → `useFoo.test.ts`.
- Imports use the same path the consumer would (`from '.'` for index files, named import for hooks).
- Shared fixtures are **module-level constants before the `describe` block**, never inside `it` callbacks.
- jsdom polyfills go in `src/setupTests.ts`, never inline in a test file.

If a `.test.tsx` already exists, **extend** it. Never replace.

---

## Component test template

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { {{ComponentName}} } from '.';

expect.extend(toHaveNoViolations);

const defaultProps = {
  // shared module-level fixture, used across cases
};

describe('{{ComponentName}}', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<{{ComponentName}} {...defaultProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('renders the default state', () => {
    render(<{{ComponentName}} {...defaultProps} />);
    expect(screen.getByRole('{{role}}', { name: /{{name}}/i })).toBeInTheDocument();
  });

  it('handles primary user interaction', async () => {
    const onAction = jest.fn();
    const user = userEvent.setup();
    render(<{{ComponentName}} {...defaultProps} onAction={onAction} />);

    await user.click(screen.getByRole('button', { name: /{{actionLabel}}/i }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders the empty state', () => {
    render(<{{ComponentName}} {...defaultProps} items={[]} />);
    expect(screen.getByText(/{{emptyCopy}}/i)).toBeInTheDocument();
  });

  it('renders the loading state', () => {
    render(<{{ComponentName}} {...defaultProps} isLoading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the error state', () => {
    render(<{{ComponentName}} {...defaultProps} error={new Error('boom')} />);
    expect(screen.getByText(/boom/i)).toBeInTheDocument();
  });
});
```

---

## Hook test template

```ts
import { renderHook, act } from '@testing-library/react';
import { {{useHook}} } from './{{useHook}}';

// No axe assertion — this hook has no rendered DOM (per web-testing.md).

describe('{{useHook}}', () => {
  it('returns the initial state', () => {
    const { result } = renderHook(() => {{useHook}}());
    expect(result.current.value).toBe({{initial}});
  });

  it('updates state on action', () => {
    const { result } = renderHook(() => {{useHook}}());
    act(() => result.current.setValue({{next}}));
    expect(result.current.value).toBe({{next}});
  });
});
```

---

## Required case checklist (drives the "missing required cases" finding)

Per `web-testing.md` + `.claude/rules/design/accessibility.md`, every component test file must contain:

1. **Exactly one axe assertion** — `expect(await axe(container)).toHaveNoViolations()`. Missing axe is a **Mechanical/High** finding (per `web-testing.md` "blocks merging").
2. **Default render** — verifies the component mounts with required props.
3. **One behaviour case** — at least one `userEvent`-driven interaction asserting state change or callback invocation.
4. **Edge-case states** — empty, loading, and error states *if the component supports them*. If the component does not accept those props, skip; do not invent props to test.

Hook tests must contain:

1. Initial-state assertion.
2. At least one action-triggered state-update assertion via `act`.
3. The "no axe assertion" comment if and only if the hook renders no DOM.

A component test missing the axe assertion or the default render is **Mechanical/High** — auto-fix from the template. Missing behaviour or edge-case coverage is **Mechanical/Medium** — auto-add per the actual component API.

---

## Common mechanical fixes (auto-applied)

| Failure / gap | Fix |
|---|---|
| Component test missing `axe` assertion | Add the axe block from the template at the top of the `describe`. |
| Test queries by class name or `data-testid` when a role is available | Switch to `getByRole` / `getByLabel` / `getByText`. |
| Test uses `fireEvent` for typing or clicking | Replace with `userEvent.setup()` + `await user.click(...)`. |
| jsdom `ResizeObserver` / `IntersectionObserver` errors at test time | Add the polyfill to `src/setupTests.ts` (never inline). |
| Hook test uses `render` instead of `renderHook` | Switch to `renderHook` from `@testing-library/react`. |
| Coverage drops below 80% on a changed file | Add the smallest set of behaviour/edge tests that bring it back to threshold; never lower the threshold. |
| Shared fixture defined inside `it` callback | Hoist to module-level `const` before `describe`. |
| Async assertion missing `await findBy*` | Replace synchronous `getBy*` with `await findBy*` for elements that appear after a state update. |

---

## When a test surfaces a source bug

If a correctly-written test fails because the component / hook has a real bug, route through `.claude/skills/dev-remediation/web-frontend-remediation-logic.md` (or `web-security-remediation-logic.md` for XSS / unsafe-HTML / auth findings) for the source-side fix. Apply, re-read, re-run `npm test -- --testPathPattern=<file>`, log under `remediations-applied/<label>.md`.

---

## After the loop closes

Run `npm run test:coverage` once. If branches/functions/lines/statements drop below 80% on any changed file in scope, surface as **Mechanical/High** in a final iteration and add the missing tests. Do not lower thresholds.
