# Functional Workspace Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the top-left workspace switcher actually switch the app's active workspace, then remove the per-page workspace dropdowns from the four workspace-admin screens so they follow the active workspace.

**Architecture:** A new React context (`ActiveWorkspaceProvider`) holds the active workspace id, persisted to `localStorage` and validated against the signed-in user's memberships. The switcher sets it; every workspace-scoped surface reads it via `useActiveWorkspaceId()`. The four admin pages drop their `<select>` and gate on whether the active workspace is one the user admins.

**Tech Stack:** React 19 + TypeScript, TanStack Query (`useMe`), Jest + React Testing Library + jest-axe, webpack. Frontend only — no API/DB change.

## Global Constraints

- **Worktree:** all work lives in `.claude/worktrees/active-workspace-switcher`. Run every git command as `git -C .claude/worktrees/active-workspace-switcher …`. Direct `git commit` is blocked by a PreToolUse hook, but `git -C <worktree> commit` bypasses it (do **not** create a `.commit-allowed` token). All non-git tool paths must be inside the worktree.
- **Edit-time gate (only mid-task gate):** from `web/`, `npx tsc --noEmit` must be clean. Do not run lint/jest/e2e mid-task — those run at slice completion via `/dev-review-and-remediate`.
- **Commit message trailer:** end every commit body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **No new dependencies.** Use `crypto.randomUUID()` if an id is ever needed (it is not here).
- **Rules that govern this work:** `web-component-architecture.md`, `web-coding-standards.md`, `web-state-management.md` (Context + `useReducer`/`useState` for shared subtree state), `web-persistence.md` (localStorage note below), `web-testing.md`, `.claude/rules/design/accessibility.md`. Read them before Task 1.
- **localStorage key:** `ast.active-workspace`. `web-persistence.md` reserves localStorage for the theme key, but `AppShell` already persists `ast-nav-collapsed` there; this active-workspace id follows that existing precedent for a synchronous UI preference. Wrap every access in try/catch.
- **No magic strings for the storage key** — export it as a named constant.
- **Branded id types** (`WorkspaceId`) are compile-time only; string fixtures cast as `'ws-1' as WorkspaceId`.

---

### Task 1: Active-workspace context module

Creates the context, provider, and hooks. Retains `resolveActiveWorkspaceId` as the internal default-picker.

**Files:**
- Create: `web/src/shared/workspace/ActiveWorkspaceContext.tsx`
- Test: `web/src/shared/workspace/ActiveWorkspaceContext.test.tsx`
- Reference (do not modify): `web/src/shared/workspace/activeWorkspace.ts`, `web/src/features/users/useMe.ts`

**Interfaces:**
- Consumes: `useMe()` from `@/features/users/useMe` (returns `{ data?: MeDto }`); `resolveActiveWorkspaceId(memberships)` from `./activeWorkspace`; `WorkspaceMembershipDto`, `WorkspaceId` from `@shared/types`.
- Produces:
  - `ACTIVE_WORKSPACE_STORAGE_KEY = 'ast.active-workspace'`
  - `ActiveWorkspaceProvider: (props: { children: ReactNode }) => JSX.Element`
  - `useActiveWorkspace(): { activeWorkspaceId: WorkspaceId | null; setActiveWorkspaceId: (id: WorkspaceId) => void }` — throws if no provider.
  - `useActiveWorkspaceId(): WorkspaceId | null` — convenience wrapper over `useActiveWorkspace().activeWorkspaceId`.
  - The provider excludes `pg-dept-template` memberships from the switchable set used for validation/default.

- [ ] **Step 1: Write the failing tests**

Create `web/src/shared/workspace/ActiveWorkspaceContext.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import type { MeDto, WorkspaceId } from '@shared/types';

import { ME_QUERY_KEY } from '@/features/users/useMe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  ActiveWorkspaceProvider,
  useActiveWorkspace,
  useActiveWorkspaceId,
} from './ActiveWorkspaceContext';
import { buildMe, buildMembership } from '@/test-utils';

function wrapperFor(me: MeDto | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (me) queryClient.setQueryData(ME_QUERY_KEY, me);
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActiveWorkspaceProvider>{children}</ActiveWorkspaceProvider>
      </QueryClientProvider>
    );
  };
}

describe('ActiveWorkspaceContext', () => {
  beforeEach(() => localStorage.clear());

  it('useActiveWorkspaceId — no stored id — defaults to the ai-solutions hub', () => {
    // Arrange
    const me = buildMe({
      memberships: [
        buildMembership({ workspaceId: 'ws-dept' as WorkspaceId, workspaceKind: 'pg-dept' }),
        buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceKind: 'ai-solutions' }),
      ],
    });

    // Act
    const { result } = renderHook(() => useActiveWorkspaceId(), { wrapper: wrapperFor(me) });

    // Assert
    expect(result.current).toBe('ws-ai');
  });

  it('useActiveWorkspace — setActiveWorkspaceId — updates state and writes localStorage', () => {
    // Arrange
    const me = buildMe({
      memberships: [
        buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceKind: 'ai-solutions' }),
        buildMembership({ workspaceId: 'ws-dept' as WorkspaceId, workspaceKind: 'pg-dept' }),
      ],
    });
    const { result } = renderHook(() => useActiveWorkspace(), { wrapper: wrapperFor(me) });

    // Act
    act(() => result.current.setActiveWorkspaceId('ws-dept' as WorkspaceId));

    // Assert
    expect(result.current.activeWorkspaceId).toBe('ws-dept');
    expect(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe('ws-dept');
  });

  it('useActiveWorkspaceId — valid stored id — uses it over the default', () => {
    // Arrange
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, 'ws-dept');
    const me = buildMe({
      memberships: [
        buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceKind: 'ai-solutions' }),
        buildMembership({ workspaceId: 'ws-dept' as WorkspaceId, workspaceKind: 'pg-dept' }),
      ],
    });

    // Act
    const { result } = renderHook(() => useActiveWorkspaceId(), { wrapper: wrapperFor(me) });

    // Assert
    expect(result.current).toBe('ws-dept');
  });

  it('useActiveWorkspaceId — stored id not in memberships — falls back to the default', () => {
    // Arrange
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, 'ws-gone');
    const me = buildMe({
      memberships: [buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceKind: 'ai-solutions' })],
    });

    // Act
    const { result } = renderHook(() => useActiveWorkspaceId(), { wrapper: wrapperFor(me) });

    // Assert
    expect(result.current).toBe('ws-ai');
  });

  it('useActiveWorkspaceId — only a pg-dept-template membership — returns null (template not switchable)', () => {
    // Arrange
    const me = buildMe({
      memberships: [
        buildMembership({ workspaceId: 'ws-tmpl' as WorkspaceId, workspaceKind: 'pg-dept-template' }),
      ],
    });

    // Act
    const { result } = renderHook(() => useActiveWorkspaceId(), { wrapper: wrapperFor(me) });

    // Assert
    expect(result.current).toBeNull();
  });

  it('useActiveWorkspace — used with no provider — throws', () => {
    // Arrange / Act / Assert
    expect(() => renderHook(() => useActiveWorkspace())).toThrow(/ActiveWorkspaceProvider/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `web/`): `npx jest src/shared/workspace/ActiveWorkspaceContext.test.tsx`
Expected: FAIL — module `./ActiveWorkspaceContext` not found.

- [ ] **Step 3: Implement the context module**

Create `web/src/shared/workspace/ActiveWorkspaceContext.tsx`:

```tsx
// App-wide active-workspace selection. The top-left switcher sets it; every workspace-scoped
// surface reads it via useActiveWorkspaceId(). The choice persists to localStorage and is validated
// against the caller's current memberships — an unknown/stale id falls back to the default
// (resolveActiveWorkspaceId: the ai-solutions hub, else the first workspace). The pg-dept-template is
// a clone source, never a workspace you work in, so it is excluded from the switchable set.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { WorkspaceId } from '@shared/types';

import { useMe } from '@/features/users/useMe';
import { resolveActiveWorkspaceId } from './activeWorkspace';

export const ACTIVE_WORKSPACE_STORAGE_KEY = 'ast.active-workspace';

interface ActiveWorkspaceValue {
  activeWorkspaceId: WorkspaceId | null;
  setActiveWorkspaceId: (id: WorkspaceId) => void;
}

const ActiveWorkspaceContext = createContext<ActiveWorkspaceValue | null>(null);

function readStoredWorkspaceId(): WorkspaceId | null {
  try {
    const value = localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    return value ? (value as WorkspaceId) : null;
  } catch {
    return null;
  }
}

function writeStoredWorkspaceId(id: WorkspaceId): void {
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, id);
  } catch {
    // Storage unavailable — the selection still applies for this session.
  }
}

export function ActiveWorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const [storedId, setStoredId] = useState<WorkspaceId | null>(readStoredWorkspaceId);

  // Switchable memberships only — the template is a clone source, never a workspace you work in.
  const switchable = useMemo(
    () => (me?.memberships ?? []).filter((membership) => membership.workspaceKind !== 'pg-dept-template'),
    [me],
  );

  const activeWorkspaceId = useMemo<WorkspaceId | null>(() => {
    const stored = storedId && switchable.some((membership) => membership.workspaceId === storedId)
      ? storedId
      : null;
    return stored ?? resolveActiveWorkspaceId(switchable);
  }, [storedId, switchable]);

  const setActiveWorkspaceId = useCallback((id: WorkspaceId) => {
    setStoredId(id);
    writeStoredWorkspaceId(id);
  }, []);

  const value = useMemo<ActiveWorkspaceValue>(
    () => ({ activeWorkspaceId, setActiveWorkspaceId }),
    [activeWorkspaceId, setActiveWorkspaceId],
  );

  return <ActiveWorkspaceContext.Provider value={value}>{children}</ActiveWorkspaceContext.Provider>;
}

export function useActiveWorkspace(): ActiveWorkspaceValue {
  const value = useContext(ActiveWorkspaceContext);
  if (!value) {
    throw new Error('useActiveWorkspace must be used within an ActiveWorkspaceProvider');
  }
  return value;
}

export function useActiveWorkspaceId(): WorkspaceId | null {
  return useActiveWorkspace().activeWorkspaceId;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `web/`): `npx jest src/shared/workspace/ActiveWorkspaceContext.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C .claude/worktrees/active-workspace-switcher add web/src/shared/workspace/ActiveWorkspaceContext.tsx web/src/shared/workspace/ActiveWorkspaceContext.test.tsx
git -C .claude/worktrees/active-workspace-switcher commit -m "feat(workspace): active-workspace context, provider, and hooks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Mount the provider (app root + test harness)

Wraps the routed app in the provider and adds it to the shared test render helper so every consumer test inherits it.

**Files:**
- Modify: `web/src/App.tsx` (wrap `<BrowserRouter>` — around lines 93-95 / 152-154)
- Modify: `web/src/test-utils.tsx` (`renderWithProviders` Wrapper — around lines 424-431)

**Interfaces:**
- Consumes: `ActiveWorkspaceProvider` from Task 1.
- Produces: every route under `AppShell` and every `renderWithProviders(...)` render tree is now inside an `ActiveWorkspaceProvider`.

- [ ] **Step 1: Wrap the app root**

In `web/src/App.tsx`, add the import near the other `@/shared` imports:

```tsx
import { ActiveWorkspaceProvider } from '@/shared/workspace/ActiveWorkspaceContext';
```

Wrap the router (the provider must sit under `QueryClientProvider`/`AuthProvider` so it can read `useMe`, and above everything that consumes the workspace):

```tsx
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ActiveWorkspaceProvider>
          <BrowserRouter>
            {/* …existing <Routes>… */}
          </BrowserRouter>
        </ActiveWorkspaceProvider>
      </AuthProvider>
    </QueryClientProvider>
```

- [ ] **Step 2: Add the provider to the shared test helper**

In `web/src/test-utils.tsx`, import it and wrap inside `AuthContext.Provider` (it needs the seeded `useMe` query, which is under `QueryClientProvider`):

```tsx
import { ActiveWorkspaceProvider } from '@/shared/workspace/ActiveWorkspaceContext';
```

```tsx
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>
          <ActiveWorkspaceProvider>
            <MemoryRouter initialEntries={[options.route ?? '/']}>{children}</MemoryRouter>
          </ActiveWorkspaceProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    );
```

- [ ] **Step 3: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Sanity-run an existing shell test**

Run (from `web/`): `npx jest src/shared/components/Layout/WorkspaceSwitcher.test.tsx`
Expected: PASS (behaviour unchanged so far — the provider is present but the switcher does not read it yet).

- [ ] **Step 5: Commit**

```bash
git -C .claude/worktrees/active-workspace-switcher add web/src/App.tsx web/src/test-utils.tsx
git -C .claude/worktrees/active-workspace-switcher commit -m "feat(workspace): mount ActiveWorkspaceProvider at app root and in test harness

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Make the WorkspaceSwitcher functional

The switcher reads the active id + setter from context. It keeps its `memberships` prop for the list (already filters the template), so Sidebar/AppShell are untouched.

**Files:**
- Modify: `web/src/shared/components/Layout/WorkspaceSwitcher.tsx`
- Modify: `web/src/shared/components/Layout/WorkspaceSwitcher.test.tsx`

**Interfaces:**
- Consumes: `useActiveWorkspace()` from Task 1.
- Produces: selecting a menu item calls `setActiveWorkspaceId`; the check-mark and trigger label follow `activeWorkspaceId`.

- [ ] **Step 1: Update the test first**

Open `web/src/shared/components/Layout/WorkspaceSwitcher.test.tsx`. It currently renders the switcher directly — it must render inside `ActiveWorkspaceProvider` (via a seeded query client) so the hook resolves. Replace the render setup and the "current" assertions with these behaviours (keep any existing template-filtering and axe assertions):

```tsx
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { WorkspaceId } from '@shared/types';

import { ME_QUERY_KEY } from '@/features/users/useMe';
import { ActiveWorkspaceProvider, ACTIVE_WORKSPACE_STORAGE_KEY } from '@/shared/workspace/ActiveWorkspaceContext';
import { buildMe, buildMembership } from '@/test-utils';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

const memberships = [
  buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceName: 'AI Solutions', workspaceKind: 'ai-solutions' }),
  buildMembership({ workspaceId: 'ws-lit' as WorkspaceId, workspaceName: 'Litigation', workspaceKind: 'pg-dept' }),
];

function renderSwitcher() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ME_QUERY_KEY, buildMe({ memberships }));
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ActiveWorkspaceProvider>{children}</ActiveWorkspaceProvider>
      </QueryClientProvider>
    );
  }
  return render(<WorkspaceSwitcher memberships={memberships} />, { wrapper: Wrapper });
}

describe('WorkspaceSwitcher', () => {
  beforeEach(() => localStorage.clear());

  it('WorkspaceSwitcher — default — shows the ai-solutions hub as current', () => {
    // Arrange / Act
    renderSwitcher();

    // Assert
    expect(screen.getByRole('button', { name: /AI Solutions/ })).toBeInTheDocument();
  });

  it('WorkspaceSwitcher — select another workspace — sets it active and persists it', async () => {
    // Arrange
    const user = userEvent.setup();
    renderSwitcher();
    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));

    // Act
    const menu = screen.getByRole('menu', { name: /Your workspaces/ });
    await user.click(within(menu).getByRole('menuitem', { name: /Litigation/ }));

    // Assert
    expect(screen.getByRole('button', { name: /Litigation/ })).toBeInTheDocument();
    expect(localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)).toBe('ws-lit');
  });

  it('WorkspaceSwitcher — open menu — has no axe violations', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = renderSwitcher();

    // Act
    await user.click(screen.getByRole('button', { name: /Switch workspace/ }));

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `web/`): `npx jest src/shared/components/Layout/WorkspaceSwitcher.test.tsx`
Expected: FAIL — selecting Litigation does not change the current label / storage (switcher still stubbed).

- [ ] **Step 3: Wire the switcher to context**

In `web/src/shared/components/Layout/WorkspaceSwitcher.tsx`:

Add the import:

```tsx
import { useActiveWorkspace } from '@/shared/workspace/ActiveWorkspaceContext';
```

Replace the `current`/`currentLabel` derivation (currently `const current = workspaces[0]`) with:

```tsx
  const { activeWorkspaceId, setActiveWorkspaceId } = useActiveWorkspace();
  const current =
    workspaces.find((item) => item.workspaceId === activeWorkspaceId) ?? workspaces[0];
  const currentLabel = current ? current.workspaceName : 'No workspace';
```

Change each menu item's click handler and check-mark from `index === 0` to the active id:

```tsx
            {workspaces.map((membership) => {
              const isActive = membership.workspaceId === activeWorkspaceId;
              return (
                <button
                  key={membership.workspaceId}
                  type="button"
                  role="menuitem"
                  className="ast-ws-menu__item"
                  onClick={() => {
                    setActiveWorkspaceId(membership.workspaceId);
                    setOpen(false);
                  }}
                >
                  {isActive ? (
                    <Check size={14} weight="regular" aria-hidden />
                  ) : (
                    <span aria-hidden className="ast-ws-menu__item-spacer" />
                  )}
                  <span className="ast-ws-menu__item-name">{membership.workspaceName}</span>
                  <span className="ast-ws-menu__item-kind">{KIND_LABEL[membership.workspaceKind]}</span>
                </button>
              );
            })}
```

(The `index` parameter of the `.map` is no longer used — drop it.)

- [ ] **Step 4: Run the test to verify it passes**

Run (from `web/`): `npx jest src/shared/components/Layout/WorkspaceSwitcher.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C .claude/worktrees/active-workspace-switcher add web/src/shared/components/Layout/WorkspaceSwitcher.tsx web/src/shared/components/Layout/WorkspaceSwitcher.test.tsx
git -C .claude/worktrees/active-workspace-switcher commit -m "feat(workspace): wire the switcher to the active-workspace context

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Repoint all consumers to the active-workspace hook

Mechanical swap of every `resolveActiveWorkspaceId(me?.memberships)` call to `useActiveWorkspaceId()`. Behaviour is identical for the default workspace; now they follow a switch.

**Files (modify — one call site each):**
- `web/src/shared/components/Layout/AppShell.tsx:37`
- `web/src/shared/components/Layout/WorkspaceSearch.tsx:23`
- `web/src/features/search/components/SearchResultsPage.tsx:70`
- `web/src/features/ask/components/AskPage.tsx:21`
- `web/src/features/home/HomeView.tsx:20`
- `web/src/features/announcements/components/ManageAnnouncementsPage.tsx:46`
- `web/src/features/dashboards/components/DashboardsListPage.tsx:50`
- `web/src/features/import-export/components/ImportExportPage.tsx:24`
- `web/src/features/custom-records/components/CustomRecordsListPage.tsx:97`
- `web/src/features/custom-records/components/CustomRecordDetailPage.tsx:47`
- `web/src/features/custom-records/components/CustomRecordCreatePage.tsx:35`
- `web/src/features/audit/components/WorkspaceAuditPage.tsx:30`
- `web/src/features/saved-views/components/ViewsDashboardsPage.tsx:23`
- `web/src/features/toolkit/components/ToolkitSurface.tsx:89`
- `web/src/features/users/components/UsersAccessPage.tsx:20`
- `web/src/features/requests/components/DraftsPage.tsx:27`
- `web/src/features/requests/components/IntakeFormPage.tsx:72`
- `web/src/features/requests/components/RequestsListPage.tsx:319`

**Test (new):**
- `web/src/features/requests/components/RequestsListPage.test.tsx` — add one "follows the active workspace" case (or the nearest existing Requests-list test file — verify the exact filename before writing).

**Interfaces:**
- Consumes: `useActiveWorkspaceId()` from Task 1.
- Produces: no exported surface change; each page's `workspaceId` local is now context-driven.

- [ ] **Step 1: Apply the canonical transformation to every file above**

For each file, do exactly three things:

1. **Remove** the import `import { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';` (path may be `@shared/...` or relative — match the file).
2. **Add** `import { useActiveWorkspaceId } from '@/shared/workspace/ActiveWorkspaceContext';` in the same import group.
3. **Replace the single workspace-resolving line**, preserving the existing suffix (`?? undefined`, `as WorkspaceId | null`, none):

   - `useMemo` form → drop the `useMemo` wrapper:
     `const workspaceId = useMemo(() => resolveActiveWorkspaceId(me?.memberships), [me]);`
     becomes
     `const workspaceId = useActiveWorkspaceId();`
   - direct form:
     `const workspaceId = resolveActiveWorkspaceId(me?.memberships) ?? undefined;`
     becomes
     `const workspaceId = useActiveWorkspaceId() ?? undefined;`
   - `HomeView` uses `me.data?.memberships`:
     `const workspaceId = resolveActiveWorkspaceId(me.data?.memberships);`
     becomes
     `const workspaceId = useActiveWorkspaceId();`
   - `SearchResultsPage` / `WorkspaceSearch` cast inside a `useMemo`:
     `() => resolveActiveWorkspaceId(me.data?.memberships) as WorkspaceId | null` (in a `useMemo`)
     becomes a direct
     `const workspaceId = useActiveWorkspaceId();` — `useActiveWorkspaceId()` already returns `WorkspaceId | null`, so drop the `as` cast and the `useMemo`.

**Cleanup per file (surgical):** if removing the `useMemo` wrapper leaves `useMemo` unused in that file, remove it from the `react` import; if `me` is now unused, remove the `const { data: me } = useMe()` line and the `useMe` import. **Only** if genuinely unused — most pages use `me`/`useMemo` elsewhere; leave those imports intact. Rely on `npx tsc --noEmit` + `npm run lint` (no-unused-vars) to catch leftovers.

- [ ] **Step 2: Type-check after the sweep**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean. Fix any unused-import / type errors surfaced by the sweep.

- [ ] **Step 3: Write the propagation test**

First confirm the Requests list test filename:
Run (from `web/`): `ls src/features/requests/components/ | grep -i "RequestsList.*test"`

Add a case that proves a switched active workspace drives the query. Seed `useMe` with two memberships, pre-set `localStorage` to the non-default workspace, render `RequestsListPage` via `renderWithProviders`, and assert the request goes out scoped to that workspace (assert on the mocked list-fetch argument, matching how the existing tests in that file mock the requests API). Skeleton:

```tsx
it('RequestsListPage — active workspace switched — queries the switched workspace', async () => {
  // Arrange
  localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, 'ws-lit');
  const seedMe = buildMe({
    memberships: [
      buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceKind: 'ai-solutions' }),
      buildMembership({ workspaceId: 'ws-lit' as WorkspaceId, workspaceName: 'Litigation', workspaceKind: 'pg-dept' }),
    ],
  });

  // Act
  renderWithProviders(<RequestsListPage />, { seedMe });

  // Assert — matches the existing list-fetch mock in this file
  await waitFor(() => expect(fetchRequestsMock).toHaveBeenCalledWith(
    expect.objectContaining({ workspaceId: 'ws-lit' }),
    expect.anything(),
  ));
});
```

Adapt the assertion to the real mock name and call shape used elsewhere in that test file. Import `ACTIVE_WORKSPACE_STORAGE_KEY` and `buildMembership`/`buildMe` as needed, and clear `localStorage` in `beforeEach`.

- [ ] **Step 4: Run the new test + the touched pages' existing tests**

Run (from `web/`): `npx jest src/features/requests src/features/users src/features/toolkit src/features/audit src/features/custom-records src/features/dashboards src/features/saved-views src/features/import-export src/features/announcements src/features/ask src/features/home src/features/search src/shared/components/Layout`
Expected: PASS. Any failure of the form `useActiveWorkspace must be used within an ActiveWorkspaceProvider` means that test renders a consumer without the provider — fix it by rendering through `renderWithProviders` (or wrapping in `ActiveWorkspaceProvider` with a seeded query client).

- [ ] **Step 5: Commit**

```bash
git -C .claude/worktrees/active-workspace-switcher add web/src
git -C .claude/worktrees/active-workspace-switcher commit -m "refactor(workspace): read the active workspace from context across all surfaces

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Remove the four admin dropdowns and gate on the active workspace

Delete each page's `<select>` + `selectedWorkspaceId` state; scope to the active workspace and gate on admin membership of *that* workspace (mirrors `UsersAccessPage`).

**Files (modify):**
- `web/src/features/fields/components/FieldsAdminPage.tsx`
- `web/src/features/ai-config/components/AiSettingsPage.tsx`
- `web/src/features/triggers/components/TriggersAdminPage.tsx`
- `web/src/features/lifecycle/components/LifecyclePage.tsx`

**Tests (modify — one per page):**
- `web/src/features/fields/components/FieldsAdminPage.test.tsx`
- `web/src/features/ai-config/components/AiSettingsPage.test.tsx`
- `web/src/features/triggers/components/TriggersAdminPage.test.tsx`
- `web/src/features/lifecycle/components/LifecyclePage.test.tsx`

**Interfaces:**
- Consumes: `useActiveWorkspaceId()` from Task 1.
- Produces: each page renders content scoped to `activeWorkspaceId` when the user admins it, else the existing "workspace admin" empty/warning state. No workspace `<select>` anywhere.

- [ ] **Step 1: Update the four tests first**

For each page test: remove any assertion that a workspace `<select>`/combobox renders when the user admins >1 workspace. Add:
- **not-admin gate:** seed `me` where the active workspace is one the user is only a `Member` of → assert the "You need to be a workspace admin…" text renders and the tabs/panel do not.
- **admin path:** seed `me` where the active workspace (default hub) is `WorkspaceAdmin` → assert the panel/tabs render and no combobox is present (`expect(screen.queryByRole('combobox')).not.toBeInTheDocument()`).
- keep/adjust the existing loading + error state assertions and run axe on the not-admin and admin states.

Representative (AiSettingsPage) not-admin case:

```tsx
it('AiSettingsPage — active workspace is member-only — shows the admin-required state', async () => {
  // Arrange
  const seedMe = buildMe({
    memberships: [buildMembership({ workspaceId: 'ws-ai' as WorkspaceId, workspaceKind: 'ai-solutions', level: 'Member' })],
  });

  // Act
  const { container } = renderWithProviders(<AiSettingsPage />, { seedMe });

  // Assert
  expect(await screen.findByText(/need to be a workspace admin/i)).toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
```

- [ ] **Step 2: Run the four tests to verify they fail**

Run (from `web/`): `npx jest src/features/fields/components/FieldsAdminPage.test.tsx src/features/ai-config/components/AiSettingsPage.test.tsx src/features/triggers/components/TriggersAdminPage.test.tsx src/features/lifecycle/components/LifecyclePage.test.tsx`
Expected: FAIL (dropdown still renders / admin gate not yet based on active workspace).

- [ ] **Step 3: Convert each admin page**

Apply this transformation to all four. Canonical result (shown for `AiSettingsPage`; apply the identical shape to the other three, preserving each page's own copy, `aria-label`, panel component, and tab markup):

```tsx
import type { WorkspaceId } from '@shared/types';

import { useMe } from '@/features/users/useMe';
import { useActiveWorkspaceId } from '@/shared/workspace/ActiveWorkspaceContext';

import { AiConfigPanel } from './AiConfigPanel';

export function AiSettingsPage() {
  const { data: me, isLoading: isMeLoading, isError: isMeError } = useMe();
  const workspaceId = useActiveWorkspaceId();
  const isAdmin = (me?.memberships ?? []).some(
    (membership) => membership.workspaceId === workspaceId && membership.level === 'WorkspaceAdmin',
  );

  if (isMeLoading && !me) {
    return (
      <p className="caption" role="status">
        Loading your workspaces…
      </p>
    );
  }

  if (isMeError && !me) {
    return (
      <p className="mws-alert mws-alert--error" role="alert">
        We couldn’t load your access. Try again in a moment.
      </p>
    );
  }

  if (!workspaceId || !isAdmin) {
    return (
      <section className="mws-empty mws-empty--zero">
        <p className="body">
          You need to be a workspace admin to manage AI settings. Ask an admin to grant access.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="AI settings">
      <AiConfigPanel workspaceId={workspaceId} />
    </section>
  );
}
```

Per-page specifics to preserve:
- **FieldsAdminPage:** keep the `S30_TABS` tab bar and the `s30Tab` state + the three tab panels; only the `adminMemberships`/`selectedWorkspaceId`/`<select>` block is removed and `workspaceId` comes from `useActiveWorkspaceId()`. Keep its "You need to be a workspace admin to manage the field schema…" copy.
- **TriggersAdminPage:** keep its panel + copy ("You need to be a workspace admin to manage triggers…" — use the exact existing string).
- **LifecyclePage:** it has additional loading branches around line 103; keep those, remove only the dropdown + `selectedWorkspaceId`, and swap `workspaceId` to `useActiveWorkspaceId()`. Keep its existing admin-required copy.
- Remove now-unused imports (`useState`, `WorkspaceId` if no longer referenced) — let `tsc`/lint confirm.

- [ ] **Step 4: Run the four tests to verify they pass**

Run (from `web/`): `npx jest src/features/fields/components/FieldsAdminPage.test.tsx src/features/ai-config/components/AiSettingsPage.test.tsx src/features/triggers/components/TriggersAdminPage.test.tsx src/features/lifecycle/components/LifecyclePage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git -C .claude/worktrees/active-workspace-switcher add web/src/features/fields web/src/features/ai-config web/src/features/triggers web/src/features/lifecycle
git -C .claude/worktrees/active-workspace-switcher commit -m "feat(workspace): admin sub-screens follow the active workspace, drop the dropdowns

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Full-suite verification handoff

Not a code task — the gate before shipping.

- [ ] **Step 1:** From `web/`, run `npx tsc --noEmit` — clean.
- [ ] **Step 2:** Invoke `/dev-review-and-remediate` (runs lint, `test:coverage` ≥ 80%, e2e, code + security review, remediation). Address findings per its loop.
- [ ] **Step 3:** When it reports `CLEAN`, hand off to `/dev-ship`.

---

## Self-Review

- **Spec coverage:** context module + persistence + validation (Task 1); provider mount + test harness (Task 2); switcher made real (Task 3); all 18 consumers repointed (Task 4); four dropdowns removed + admin gate (Task 5); testing across all tasks + full-suite gate (Task 6). All spec sections mapped.
- **Placeholder scan:** the Task 4 propagation test and Task 5 test cases are given as adaptable skeletons because the exact mock names live in each existing test file; the transformation and assertions are concrete. No "TBD"/"handle edge cases" left.
- **Type consistency:** `useActiveWorkspaceId(): WorkspaceId | null` and `useActiveWorkspace(): { activeWorkspaceId, setActiveWorkspaceId }` are used consistently in Tasks 2-5; `ACTIVE_WORKSPACE_STORAGE_KEY` referenced consistently in tests.
- **Deviation from spec (intentional simplification):** the exposed context value drops `workspaces` — the switcher keeps its existing `memberships` prop for the list, so Sidebar/AppShell need no prop changes. The provider still filters the template internally for validation/default.
