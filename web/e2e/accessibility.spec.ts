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
        columns: ['ID', 'Name', 'Stage', 'Dept/PG/Client', 'Assigned analyst', 'Priority', 'Due date'],
        count: 1,
        rows: [
          { id: 'REQ-1', name: 'Alpha', stage: 'Intake', origin: 'Tax', analyst: 'M. Chen', priority: 5, due: '2026-07-01' },
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

  await page.goto(`/dashboards/${DASHBOARD_ID}`);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
