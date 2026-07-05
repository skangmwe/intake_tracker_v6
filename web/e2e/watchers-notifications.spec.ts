import { expect, test } from '@playwright/test';

// End-to-end for slice 12 (Watchers + Notifications). Runs in dev mode (SSO bypass); the API is mocked
// at the network boundary so the flow is deterministic without a seeded database. Two flows:
//   1. Watchers — open a record, switch to the Watchers & alerts tab, subscribe (the toggle flips to
//      "Watching" and the caller joins the roster after the refetch).
//   2. Bell — the top-bar bell shows an unread badge + the feed; "Mark all read" clears the badge.

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
  { key: 'build', label: 'Build' },
];

const SCHEMA = {
  workspaceId: WORKSPACE_ID,
  objectType: 'Request',
  fields: [
    {
      id: 'fd-name',
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
      sortOrder: 10,
      isRetired: false,
      options: [],
      rules: [],
      derived: null,
      createdAt: '2026-07-03T13:00:00Z',
      updatedAt: '2026-07-03T13:00:00Z',
    },
  ],
  platformFields: [],
};

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

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  // Mutable server state the routes read/write so the flows are realistic.
  const state = {
    isWatching: false,
    unread: 2,
  };

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route('**/api/v1/workspaces/*/fields**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCHEMA) }),
  );
  await page.route(`**/api/v1/requests/${RECORD_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RECORD) }),
  );

  // Watchers — GET reflects the current subscription state; POST subscribes the caller.
  await page.route(`**/api/v1/records/${RECORD_ID}/watchers`, (route) => {
    if (route.request().method() === 'POST') {
      state.isWatching = true;
      return route.fulfill({ status: 204, body: '' });
    }
    const body = {
      isWatching: state.isWatching,
      watchers: state.isWatching
        ? [{ userId: ME.user.id, displayName: ME.user.displayName, subscribedAt: '2026-07-05T10:00:00Z' }]
        : [],
    };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  // Notifications — unread count + feed + mark-all-read.
  await page.route('**/api/v1/notifications/unread-count', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: state.unread }) }),
  );
  await page.route('**/api/v1/notifications/query', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'n1',
            category: 'gate-decided',
            recordId: RECORD_ID,
            summary: 'A gate decision was recorded on AIS-00000001',
            createdAt: '2026-07-05T10:00:00Z',
            sourceEventId: '11111111-1111-4111-8111-111111111111',
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 20,
      }),
    }),
  );
  await page.route('**/api/v1/notifications/mark-all-read', (route) => {
    state.unread = 0;
    return route.fulfill({ status: 204, body: '' });
  });

  await page.reload();
});

test('subscribe to a record via the Watchers & alerts tab', async ({ page }) => {
  await page.goto(`/requests/${RECORD_ID}`);
  await expect(page.getByRole('heading', { name: 'Meeting-notes action extraction' })).toBeVisible();

  await page.getByRole('tab', { name: 'Watchers & alerts' }).click();
  await expect(page.getByText('No one is watching this record yet.')).toBeVisible();

  // Subscribe — the toggle flips and the caller joins the roster after the refetch.
  await page.getByRole('button', { name: 'Watch this record' }).click();
  await expect(page.getByRole('button', { name: 'Watching' })).toBeVisible();
  await expect(page.getByText('Local Developer')).toBeVisible();

  // The static firm-default rules are shown too.
  await expect(page.getByText('Gate decisions')).toBeVisible();
});

test('the bell shows unread notifications and clears them on mark-all-read', async ({ page }) => {
  await page.goto(`/requests/${RECORD_ID}`);

  // The bell carries the unread count in its accessible name.
  const bell = page.getByRole('button', { name: /Notifications/ });
  await expect(page.getByRole('button', { name: 'Notifications, 2 unread' })).toBeVisible();

  await bell.click();
  await expect(page.getByText('A gate decision was recorded on AIS-00000001')).toBeVisible();

  // Mark all read — the badge count clears (the trigger name drops the unread suffix).
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible();
});
