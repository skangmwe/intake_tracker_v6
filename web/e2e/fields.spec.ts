import { expect, test } from '@playwright/test';

// End-to-end for slice 3 (Fields & objects schema engine). Runs in dev mode (the SSO bypass); the
// API is mocked at the network boundary so the flow is deterministic without a seeded database. A
// workspace admin opens Fields & objects, sees the field list, and opens the add-field editor.

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

const SCHEMA = {
  workspaceId: WORKSPACE_ID,
  objectType: 'Request',
  fields: [
    {
      id: '00000000-0000-0000-0000-0000000000f1',
      workspaceId: WORKSPACE_ID,
      objectType: 'Request',
      fieldKey: 'name',
      displayName: 'Name',
      fieldType: 'ShortText',
      category: 'Crossing',
      section: 'Intake',
      helpText: null,
      isRequired: true,
      isReadOnly: false,
      isPlatformDefined: false,
      platformFieldKey: null,
      visibleStages: null,
      crossingToFieldKey: null,
      minValue: null,
      maxValue: null,
      allowNewValues: false,
      sortOrder: 1,
      isRetired: false,
      options: [],
      rules: [],
      derived: null,
      createdAt: '2026-07-03T13:00:00Z',
      updatedAt: '2026-07-03T13:00:00Z',
    },
  ],
  platformFields: [
    {
      id: '00000000-0000-0000-0000-0000000000a1',
      fieldKey: 'legacy-id',
      displayName: 'Legacy ID',
      fieldType: 'Text',
      category: 'Platform',
      isSystemImmutable: false,
      hasManualWritePath: true,
      selectOptions: null,
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route('**/api/v1/workspaces/*/fields**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCHEMA) });
    }
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(SCHEMA.fields[0]) });
  });

  await page.reload();
});

test('a workspace admin sees the field schema and can open the add-field editor', async ({ page }) => {
  await page.getByRole('link', { name: 'Fields & objects' }).click();
  await expect(page).toHaveURL(/\/admin\/fields$/);

  // The seeded field is listed, and the platform read-only band shows the central field.
  await expect(page.getByRole('heading', { name: 'Fields & objects' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Name' })).toBeVisible();
  await expect(page.getByText('Legacy ID')).toBeVisible();

  // Opening the editor reveals the add-field dialog.
  await page.getByRole('button', { name: 'Add field' }).click();
  await expect(page.getByRole('dialog', { name: 'Add field' })).toBeVisible();
});

test('switching to the Task object type keeps the admin surface intact', async ({ page }) => {
  await page.getByRole('link', { name: 'Fields & objects' }).click();
  await page.getByRole('tab', { name: 'Task' }).click();
  await expect(page.getByRole('tab', { name: 'Task' })).toHaveAttribute('aria-selected', 'true');
});
