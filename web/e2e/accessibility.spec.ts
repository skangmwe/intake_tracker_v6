import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Accessibility gate (web-testing.md): axe on the key shell surfaces, light and dark.

const WORKSPACE_ID = '1a150000-0000-4000-8000-000000000001';
const DASHBOARD_ID = 'da5b0000-0000-4000-8000-000000000001';

const DASH_ME = {
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

const DASHBOARD = {
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
      data: { total: 1, segments: [{ label: 'Intake', count: 1, percent: 100 }] },
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
        count: 1,
        rows: [
          {
            id: 'REQ-1',
            name: 'Alpha',
            stage: 'Intake',
            origin: 'Tax',
            analyst: 'M. Chen',
            priority: 5,
            due: '2026-07-01',
          },
        ],
      },
    },
  ],
};

function dashJson(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('home shell has no accessibility violations (light theme)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'McDermott' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('home shell has no accessibility violations (dark theme)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('AI default dashboard (S6) has no accessibility violations', async ({ page }) => {
  await page.route('**/api/v1/users/me', (route) => route.fulfill(dashJson(DASH_ME)));
  await page.route('**/api/v1/dashboards/*', (route) => route.fulfill(dashJson(DASHBOARD)));
  // The switcher list + composer scope hooks fire once the dashboard resolves (slice 28).
  await page.route('**/api/v1/workspaces/*/dashboards', (route) =>
    route.fulfill(dashJson({ workspaceId: WORKSPACE_ID, items: [] })),
  );
  await page.route('**/api/v1/workspaces/*/fields*', (route) =>
    route.fulfill(
      dashJson({
        workspaceId: WORKSPACE_ID,
        objectType: 'Request',
        fields: [],
        platformFields: [],
      }),
    ),
  );
  await page.route('**/api/v1/workspaces/*/lifecycle', (route) =>
    route.fulfill(
      dashJson({ workspaceId: WORKSPACE_ID, lifecycles: [], roleLabels: [], approverTeams: [] }),
    ),
  );

  await page.goto(`/dashboards/${DASHBOARD_ID}`);
  // The switcher title carries the dashboard name (slice 28 — the old h1 heading is gone).
  await expect(page.getByRole('button', { name: /AI Solutions default dashboard/ })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

// ── SP2 custom-object records (Slice C) ────────────────────────────────────
const VENDOR_OBJECT = {
  id: 'obj-vendor',
  workspaceId: WORKSPACE_ID,
  objectKey: 'vendor',
  name: 'Vendor',
  pluralLabel: 'Vendors',
  description: null,
  isSystem: false,
  recordsCount: 0,
  fieldsCount: 1,
  createdAt: '2026-07-24T10:00:00Z',
  updatedAt: '2026-07-24T10:00:00Z',
};
const VENDOR_SCHEMA = {
  workspaceId: WORKSPACE_ID,
  objectType: 'vendor',
  fields: [
    {
      id: 'fd-code',
      workspaceId: WORKSPACE_ID,
      objectType: 'vendor',
      fieldKey: 'code',
      displayName: 'Code',
      fieldType: 'ShortText',
      section: 'Details',
      helpText: null,
      isRequired: false,
      sortOrder: 1,
      isRetired: false,
      options: [],
      rules: [],
    },
  ],
  platformFields: [],
};
const VENDOR_RECORD = {
  id: 'rec-1',
  objectDefinitionId: 'obj-vendor',
  name: 'Acme',
  fields: { code: 'AC-1' },
  createdAt: '2026-07-24T10:00:00Z',
  updatedAt: '2026-07-24T11:00:00Z',
  createdBy: 'Local Developer',
  eTag: 'v1',
};

test('custom-object record create form (SP2) has no accessibility violations', async ({ page }) => {
  await page.route('**/api/v1/users/me', (route) => route.fulfill(dashJson(DASH_ME)));
  await page.route('**/api/v1/workspaces/*/objects', (route) => route.fulfill(dashJson([VENDOR_OBJECT])));
  await page.route('**/api/v1/workspaces/*/fields*', (route) => route.fulfill(dashJson(VENDOR_SCHEMA)));
  await page.route('**/api/v1/workspaces/*/saved-views*', (route) => route.fulfill(dashJson([])));

  await page.goto('/objects/vendor/new');
  await expect(page.getByRole('heading', { name: 'New Vendor' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('custom-object record detail (SP2) has no accessibility violations', async ({ page }) => {
  await page.route('**/api/v1/users/me', (route) => route.fulfill(dashJson(DASH_ME)));
  await page.route('**/api/v1/workspaces/*/objects', (route) => route.fulfill(dashJson([VENDOR_OBJECT])));
  await page.route('**/api/v1/workspaces/*/fields*', (route) => route.fulfill(dashJson(VENDOR_SCHEMA)));
  await page.route('**/api/v1/workspaces/*/objects/*/records/*', (route) => route.fulfill(dashJson(VENDOR_RECORD)));

  await page.goto('/objects/vendor/rec-1');
  await expect(page.getByRole('heading', { level: 1, name: 'Acme' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
