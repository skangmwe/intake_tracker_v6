import { expect, test } from '@playwright/test';

// End-to-end for slice 14 (Feature Catalog + Saved-view editor — S9/S10/S13/S24). Runs in dev mode
// (SSO bypass); the API is mocked at the network boundary so the flow is deterministic without a
// seeded database. Covers the two slice capabilities: browsing the catalog and opening a feature
// detail (S9 → S10), and authoring a saved view from the picker's editor (S24).

const WORKSPACE_ID = '1a150000-0000-4000-8000-000000000001';
const FEATURE_ID = 'AIS-00000042';

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
  isPlatformAdmin: false,
  boundDashboardId: null,
};

const LIST_ROW = {
  id: FEATURE_ID,
  eTag: 'AAAAAAAAAAE=',
  name: 'Citation overlay',
  oneLiner: 'Highlights the source lines behind an answer',
  featureType: 'UI/visual',
  capabilityTags: ['citations'],
  techStack: ['React'],
  owner: 'Priya Raman',
  maturity: 'Published',
  origin: 'AI Solutions',
  updatedAt: '2026-07-05T10:00:00Z',
};

const FEATURE = {
  ...LIST_ROW,
  workspaceId: WORKSPACE_ID,
  createdAt: '2026-07-05T10:00:00Z',
  updatedAt: '2026-07-05T10:00:00Z',
  createdBy: ME.user.id,
  updatedBy: ME.user.id,
  whatItDoes: 'Draws highlight boxes over the cited lines',
  solutionPattern: ['Extract'],
  howToReuse: 'Lift the overlay component',
  demoUrl: null,
  repoUrl: 'https://example.test/repo',
  dataClassification: null,
  complianceFlags: [],
  sourcedFromRecordIds: [],
};

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await page.route('**/api/v1/users/me', (route) => route.fulfill(json(ME)));
  await page.route('**/api/v1/features/query', (route) =>
    route.fulfill(json({ items: [LIST_ROW], totalCount: 1, page: 1, pageSize: 25 })),
  );
  await page.route(`**/api/v1/features/${FEATURE_ID}`, (route) => route.fulfill(json(FEATURE)));
  await page.route('**/api/v1/workspaces/*/saved-views**', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill(
        json(
          {
            id: 'sv-new',
            workspaceId: WORKSPACE_ID,
            objectType: 'Feature',
            name: 'Integrations only',
            scope: 'personal',
            isDefault: false,
            columns: ['name'],
            filters: {},
            sort: [],
            ownerUserId: ME.user.id,
            createdBy: ME.user.id,
            createdAt: '2026-07-05T10:00:00Z',
            updatedAt: '2026-07-05T10:00:00Z',
          },
          201,
        ),
      );
    }
    return route.fulfill(json([]));
  });
  await page.route(`**/api/v1/records/${FEATURE_ID}/attachments`, (route) =>
    route.fulfill(json([])),
  );
  await page.route(`**/api/v1/records/${FEATURE_ID}/links`, (route) => route.fulfill(json([])));
});

test('browse the catalog and open a feature detail (S9 → S10)', async ({ page }) => {
  await page.goto('/feature-catalog');

  await expect(page.getByRole('heading', { name: 'Feature Catalog' })).toBeVisible();
  await expect(page.getByText('Citation overlay')).toBeVisible();

  await page.getByText('Citation overlay').click();

  await expect(page.getByRole('heading', { name: 'Citation overlay', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reuse & provenance' })).toBeVisible();
});

test('author a saved view from the catalog picker (S24)', async ({ page }) => {
  let created = false;
  await page.route('**/api/v1/workspaces/*/saved-views', async (route) => {
    if (route.request().method() === 'POST') {
      created = true;
      return route.fulfill(
        json(
          {
            id: 'sv-new',
            workspaceId: WORKSPACE_ID,
            objectType: 'Feature',
            name: 'Integrations only',
            scope: 'personal',
            isDefault: false,
            columns: ['name'],
            filters: {},
            sort: [],
            ownerUserId: ME.user.id,
            createdBy: ME.user.id,
            createdAt: '2026-07-05T10:00:00Z',
            updatedAt: '2026-07-05T10:00:00Z',
          },
          201,
        ),
      );
    }
    return route.fulfill(json([]));
  });

  await page.goto('/feature-catalog');

  // Open the saved-view picker, then "Save as new view" → the S24 editor.
  await page.getByRole('button', { name: /Published catalog/ }).click();
  await page.getByRole('button', { name: 'Save as new view' }).click();

  const dialog = page.getByRole('dialog', { name: 'New saved view' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('View name').fill('Integrations only');
  await dialog.getByRole('button', { name: 'Save view' }).click();

  await expect.poll(() => created).toBe(true);
});
