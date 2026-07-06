import { expect, test } from '@playwright/test';

// End-to-end for slice 19 (Platform admin — S35 Crossing map · S36 Access · S37 Role labels · S39
// Firm-wide audit). Runs in dev mode (the SSO bypass); the API is mocked at the network boundary so
// the flows are deterministic without a seeded database. The signed-in user holds the Platform-admin
// grant, so the Platform nav section renders and each surface is reachable.

const WORKSPACE_ID = '1a150000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-0000000000aa';

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
  isPlatformAdmin: true,
  boundDashboardId: null,
};

const CROSSING_MAP = [
  {
    sourceFieldKey: 'business-value',
    sourceDisplayName: 'Business Value',
    sourceFieldType: 'Number',
    targetFieldKey: 'business-value',
    targetDisplayName: 'Business Value',
    targetFieldType: 'Number',
  },
];

const ROLE_LABELS = [{ roleLabelId: '11111111-0000-4000-8000-000000000001', label: 'InfoSec', sortOrder: 0 }];

const GRANTS = {
  grants: [
    {
      grantKind: 'PlatformAdmin',
      userId: USER_ID,
      displayName: 'Dana Admin',
      email: 'dana@mws.ai',
      workspaceId: null,
      workspaceName: null,
      grantedAt: '2026-07-01T10:00:00Z',
    },
  ],
};

const AUDIT_PAGE = {
  items: [
    {
      auditId: '22222222-0000-4000-8000-000000000001',
      workspaceId: WORKSPACE_ID,
      workspaceName: 'AI Solutions',
      recordId: 'AIS-00000001',
      objectType: 'Request',
      eventType: 'request.created',
      actorUserId: null,
      actorName: null,
      eventAt: '2026-07-02T10:00:00Z',
      payload: '{}',
    },
  ],
  totalCount: 1,
  page: 1,
  pageSize: 25,
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route('**/api/v1/platform/crossing-map', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CROSSING_MAP) }),
  );
  await page.route('**/api/v1/platform/role-labels', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ roleLabelId: '11111111-0000-4000-8000-000000000009', label: 'Records Manager', sortOrder: 1 }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROLE_LABELS) });
  });
  await page.route('**/api/v1/platform/access', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GRANTS) });
  });
  await page.route('**/api/v1/platform/audit/query', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(AUDIT_PAGE) }),
  );

  await page.reload();
});

test('a platform admin reads the crossing map', async ({ page }) => {
  await page.getByRole('link', { name: 'Crossing map' }).click();
  await expect(page).toHaveURL(/\/platform\/crossing-map$/);
  await expect(page.getByRole('heading', { name: 'Crossing map' })).toBeVisible();
  await expect(page.getByText(/read-only in this release/i)).toBeVisible();
  await expect(page.getByRole('table', { name: /crossing map/i })).toBeVisible();
});

test('a platform admin manages the role-label catalog', async ({ page }) => {
  await page.getByRole('link', { name: 'Role labels' }).click();
  await expect(page).toHaveURL(/\/platform\/role-labels$/);
  await expect(page.getByText('InfoSec')).toBeVisible();

  const addForm = page.getByRole('form', { name: 'Add a role label' });
  await addForm.getByRole('textbox').fill('Records Manager');
  await addForm.getByRole('button', { name: 'Add role label' }).click();
  // The list re-fetches after the add; the seeded list still renders (mock returns the same set).
  await expect(page.getByText('InfoSec')).toBeVisible();
});

test('a platform admin reads the privileged-grants directory', async ({ page }) => {
  await page.getByRole('link', { name: 'Access provisioning' }).click();
  await expect(page).toHaveURL(/\/platform\/access$/);
  await expect(page.getByText('Dana Admin')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revoke' })).toBeVisible();
});

test('a platform admin reads the firm-wide audit log', async ({ page }) => {
  await page.getByRole('link', { name: 'Firm-wide audit' }).click();
  await expect(page).toHaveURL(/\/platform\/audit$/);
  await expect(page.getByRole('table', { name: /firm-wide audit/i })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'AIS-00000001' })).toBeVisible();
});
