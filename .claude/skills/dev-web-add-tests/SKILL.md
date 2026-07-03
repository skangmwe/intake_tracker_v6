---
name: dev-web-add-tests
description: Scaffold unit and accessibility tests for an existing component that lacks coverage
---

# Add Tests

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `web-testing.md` — test structure, naming conventions, and coverage requirements
- `.claude/rules/design/accessibility.md` — WCAG 2.2 AA standards; jest-axe assertions required on every component test enforce these

---

Add or improve tests for an existing component or hook. The user will specify the target (e.g. `src/components/Button` or `src/features/Todos/hooks/useTodos`).

## Steps

1. Read the target file(s) to understand the component's props, state, and behaviour.
2. Check whether a `.test.tsx` (or `.test.ts`) file already exists next to it.
   - If it exists, extend it — do not replace it.
   - If it does not exist, create it using the template below.
3. Write tests that cover:
   - **Accessibility** — `axe` assertion (mandatory on every component test file).
   - **Render** — default render with no props / required props.
   - **Behaviour** — user interactions (click, type, keyboard) using `userEvent`.
   - **Edge cases** — empty state, loading state, error state, boundary values.
4. After writing, run `npm test -- --testPathPattern=<filename>` and fix any failures before finishing.

## Test file template

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ComponentName } from '.';

expect.extend(toHaveNoViolations);

describe('ComponentName', () => {
  it('ComponentName — default render — has no accessibility violations', async () => {
    // Arrange
    const { container } = render(<ComponentName />);

    // Act
    const results = await axe(container);

    // Assert
    expect(results).toHaveNoViolations();
  });

  it('ComponentName — default render — renders root element', () => {
    // Arrange / Act
    render(<ComponentName />);

    // Assert
    // assert something visible is in the document
  });

  // behaviour tests
});
```

## Rules

- Query by role, label, and text — not by class name or `data-testid` unless unavoidable.
- Use `userEvent` (not `fireEvent`) for all user interaction simulations.
- Mock only at the boundary (API calls, third-party modules) — do not over-mock.
- Every test file must include exactly one `axe` accessibility assertion.
- Name tests using the pattern `unitName — scenario — expected result` so CI failure output is self-describing.
- Structure every test with explicit Arrange / Act / Assert phases, separated by blank lines and labelled with `// Arrange`, `// Act`, `// Assert` comments.
- Every test must contain at least one assertion. Empty `it()` bodies and `it.todo(...)` blocks are not acceptable as scaffolding — they are zero-coverage and the CI gate treats them as failures.
- Do not delete existing passing tests — only add or fix.
- After all tests pass, run `npm run test:coverage` and check that coverage thresholds (80% branches/functions/lines/statements) are met.
