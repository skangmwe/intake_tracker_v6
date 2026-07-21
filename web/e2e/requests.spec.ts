import { expect, test } from '@playwright/test';

// End-to-end for slice 5 (Requests core — S2/S3/S4). Runs in dev mode (SSO bypass); the API is
// mocked at the network boundary so the flow is deterministic without a seeded database. A member
// opens the Requests list, creates a request via the intake form, lands on the record detail,
// edits an Intake field, and confirms the record survives a page reload.

const WORKSPACE_ID = '1a150000-0000-4000-8000-000000000001';
const LIFECYCLE_ID = '00000000-0000-0000-0000-00000000010c';
const NEW_ID = 'AIS-00000002';

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
      level: 'Member',
      isDashboardViewer: false,
      boundDashboardId: null,
    },
  ],
  isPlatformAdmin: false,
  boundDashboardId: null,
};

const STAGES = [
  { key: 'intake', label: 'Intake' },
  { key: 'triage', label: 'Triage' },
  { key: 'execution', label: 'Execution' },
  { key: 'validation', label: 'Validation' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'stabilization', label: 'Stabilization' },
];

function field(overrides: Record<string, unknown>) {
  return {
    id: `fd-${overrides.fieldKey}`,
    workspaceId: WORKSPACE_ID,
    objectType: 'Request',
    displayName: 'Field',
    fieldType: 'ShortText',
    category: 'Crossing',
    section: 'Intake',
    helpText: null,
    isRequired: false,
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
    ...overrides,
  };
}

const SCHEMA = {
  workspaceId: WORKSPACE_ID,
  objectType: 'Request',
  fields: [
    field({ fieldKey: 'name', displayName: 'Name', isRequired: true, sortOrder: 10 }),
    field({ fieldKey: 'description', displayName: 'Description', fieldType: 'LongText', sortOrder: 11 }),
    field({ fieldKey: 'businessValue', displayName: 'Business Value', fieldType: 'Number', section: 'Value mapping', minValue: 1, maxValue: 5, sortOrder: 34 }),
    field({ fieldKey: 'efficiencyGain', displayName: 'Efficiency Gain', fieldType: 'Number', section: 'Value mapping', minValue: 1, maxValue: 5, sortOrder: 35 }),
    field({ fieldKey: 'levelOfEffort', displayName: 'Level of Effort', fieldType: 'Number', section: 'Value mapping', minValue: 1, maxValue: 5, sortOrder: 36 }),
    field({ fieldKey: 'triageNotes', displayName: 'Triage Notes', fieldType: 'LongText', section: 'Triage', sortOrder: 55 }),
  ],
  platformFields: [],
};

const LIFECYCLE_CONFIG = {
  workspaceId: WORKSPACE_ID,
  lifecycles: [
    {
      id: LIFECYCLE_ID,
      name: 'Standard AI build',
      requestType: 'Full build',
      isDefault: true,
      sortOrder: 0,
      stages: STAGES.map((stage, index) => ({
        id: `st-${stage.key}`,
        key: stage.key,
        label: stage.label,
        statusCategory: 'Execution',
        sortOrder: index,
      })),
      gates: [],
    },
  ],
  roleLabels: [],
  approverTeams: [],
};

// v2 (slice 27): the intake "Lifecycle" picker reads the lightweight list. One lifecycle → the
// picker is hidden and the create defaults to it.
const LIFECYCLE_SUMMARIES = [{ id: LIFECYCLE_ID, name: 'Standard AI build', isDefault: true }];

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: NEW_ID,
    workspaceId: WORKSPACE_ID,
    origin: 'AI Solutions',
    createdAt: '2026-07-04T13:00:00Z',
    updatedAt: '2026-07-04T13:00:00Z',
    createdBy: ME.user.id,
    updatedBy: ME.user.id,
    lifecycleId: LIFECYCLE_ID,
    stages: STAGES,
    stage: 'intake',
    hold: { held: false },
    displayStatus: 'Intake',
    name: 'Contract clause finder',
    description: 'Surface the right clause from the precedent library.',
    fields: { name: 'Contract clause finder', description: 'Surface the right clause from the precedent library.' },
    eTag: 'AAAAAAAAAGQ=',
    ...overrides,
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route('**/api/v1/workspaces/*/fields**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCHEMA) }),
  );
  await page.route('**/api/v1/workspaces/*/lifecycle', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIFECYCLE_CONFIG) }),
  );
  await page.route('**/api/v1/workspaces/*/lifecycles', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIFECYCLE_SUMMARIES) }),
  );
  await page.route('**/api/v1/workspaces/*/drafts', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route('**/api/v1/workspaces/*/requests/query', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'AIS-00000001',
            eTag: 'AAAAAAAAAGM=',
            columns: {
              id: 'AIS-00000001',
              name: 'Meeting-notes action extraction',
              desc: 'Pull action items out of meetings.',
              stage: 'intake',
              origin: 'AI Solutions',
              analyst: 'Priya Raman',
              priority: 5,
              due: '2026-07-16',
            },
            slaStatus: 'OnTrack',
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 25,
      }),
    }),
  );
  await page.route('**/api/v1/workspaces/*/requests', (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(record()) }),
  );
  await page.route(`**/api/v1/requests/${NEW_ID}`, (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(record()) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(record()) });
  });

  await page.reload();
});

test('requests list shows records and links to create', async ({ page }) => {
  await page.goto('/requests');
  await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();
  await expect(page.getByText('Meeting-notes action extraction')).toBeVisible();

  await page.getByRole('button', { name: /create request/i }).click();
  await expect(page).toHaveURL(/\/requests\/new$/);
  await expect(page.getByRole('heading', { name: 'New request' })).toBeVisible();
});

test('create a request, land on its detail, and survive a reload', async ({ page }) => {
  await page.goto('/requests/new');
  await expect(page.getByRole('heading', { name: 'New request' })).toBeVisible();

  await page.getByLabel('Name').fill('Contract clause finder');
  await page.getByLabel('Description').fill('Surface the right clause from the precedent library.');
  await page.getByRole('button', { name: /submit request/i }).click();

  // Lands on the record detail for the minted id.
  await expect(page).toHaveURL(new RegExp(`/requests/${NEW_ID}$`));
  await expect(page.getByRole('heading', { name: 'Contract clause finder' })).toBeVisible();

  // The record survives a full reload (data persistence).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Contract clause finder' })).toBeVisible();
});
