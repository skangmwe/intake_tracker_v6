import { expect, test } from '@playwright/test';

// End-to-end for the S38 workspace-provisioning redesign (list → full-screen wizard). Runs in dev
// mode (the SSO bypass); the API is mocked at the network boundary — same convention as
// platform-admin.spec.ts and platform-announcements.spec.ts — so the flow is deterministic without a
// seeded database or a real platform-admin grant. A platform admin opens Platform → Workspaces, sees
// the rich table, launches the New workspace wizard, steps Template → Review → Details, fills in the
// new workspace's details, creates it, and lands back on the list.

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

const INITIAL_ROWS = [
  {
    id: WORKSPACE_ID,
    name: 'AI Solutions',
    kind: 'ai-solutions',
    prefix: 'AIS',
    ownerDisplayName: 'Priya Raman',
    memberCount: 127,
    provisionedAt: '2026-01-01T00:00:00Z',
    isArchived: false,
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  const rows: Array<Record<string, unknown>> = [...INITIAL_ROWS];

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );

  // GET /v1/workspaces (list) and POST /v1/workspaces (provision) share one URL — branch on method.
  await page.route('**/api/v1/workspaces', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as {
        name: string;
        prefix: string;
        initialAdminEmail: string;
      };
      rows.push({
        id: `1a150000-0000-4000-8000-00000000000${rows.length + 1}`,
        name: body.name,
        kind: 'pg-dept',
        prefix: body.prefix,
        ownerDisplayName: body.initialAdminEmail,
        memberCount: 1,
        provisionedAt: '2026-07-27T00:00:00Z',
        isArchived: false,
      });
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: rows[rows.length - 1]!.id,
          name: body.name,
          kind: 'pg-dept',
          prefix: body.prefix,
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows),
    });
  });

  await page.reload();
});

test('list → new workspace wizard → create → back to list', async ({ page }) => {
  await page.goto('/platform/workspaces');

  // The rich table and New workspace action are both present.
  await expect(page.getByRole('table', { name: /workspaces/i })).toBeVisible();
  await expect(page.getByText('AI Solutions', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /new workspace/i })).toBeVisible();
  await page.getByRole('link', { name: /new workspace/i }).click();

  // Full-screen wizard — Template step.
  await expect(page).toHaveURL(/\/platform\/workspaces\/new$/);
  await expect(page.getByText(/PG\/Dept Template/i)).toBeVisible();

  // Template → Review.
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByText('Requests', { exact: true })).toBeVisible();

  // Review → Details.
  await page.getByRole('button', { name: /continue/i }).click();

  const unique = `E2E${Date.now().toString().slice(-6)}`;
  await page.getByLabel(/workspace name/i).fill(`E2E ${unique}`);
  await page.getByLabel(/workspace owner/i).fill('admin@mws.ai');
  await page.getByLabel(/record id prefix/i).fill(unique);
  await page.getByRole('button', { name: /create workspace/i }).click();

  // Lands back on the list.
  await expect(page).toHaveURL(/\/platform\/workspaces$/);
});
