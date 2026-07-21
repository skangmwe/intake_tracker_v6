import { expect, test } from '@playwright/test';

// End-to-end for slice 11 (Attachments). Runs in dev mode (SSO bypass); the API is mocked at the
// network boundary so the flow is deterministic without a seeded database or real Blob Storage.
// Flow: open a record, switch to the Attachments tab, see an existing file, upload a new file (it
// appears after the list refetch), attach an external link, and remove an attachment.

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

function attachment(overrides: Record<string, unknown>) {
  return {
    id: `att-${overrides.fileName}`,
    recordId: RECORD_ID,
    objectType: 'Request',
    fileName: 'brief.pdf',
    contentType: 'application/pdf',
    sizeBytes: 2048,
    isLink: false,
    uploadedAt: '2026-07-05T10:00:00Z',
    uploadedBy: ME.user.id,
    contentUrl: '/api/v1/attachments/att-1/content',
    ...overrides,
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  const attachments: Array<Record<string, unknown>> = [attachment({ fileName: 'existing.pdf' })];

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route('**/api/v1/workspaces/*/fields**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCHEMA) }),
  );
  await page.route(`**/api/v1/requests/${RECORD_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RECORD) }),
  );

  // Attachments list — reflects mutations made during the test.
  await page.route(`**/api/v1/records/${RECORD_ID}/attachments`, (route) => {
    if (route.request().method() === 'POST') {
      const uploaded = attachment({ fileName: 'newfile.pdf', id: 'att-new' });
      attachments.push(uploaded);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(uploaded) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(attachments) });
  });
  await page.route(`**/api/v1/records/${RECORD_ID}/attachments/link`, (route) => {
    const link = attachment({ fileName: 'Design spec', id: 'att-link', isLink: true, externalUrl: 'https://example.com/spec', sizeBytes: 0, contentType: 'text/uri-list' });
    attachments.push(link);
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(link) });
  });
  await page.route('**/api/v1/attachments/*', (route) => {
    if (route.request().method() === 'DELETE') {
      attachments.length = 0;
      return route.fulfill({ status: 204, body: '' });
    }
    return route.continue();
  });

  await page.reload();
});

test('upload, link, and remove attachments on a record', async ({ page }) => {
  await page.goto(`/requests/${RECORD_ID}`);
  await expect(page.getByRole('heading', { name: 'Meeting-notes action extraction' })).toBeVisible();

  await page.getByRole('tab', { name: 'Attachments' }).click();
  await expect(page.getByText('existing.pdf')).toBeVisible();

  // Upload a new file — it appears after the list refetch.
  await page.getByLabel('Choose files to upload').setInputFiles({
    name: 'newfile.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('hello'),
  });
  await expect(page.getByText('newfile.pdf')).toBeVisible();

  // Attach an external link.
  await page.getByRole('button', { name: 'Attach a link' }).click();
  await page.getByLabel('Link URL').fill('https://example.com/spec');
  await page.getByLabel('Title').fill('Design spec');
  await page.getByRole('button', { name: 'Attach link' }).click();
  await expect(page.getByText('Design spec')).toBeVisible();

  // Remove an attachment — the list empties.
  await page.getByRole('button', { name: 'Remove existing.pdf' }).click();
  await expect(page.getByText('No attachments yet.')).toBeVisible();
});
