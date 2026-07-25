import { expect, test, type Page } from '@playwright/test';

// End-to-end for SP2 custom-object records (Slice C, merged with Slice B's browse coverage). Runs in
// dev mode (SSO bypass); the API is mocked at the network boundary so the flow is deterministic without
// a seeded database. A member browses a custom object's records, filters the list, then creates a
// record, lands on its detail, edits a field (autosave), confirms the edit survives a reload, and
// deletes it — returning to the list. Saved-view save/reapply is covered by the saved-views feature
// tests and the list unit test; this flow focuses on the records CRUD lifecycle.

const WS = '1a150000-0000-4000-8000-000000000001';
const OBJ_ID = '00000000-0000-4000-8000-0000000000d1';
const R1 = '00000000-0000-4000-8000-0000000000e1';
const R2 = '00000000-0000-4000-8000-0000000000e2';

const ME = {
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    displayName: 'Local Developer',
    email: 'dev@mws.ai',
    lastSignInAt: '2026-07-24T13:00:00Z',
    isDisabled: false,
    theme: 'light',
  },
  memberships: [
    {
      workspaceId: WS,
      workspaceName: 'AI Solutions',
      workspaceKind: 'ai-solutions',
      workspacePrefix: 'AIS',
      level: 'Member',
      isDashboardViewer: false,
      boundDashboardId: null,
    },
  ],
  isPlatformAdmin: false,
  boundDashboardId: null,
};

const VENDOR_OBJECT = {
  id: OBJ_ID,
  workspaceId: WS,
  objectKey: 'vendor',
  name: 'Vendor',
  pluralLabel: 'Vendors',
  description: null,
  isSystem: false,
  recordsCount: 1,
  fieldsCount: 2,
  createdAt: '2026-07-24T10:00:00Z',
  updatedAt: '2026-07-24T10:00:00Z',
};

function field(overrides: Record<string, unknown>) {
  return {
    id: `fd-${overrides.fieldKey}`,
    workspaceId: WS,
    objectType: 'vendor',
    displayName: 'Field',
    fieldType: 'ShortText',
    category: 'Crossing',
    section: 'Details',
    helpText: null,
    isRequired: false,
    isReadOnly: false,
    location: 'LocalWorkspace',
    isLocal: true,
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
    createdAt: '2026-07-24T10:00:00Z',
    updatedAt: '2026-07-24T10:00:00Z',
    ...overrides,
  };
}

const SCHEMA = {
  workspaceId: WS,
  objectType: 'vendor',
  fields: [
    field({
      fieldKey: 'tier',
      displayName: 'Tier',
      fieldType: 'SingleSelect',
      sortOrder: 1,
      options: [
        { id: 'o1', value: 'gold', label: 'Gold', sortOrder: 0 },
        { id: 'o2', value: 'silver', label: 'Silver', sortOrder: 1 },
      ],
    }),
    field({ fieldKey: 'spend', displayName: 'Spend', fieldType: 'Number', sortOrder: 2 }),
  ],
  platformFields: [],
};

/** A pre-existing record so the browse list is non-empty. */
const EXISTING_ROW = { id: R1, name: 'Globex', fields: { tier: 'silver', spend: 42 }, eTag: 'v0' };

/** Common API stubs shared by every test. Detail state is mutable so an edit survives a reload. */
async function stubApi(page: Page) {
  const created = {
    id: R2,
    objectDefinitionId: OBJ_ID,
    name: 'Acme',
    fields: {} as Record<string, unknown>,
    createdAt: '2026-07-24T12:00:00Z',
    updatedAt: '2026-07-24T12:00:00Z',
    createdBy: 'Local Developer',
    eTag: 'v1',
  };

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route('**/api/v1/workspaces/*/objects', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([VENDOR_OBJECT]) }),
  );
  await page.route('**/api/v1/workspaces/*/fields**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCHEMA) }),
  );
  await page.route('**/api/v1/workspaces/*/saved-views**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );

  // Record by id: GET returns the current state, PATCH mutates it, DELETE removes it. Registered
  // before the /query route so the last-registered /query handler wins for the query URL.
  await page.route('**/api/v1/workspaces/*/objects/*/records/*', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      const body = route.request().postDataJSON() as { name: string; fields: Record<string, unknown> };
      created.name = body.name;
      created.fields = body.fields;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created) });
    }
    if (method === 'DELETE') {
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created) });
  });

  // List query (registered after /records/* so it takes precedence for the query URL).
  await page.route('**/api/v1/workspaces/*/objects/*/records/query', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [EXISTING_ROW], totalCount: 1, page: 1, pageSize: 25 }),
    }),
  );

  // Create (POST) — seed the mutable record from the submitted body.
  await page.route('**/api/v1/workspaces/*/objects/*/records', (route) => {
    const body = route.request().postDataJSON() as { name: string; fields: Record<string, unknown> };
    created.name = body.name;
    created.fields = body.fields;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await stubApi(page);
  await page.reload();
});

test('browse a custom object and filter its records', async ({ page }) => {
  await page.goto('/objects/vendor');

  // The list renders the object's records.
  await expect(page.getByRole('heading', { name: 'Vendors' })).toBeVisible();
  await expect(page.getByText('Globex')).toBeVisible();

  // Filtering the Spend column adds an active filter pill (the query refetches server-side).
  await page.getByRole('button', { name: 'Filter Spend' }).click();
  await page.getByPlaceholder('e.g. >5 or =7').fill('>3');
  await expect(page.getByText('Spend > 3')).toBeVisible();
});

test('create, edit and delete a custom record', async ({ page }) => {
  await page.goto('/objects/vendor');

  // Create.
  await page.getByRole('button', { name: /New record/ }).click();
  await expect(page).toHaveURL(/\/objects\/vendor\/new$/);
  await expect(page.getByRole('heading', { name: 'New Vendor' })).toBeVisible();

  await page.getByLabel('Name').fill('Acme');
  await page.getByRole('combobox', { name: 'Tier (optional)' }).selectOption('gold');
  await page.getByRole('button', { name: 'Create record' }).click();

  // Lands on the new record's detail.
  await expect(page).toHaveURL(new RegExp(`/objects/vendor/${R2}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Acme' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Tier (optional)' })).toHaveValue('gold');

  // Edit a field — autosave confirms.
  await page.getByRole('combobox', { name: 'Tier (optional)' }).selectOption('silver');
  await expect(page.getByText('All changes saved')).toBeVisible();

  // The edit survives a full reload (persistence).
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Tier (optional)' })).toHaveValue('silver');

  // Delete — confirm inline, then land back on the list.
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete record' }).click();
  await expect(page).toHaveURL(/\/objects\/vendor$/);
  await expect(page.getByRole('heading', { name: 'Vendors' })).toBeVisible();
});
