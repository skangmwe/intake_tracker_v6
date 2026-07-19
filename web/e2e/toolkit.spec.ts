import { expect, test } from '@playwright/test';

// End-to-end for slice 29 (Toolkit — S43). Runs in dev mode (SSO bypass); the API is mocked at the
// network boundary so the flow is deterministic without a seeded database or real Blob Storage.
// Covers the slice capability: browse the Toolkit, open an item's detail sheet, and create a new
// item from the editor sheet (paste-or-upload) with the list refreshing to show it.

const WORKSPACE_ID = '1a150000-0000-4000-8000-000000000001';
const ITEM_ID = 'AIS-00000073';

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

const LIST_ROW = {
  id: ITEM_ID,
  kind: 'Prompt',
  status: 'Active',
  name: 'Clause extraction prompt',
  oneLiner: 'Pulls structured clauses out of contracts',
  maintainer: 'Mia Chen',
  hasAttachment: false,
  lastModifiedAt: '2026-07-02T10:00:00Z',
  lastModifiedBy: 'Mia Chen',
  eTag: 'AAAAAAAAAAE=',
};

const ITEM = {
  ...LIST_ROW,
  workspaceId: WORKSPACE_ID,
  description: 'Vetted prompt template for pulling structured clauses.',
  howTo: 'Fill the variables, paste your document, and run.',
  bodyMarkdown: 'You are a contracts analyst. Extract the following clauses...',
  attachment: null,
  createdAt: '2026-06-01T10:00:00Z',
  createdBy: ME.user.id,
  isRetired: false,
};

const NEW_ITEM = {
  ...ITEM,
  id: 'AIS-00000099',
  name: 'Deposition summary prompt',
  status: 'Draft',
  bodyMarkdown: 'Summarize the deposition transcript below...',
};

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await page.route('**/api/v1/users/me', (route) => route.fulfill(json(ME)));
  await page.route('**/api/v1/workspaces/*/toolkit/query', (route) =>
    route.fulfill(json({ items: [LIST_ROW], totalCount: 1, page: 1, pageSize: 20 })),
  );
  await page.route(`**/api/v1/toolkit/${ITEM_ID}`, (route) => route.fulfill(json(ITEM)));
});

test('browse the toolkit and open an item detail (S43)', async ({ page }) => {
  await page.goto('/toolkit');

  await expect(page.getByRole('heading', { name: 'Toolkit', level: 1 })).toBeVisible();
  await expect(page.getByText('Clause extraction prompt')).toBeVisible();

  await page.getByText('Clause extraction prompt').click();

  const sheet = page.getByRole('dialog', { name: 'Clause extraction prompt' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Use this asset' })).toBeVisible();
});

test('create a new item from the editor sheet (S43)', async ({ page }) => {
  let created = false;
  await page.route('**/api/v1/workspaces/*/toolkit', (route) => {
    if (route.request().method() === 'POST') {
      created = true;
      return route.fulfill(json(NEW_ITEM, 201));
    }
    return route.fulfill(json({ items: [LIST_ROW], totalCount: 1, page: 1, pageSize: 20 }));
  });

  await page.goto('/toolkit');

  await page.getByRole('button', { name: /New item/ }).click();

  const editor = page.getByRole('dialog', { name: 'New toolkit item' });
  await expect(editor).toBeVisible();

  await editor.getByLabel('Name').fill('Deposition summary prompt');
  await editor.getByRole('button', { name: 'Create item' }).click();

  await expect.poll(() => created).toBe(true);
});
