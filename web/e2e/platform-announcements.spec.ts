import { expect, test } from '@playwright/test';

// End-to-end for the platform broadcast slice. Runs in dev mode (the SSO bypass); the API is mocked at the
// network boundary so the flow is deterministic without a seeded database. A platform admin opens
// Platform → Announcements, posts a broadcast to all workspaces, sees it land as one grouped row showing
// "All workspaces", then retires it and sees it leave the list.

const WORKSPACE_ID = '1a150000-0000-4000-8000-000000000001';

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

const WORKSPACES = [
  { id: WORKSPACE_ID, name: 'AI Solutions', kind: 'ai-solutions' },
  { id: '1a150000-0000-4000-8000-000000000002', name: 'Litigation', kind: 'pg-dept' },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  const broadcasts: Array<Record<string, unknown>> = [];
  let nextId = 1;

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route('**/api/v1/platform/workspaces', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WORKSPACES) }),
  );
  await page.route('**/api/v1/platform/announcements/query', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: broadcasts, totalCount: broadcasts.length, page: 1, pageSize: 100 }),
    }),
  );
  await page.route('**/api/v1/platform/announcements', (route) => {
    const body = route.request().postDataJSON() as { title: string; body: string };
    const broadcastId = `b-${nextId++}`;
    broadcasts.push({
      broadcastId,
      title: body.title,
      body: body.body,
      pinned: false,
      status: 'Active',
      author: ME.user.id,
      authorName: 'Local Developer',
      postedAt: '2026-07-05T09:31:00Z',
      workspaceCount: WORKSPACES.length,
    });
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ broadcastId, workspaceCount: WORKSPACES.length }),
    });
  });
  await page.route('**/api/v1/platform/announcements/*/retire', (route) => {
    broadcasts.length = 0;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.reload();
});

test('a platform admin broadcasts to all workspaces, then retires it', async ({ page }) => {
  await page.goto('/platform/announcements');
  await expect(page.getByText('No broadcasts yet')).toBeVisible();

  // Post a broadcast to all workspaces (the default target).
  await page.getByRole('button', { name: 'New broadcast' }).click();
  await expect(page.getByRole('dialog', { name: 'New broadcast' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'All workspaces' })).toBeChecked();
  await page.getByLabel('Title').fill('Firm-wide maintenance');
  await page.getByLabel('Body').fill('Systems briefly offline Saturday.');
  await page.getByRole('button', { name: 'Post' }).click();

  // It lands as one grouped row showing the "All workspaces" summary.
  await expect(page.getByText('Firm-wide maintenance')).toBeVisible();
  await expect(page.getByText('All workspaces')).toBeVisible();

  // Retire it — the row leaves the active list.
  await page.getByText('Firm-wide maintenance').click();
  await page.getByRole('button', { name: 'Retire now' }).click();
  await page.getByRole('button', { name: 'Retire broadcast' }).click();

  await expect(page.getByText('No broadcasts yet')).toBeVisible();
});
