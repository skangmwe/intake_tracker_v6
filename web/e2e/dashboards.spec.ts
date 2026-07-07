import { expect, test } from '@playwright/test';

// End-to-end for slice 23 (Seeded Dashboards — S17 → S6). Runs in dev mode (SSO bypass); the API is
// mocked at the network boundary so the flow is deterministic without a seeded database. Covers the
// slice capability: open the Dashboards list, open the AI default dashboard (S6), drill a status
// segment into the embedded records grid, then clear the drill.

const WORKSPACE_ID = '1a150000-0000-4000-8000-000000000001';
const DASHBOARD_ID = 'da5b0000-0000-4000-8000-000000000001';

const ME = {
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    displayName: 'Local Developer',
    email: 'dev@mws.ai',
    lastSignInAt: '2026-07-03T13:00:00Z',
    isDisabled: false,
    theme: 'light',
  },
  memberships: [
    {
      workspaceId: WORKSPACE_ID,
      workspaceName: 'AI Solutions',
      workspaceKind: 'ai-solutions',
      workspacePrefix: 'AIS',
      level: 'WorkspaceAdmin',
      isDashboardViewer: false,
      boundDashboardId: null,
    },
  ],
  isPlatformAdmin: false,
  boundDashboardId: null,
};

const LIST = {
  workspaceId: WORKSPACE_ID,
  items: [
    {
      id: DASHBOARD_ID,
      workspaceId: WORKSPACE_ID,
      slug: 'ai-default',
      name: 'AI Solutions default dashboard',
      description: 'Seeded default',
      audience: { kind: 'everyone' },
      isDefault: true,
      objectType: 'Request',
      widgetCount: 2,
      updatedAt: '2026-07-01T00:00:00Z',
    },
  ],
};

function dashboard(drilled: boolean) {
  const rows = drilled
    ? [{ id: 'REQ-1', name: 'Alpha', stage: 'Intake', origin: 'Tax', analyst: 'M. Chen', priority: 5, due: '2026-07-01' }]
    : [
        { id: 'REQ-1', name: 'Alpha', stage: 'Intake', origin: 'Tax', analyst: 'M. Chen', priority: 5, due: '2026-07-01' },
        { id: 'REQ-2', name: 'Beta', stage: 'Build', origin: 'IP', analyst: 'S. Boyd', priority: 3, due: '2026-07-08' },
      ];
  return {
    id: DASHBOARD_ID,
    workspaceId: WORKSPACE_ID,
    slug: 'ai-default',
    name: 'AI Solutions default dashboard',
    description: 'Seeded default',
    audience: { kind: 'everyone' },
    isDefault: true,
    objectType: 'Request',
    supportsDrillThrough: true,
    widgets: [
      {
        id: 'inflight',
        type: 'segmented-bar',
        title: 'Inflight status',
        config: { metric: 'pipeline-by-category' },
        data: { total: 2, segments: [{ label: 'Intake', count: 1, percent: 50 }, { label: 'Build', count: 1, percent: 50 }] },
      },
      {
        id: 'grid',
        type: 'records-grid',
        title: 'All open requests',
        config: { metric: 'records-grid', objectType: 'Request' },
        data: {
          objectType: 'Request',
          columns: ['ID', 'Name', 'Stage', 'Dept/PG/Client', 'Assigned analyst', 'Priority', 'Due date'],
          count: rows.length,
          rows,
        },
      },
    ],
  };
}

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await page.route('**/api/v1/users/me', (route) => route.fulfill(json(ME)));
  await page.route('**/api/v1/workspaces/*/dashboards', (route) => route.fulfill(json(LIST)));
  await page.route('**/api/v1/dashboards/*', (route) => {
    const drilled = route.request().url().includes('drill=');
    return route.fulfill(json(dashboard(drilled)));
  });
});

test('open the dashboards list, open S6, drill a segment, then clear (S17 → S6)', async ({ page }) => {
  await page.goto('/dashboards');

  // S17 list → open the seeded default.
  await expect(page.getByRole('heading', { name: 'Dashboards', level: 1 })).toBeVisible();
  await page.getByText('AI Solutions default dashboard').click();

  // S6 surface.
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByText('2 records')).toBeVisible();

  // Drill the Intake status segment → the grid re-scopes.
  await page.getByRole('button', { name: 'Intake · 1 record' }).click();
  await expect(page.getByText('Status · Intake')).toBeVisible();
  await expect(page.getByText('1 record', { exact: true })).toBeVisible();

  // Clear the drill → back to the full open set.
  await page.getByRole('button', { name: 'Clear drill-through filter' }).click();
  await expect(page.getByText('Status · Intake')).toBeHidden();
  await expect(page.getByText('2 records')).toBeVisible();
});
