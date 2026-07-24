import { expect, test } from '@playwright/test';

// End-to-end for the S23 manage-announcements slice (announcements reconciliation, slice 3). Runs in
// dev mode (the SSO bypass); the API is mocked at the network boundary so the flow is deterministic
// without a seeded database. A workspace admin opens Announcements, posts an Active notice and a
// Scheduled notice, and sees both land in the table with the right status pill.

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

const MEMBERS = {
  members: [
    {
      userId: '00000000-0000-0000-0000-000000000001',
      displayName: 'Local Developer',
      email: 'dev@mws.ai',
      level: 'WorkspaceAdmin',
      isDisabled: false,
      lastActiveAt: '2026-07-03T13:00:00Z',
      status: 'Active',
      invitationId: null,
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  // A mutable list the mocked API grows on each create, so the table reflects new posts after a refetch.
  const announcements: Array<Record<string, unknown>> = [];
  let nextId = 1;

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route('**/api/v1/workspaces/*/members', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MEMBERS) }),
  );
  await page.route('**/api/v1/workspaces/*/announcements/query', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: announcements,
        totalCount: announcements.length,
        page: 1,
        pageSize: 100,
      }),
    }),
  );
  await page.route('**/api/v1/workspaces/*/announcements', (route) => {
    const body = route.request().postDataJSON() as { title: string; status?: string };
    const created = {
      id: `a-${nextId++}`,
      title: body.title,
      bodySnippet: body.title,
      pinned: false,
      status: body.status === 'Scheduled' ? 'Scheduled' : 'Active',
      author: ME.user.id,
      authorName: 'Local Developer',
      postedAt: '2026-07-05T09:31:00Z',
    };
    announcements.push(created);
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(created),
    });
  });

  await page.reload();
});

test('a workspace admin posts an Active and a Scheduled announcement and sees them in the table', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'Announcements' }).click();
  await expect(page).toHaveURL(/\/admin\/announcements$/);
  await expect(page.getByRole('heading', { name: 'Announcements' })).toBeVisible();
  await expect(page.getByText('No announcements yet')).toBeVisible();

  // Post an Active announcement (publish now).
  await page.getByRole('button', { name: 'New announcement' }).click();
  await expect(page.getByRole('dialog', { name: 'New announcement' })).toBeVisible();
  await page.getByLabel('Title').fill('Q3 intake freeze');
  await page.getByLabel('Body').fill('Intake pauses 14–18 Jul.');
  await page.getByRole('button', { name: 'Add' }).click();

  await expect(page.getByText('Q3 intake freeze')).toBeVisible();
  await expect(page.getByText('Active')).toBeVisible();

  // Post a Scheduled announcement — the date-time field appears once Scheduled is chosen.
  await page.getByRole('button', { name: 'New announcement' }).click();
  await page.getByLabel('Title').fill('Summer office hours');
  await page.getByLabel('Body').fill('Reduced hours in August.');
  await page.getByLabel('Status').selectOption('Scheduled');
  await page.getByLabel('Publish date & time').fill('2030-01-01T09:00');
  await page.getByRole('button', { name: 'Add' }).click();

  await expect(page.getByText('Summer office hours')).toBeVisible();
  await expect(page.getByText('Scheduled')).toBeVisible();
});
