import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// End-to-end for slice 15 (Search). Runs in dev mode (SSO bypass); the API is mocked at the network
// boundary so the flow is deterministic without a seeded database. Flow 1: from the top-bar workspace
// search a member types a term, sees a record hit, and opens the full S27 results (grouped by record,
// with match kinds). Flow 2: the results page shows the no-results state for an unmatched query.

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
      level: 'Member',
      isDashboardViewer: false,
      boundDashboardId: null,
    },
  ],
  isPlatformAdmin: false,
  boundDashboardId: null,
};

const QUICK_HITS = [
  { recordId: 'AIS-00000001', name: 'Omega intake helper', stage: 'intake', origin: 'AI Solutions' },
];

const FULL_ITEMS = [
  { recordId: 'AIS-00000001', name: 'Omega intake helper', stage: 'intake', origin: 'AI Solutions', matchKind: 'record', snippet: 'Omega threshold summary' },
  { recordId: 'AIS-00000001', name: 'Omega intake helper', stage: 'intake', origin: 'AI Solutions', matchKind: 'comment', snippet: 'discussing the omega budget' },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );

  // Quick search (records-only) — the '?' distinguishes it from /search/full.
  await page.route(/\/api\/v1\/search\?/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QUICK_HITS) }),
  );

  // Full search — return results unless the query is the deliberately-unmatched term.
  await page.route(/\/api\/v1\/search\/full$/, (route) => {
    const body = route.request().postDataJSON() as { query?: string };
    const empty = (body.query ?? '').includes('zzz');
    const payload = { items: empty ? [] : FULL_ITEMS, totalCount: empty ? 0 : FULL_ITEMS.length, page: 1, pageSize: 20 };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  await page.reload();
});

test('top-bar search surfaces a record and opens the full results grouped by record', async ({ page }) => {
  await page.goto('/search');

  // The top-bar search (in the header) — distinct from the S27 refine input in the page body.
  const topBarSearch = page.locator('.mws-topbar').getByRole('searchbox', { name: 'Search this workspace' });
  await topBarSearch.fill('omega');

  // The debounced quick search surfaces the record as a result button.
  await expect(page.getByRole('button', { name: /Omega intake helper/ })).toBeVisible();

  await page.getByRole('button', { name: /See all results/ }).click();

  // The S27 results page renders the record hit + its match kinds.
  await expect(page).toHaveURL(/\/search\?q=omega/);
  await expect(page.getByRole('link', { name: 'Omega intake helper' })).toHaveAttribute('href', '/requests/AIS-00000001');
  await expect(page.getByText('Record', { exact: true })).toBeVisible();
  await expect(page.getByText('Comment', { exact: true })).toBeVisible();

  // Scope axe to the search results surface (this slice). The shell/switcher a11y is covered by
  // accessibility.spec.ts; a pre-existing contrast issue in the workspace-switcher kind label is out
  // of scope here.
  const results = await new AxeBuilder({ page }).include('.search-page').analyze();
  expect(results.violations).toEqual([]);
});

test('full results page shows the no-results state for an unmatched query', async ({ page }) => {
  await page.goto('/search?q=zzzquux');

  await expect(page.getByRole('heading', { name: /No results for/ })).toBeVisible();
});
