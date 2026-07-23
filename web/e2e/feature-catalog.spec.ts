import { expect, test } from '@playwright/test';

// End-to-end for the Feature Catalog (S9/S10). Runs in dev mode (SSO bypass); the API is mocked at
// the network boundary so the flow is deterministic without a seeded database. Covers browsing the
// catalog and opening a feature detail (S9 → S10). Saved views are not offered on this surface (a
// Toolkit-style search toolbar replaced the picker) — they live only on Requests.

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

test('the catalog offers a search toolbar, not a saved-view picker', async ({ page }) => {
  await page.goto('/feature-catalog');

  // The Toolkit-style search toolbar is present; the saved-view picker is not.
  await expect(page.getByRole('searchbox', { name: 'Search the feature catalog' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Published catalog/ })).toHaveCount(0);
});
