import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// End-to-end for slice 16 (CSV Import & Export). Runs in dev mode (SSO bypass); the API is mocked at
// the network boundary so the flow is deterministic without a seeded database. Flow: a workspace admin
// on S28 uploads a CSV, sees the "completed with issues" status + the per-row report, then picks a
// saved view and exports it (download confirmed).

const WORKSPACE_ID = '1a150000-0000-4000-8000-000000000001';

const ME = {
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    displayName: 'Local Developer',
    email: 'dev@mws.ai',
    lastSignInAt: '2026-07-06T13:00:00Z',
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

const IMPORT_STATUS = {
  id: 'imp-1',
  workspaceId: WORKSPACE_ID,
  startedBy: '00000000-0000-0000-0000-000000000001',
  startedAt: '2026-07-06T13:00:00Z',
  status: 'CompletedWithErrors',
  totalRows: 3,
  landedRows: 2,
  flaggedRows: [
    { rowIndex: 3, reasons: [{ code: 'missing-required', message: 'A request name is required.', field: 'name' }] },
  ],
};

const SAVED_VIEWS = [
  {
    id: '5a5e0000-0000-4000-8000-000000000001',
    workspaceId: WORKSPACE_ID,
    objectType: 'Request',
    name: 'All open requests',
    scope: 'shared',
    isDefault: true,
    columns: ['id', 'name'],
    filters: {},
    sort: [],
    ownerUserId: '00000000-0000-0000-0000-000000000001',
    createdBy: '00000000-0000-0000-0000-000000000001',
    createdAt: '2026-07-06T13:00:00Z',
    updatedAt: '2026-07-06T13:00:00Z',
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route(/\/api\/v1\/workspaces\/[^/]+\/saved-views/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAVED_VIEWS) }),
  );
  await page.route(/\/api\/v1\/workspaces\/[^/]+\/imports\/csv$/, (route) =>
    route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ importId: 'imp-1', status: 'Processing' }) }),
  );
  await page.route(/\/api\/v1\/imports\/imp-1$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(IMPORT_STATUS) }),
  );
  await page.route(/\/api\/v1\/exports$/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/csv', body: 'Record ID,Name\r\nAIS-00000001,Helper\r\n' }),
  );

  await page.reload();
});

test('admin imports a CSV, sees the per-row report, and exports a saved view', async ({ page }) => {
  await page.goto('/admin/import-export');

  // Import — choose a CSV and submit.
  await page.getByLabel('CSV file').setInputFiles({
    name: 'import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name\nAlpha'),
  });
  await page.getByRole('button', { name: 'Import CSV' }).click();

  // The status + the flagged row surface.
  await expect(page.getByText(/Completed with issues/)).toBeVisible();
  await expect(page.getByText('A request name is required.')).toBeVisible();

  // Export — pick the saved view and download it.
  await page.getByRole('button', { name: 'Export view' }).click();
  await expect(page.getByText('Your export has downloaded.')).toBeVisible();

  const results = await new AxeBuilder({ page }).include('.import-export-page').analyze();
  expect(results.violations).toEqual([]);
});
