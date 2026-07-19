import { expect, test } from '@playwright/test';

// End-to-end for dashboards (slice 23 seeded S17 → S6, extended for the slice 28 multi-dashboard
// composer). Runs in dev mode (SSO bypass); the API is mocked at the network boundary so the flow is
// deterministic without a seeded database. Covers: open the list, open the AI default (S6), drill a
// segment; and — for the composer — open a personal composed dashboard, enter edit-layout mode, and
// add a widget.

const WORKSPACE_ID = '1a150000-0000-4000-8000-000000000001';
const DASHBOARD_ID = 'da5b0000-0000-4000-8000-000000000001';
const COMPOSED_ID = 'da5b0000-0000-4000-8000-0000000000c1';

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
      visibility: 'Shared',
      layoutMode: 'Fixed',
      isSeeded: true,
    },
    {
      id: COMPOSED_ID,
      workspaceId: WORKSPACE_ID,
      slug: null,
      name: 'My triage',
      audience: { kind: 'everyone' },
      isDefault: false,
      objectType: 'Request',
      widgetCount: 0,
      updatedAt: '2026-07-19T00:00:00Z',
      visibility: 'Personal',
      layoutMode: 'Composed',
      isSeeded: false,
    },
  ],
};

// The composer's scope hook reads the field schema (departments) + lifecycle config (stages).
const FIELDS = {
  workspaceId: WORKSPACE_ID,
  objectType: 'Request',
  fields: [{ fieldKey: 'deptPgClient', options: [{ value: 'Dept', label: 'Dept' }] }],
  platformFields: [],
};
const LIFECYCLE = {
  workspaceId: WORKSPACE_ID,
  lifecycles: [{ isDefault: true, stages: [{ key: 'intake', label: 'Intake' }] }],
  roleLabels: [],
  approverTeams: [],
};

function dashboard(drilled: boolean) {
  const rows = drilled
    ? [
        {
          id: 'REQ-1',
          name: 'Alpha',
          stage: 'Intake',
          origin: 'Tax',
          analyst: 'M. Chen',
          priority: 5,
          due: '2026-07-01',
        },
      ]
    : [
        {
          id: 'REQ-1',
          name: 'Alpha',
          stage: 'Intake',
          origin: 'Tax',
          analyst: 'M. Chen',
          priority: 5,
          due: '2026-07-01',
        },
        {
          id: 'REQ-2',
          name: 'Beta',
          stage: 'Build',
          origin: 'IP',
          analyst: 'S. Boyd',
          priority: 3,
          due: '2026-07-08',
        },
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
    isSeeded: true,
    visibility: 'Shared',
    layoutMode: 'Fixed',
    widgets: [
      {
        id: 'inflight',
        type: 'segmented-bar',
        title: 'Inflight status',
        config: { metric: 'pipeline-by-category' },
        data: {
          total: 2,
          segments: [
            { label: 'Intake', count: 1, percent: 50 },
            { label: 'Build', count: 1, percent: 50 },
          ],
        },
      },
      {
        id: 'grid',
        type: 'records-grid',
        title: 'All open requests',
        config: { metric: 'records-grid', objectType: 'Request' },
        data: {
          objectType: 'Request',
          columns: [
            'ID',
            'Name',
            'Stage',
            'Dept/PG/Client',
            'Assigned analyst',
            'Priority',
            'Due date',
          ],
          count: rows.length,
          rows,
        },
      },
    ],
  };
}

function composedDashboard(withWidget: boolean) {
  return {
    id: COMPOSED_ID,
    workspaceId: WORKSPACE_ID,
    slug: null,
    name: 'My triage',
    audience: { kind: 'everyone' },
    isDefault: false,
    objectType: 'Request',
    supportsDrillThrough: false,
    isSeeded: false,
    visibility: 'Personal',
    layoutMode: 'Composed',
    widgets: withWidget
      ? [
          {
            id: 'w1',
            type: 'kpi-tile',
            title: 'Open count',
            config: { composedMetric: 'count', width: 'Half', sortOrder: 0, depts: [], stages: [] },
            data: { value: 5, caption: null, breakdown: null },
          },
        ]
      : [],
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
  await page.route('**/api/v1/workspaces/*/fields*', (route) => route.fulfill(json(FIELDS)));
  await page.route('**/api/v1/workspaces/*/lifecycle', (route) => route.fulfill(json(LIFECYCLE)));
  await page.route('**/api/v1/dashboards/*', (route) => {
    const url = route.request().url();
    if (url.includes(COMPOSED_ID)) return route.fulfill(json(composedDashboard(false)));
    const drilled = url.includes('drill=');
    return route.fulfill(json(dashboard(drilled)));
  });
});

test('open the dashboards list, open S6, drill a segment, then clear (S17 → S6)', async ({
  page,
}) => {
  await page.goto('/dashboards');

  // S17 list → open the seeded default.
  await expect(page.getByRole('heading', { name: 'Dashboards', level: 1 })).toBeVisible();
  await page.getByText('AI Solutions default dashboard').click();

  // S6 surface — the switcher title carries the dashboard name.
  await expect(page.getByRole('button', { name: /AI Solutions default dashboard/ })).toBeVisible();
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

test('compose a dashboard: enter edit-layout mode and add a widget (S6 composer)', async ({
  page,
}) => {
  // The widget POST returns the dashboard with the new widget; register it before the general
  // by-id route so it takes precedence.
  await page.route('**/api/v1/dashboards/*/widgets', (route) =>
    route.fulfill(json(composedDashboard(true))),
  );

  await page.goto(`/dashboards/${COMPOSED_ID}`);

  // The switcher shows the composed dashboard's name and offers Edit layout.
  await expect(page.getByRole('button', { name: /My triage/ })).toBeVisible();
  await page.getByRole('button', { name: 'Edit layout' }).click();

  // Empty canvas → add the first widget opens the composer.
  await page.getByRole('button', { name: /Add your first widget/ }).click();
  const composer = page.getByRole('dialog', { name: 'Add widget' });
  await expect(composer).toBeVisible();

  // Title it and save (KPI + count are the defaults).
  await composer.getByLabel('Widget title').fill('Open count');
  await composer.getByRole('button', { name: 'Add widget' }).click();

  // The added widget renders on the canvas.
  await expect(page.getByText('Open count')).toBeVisible();
  await expect(page.getByText('5')).toBeVisible();
});
