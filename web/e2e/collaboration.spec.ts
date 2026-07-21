import { expect, test } from '@playwright/test';

// End-to-end for slice 6 (similar-requests nudge + comments & activity thread). Runs in dev mode
// (SSO bypass); the API is mocked at the network boundary so the flow is deterministic without a
// seeded database. Flow 1: as a member types an intake, the similar-requests panel surfaces a match
// that can be linked as related. Flow 2: a member opens a record's Activity tab, sees the interleaved
// thread, posts a comment, and the comment appears.

const WORKSPACE_ID = '1a150000-0000-4000-8000-000000000001';
const LIFECYCLE_ID = '00000000-0000-0000-0000-00000000010c';
const RECORD_ID = 'AIS-00000001';

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
  { key: 'execution', label: 'Execution' },
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

// v2 (slice 27): the intake "Lifecycle" picker reads this lightweight list. One lifecycle → hidden.
const LIFECYCLE_SUMMARIES = [{ id: LIFECYCLE_ID, name: 'Standard AI build', isDefault: true }];

const RECORD = {
  id: RECORD_ID,
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
  name: 'Meeting-notes action extraction',
  description: 'Pull action items out of meetings.',
  fields: { name: 'Meeting-notes action extraction' },
  eTag: 'AAAAAAAAAGQ=',
};

const SIMILAR = [
  { id: 'AIS-00000042', name: 'Contract clause finder', stage: 'execution', origin: 'AI Solutions' },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  // A comment posted mid-test is appended so the thread refetch shows it.
  const thread: Array<Record<string, unknown>> = [
    { kind: 'event', comment: null, event: { eventType: 'request.created', eventAt: '2026-07-01T09:00:00Z', actorUserId: null, summary: 'Request created' } },
  ];

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
  await page.route('**/api/v1/workspaces/*/requests/similar**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SIMILAR) }),
  );
  await page.route(`**/api/v1/requests/${RECORD_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RECORD) }),
  );
  await page.route(`**/api/v1/records/${RECORD_ID}/thread`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(thread) }),
  );
  await page.route(`**/api/v1/records/${RECORD_ID}/comments`, (route) => {
    const posted = { id: 'c-new', recordId: RECORD_ID, objectType: 'Request', authorUserId: ME.user.id, body: 'Ship it', mentionedUserIds: [], createdAt: '2026-07-04T14:00:00Z' };
    thread.push({ kind: 'comment', comment: posted, event: null });
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(posted) });
  });

  await page.reload();
});

test('intake similar-requests nudge surfaces a match that can be linked as related', async ({ page }) => {
  await page.goto('/requests/new');
  await expect(page.getByRole('heading', { name: 'New request' })).toBeVisible();

  // Typing the name drives the debounced similar query; the match appears in the aside.
  await page.getByLabel('Name').fill('Contract clause finder');
  await expect(page.getByText('Contract clause finder')).toBeVisible();

  await page.getByRole('button', { name: 'Link as related' }).click();
  await expect(page.getByText('Linked as related')).toBeVisible();
});

test('open a record, view the activity thread, and post a comment', async ({ page }) => {
  await page.goto(`/requests/${RECORD_ID}`);
  await expect(page.getByRole('heading', { name: 'Meeting-notes action extraction' })).toBeVisible();

  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByText('Request created')).toBeVisible();

  await page.getByLabel('Add a comment').fill('Ship it');
  await page.getByRole('button', { name: 'Post comment' }).click();

  // The posted comment appears in the refreshed thread.
  await expect(page.getByText('Ship it')).toBeVisible();
  await expect(page.getByText('You commented')).toBeVisible();
});
