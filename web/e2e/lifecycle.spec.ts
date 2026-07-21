import { expect, test } from '@playwright/test';

// End-to-end for slice 4 (Lifecycle & gates admin, S31). Runs in dev mode (the SSO bypass); the API
// is mocked at the network boundary so the flow is deterministic without a seeded database. A
// workspace admin opens Lifecycle & gates, sees the seeded lifecycle's stages / gates / roster, adds
// a lifecycle, and adds an approver-team member.

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

const BUILD_STAGE = '00000000-0000-0000-0000-0000000000b1';
const QA_STAGE = '00000000-0000-0000-0000-0000000000b2';
const LIFECYCLE_ID = '00000000-0000-0000-0000-00000000010c';

const CONFIG = {
  workspaceId: WORKSPACE_ID,
  lifecycles: [
    {
      id: LIFECYCLE_ID,
      name: 'Standard AI build',
      requestType: 'Full build',
      isDefault: true,
      sortOrder: 0,
      stages: [
        { id: BUILD_STAGE, key: 'execution', label: 'Execution', statusCategory: 'Execution', sortOrder: 0 },
        { id: QA_STAGE, key: 'validation', label: 'Validation', statusCategory: 'Validation', sortOrder: 1 },
      ],
      gates: [
        {
          id: '00000000-0000-0000-0000-0000000001a1',
          lifecycleId: LIFECYCLE_ID,
          name: 'QA readiness gate',
          fromStageId: BUILD_STAGE,
          toStageId: QA_STAGE,
          joinKind: 'and',
          slots: [{ roleLabel: 'InfoSec', eligibleCount: 1 }],
        },
      ],
    },
  ],
  roleLabels: ['AI Solutions Manager', 'GCO', 'InfoSec'],
  approverTeams: [
    { roleLabel: 'AI Solutions Manager', members: [] },
    { roleLabel: 'GCO', members: [] },
    { roleLabel: 'InfoSec', members: [{ userId: '00000000-0000-0000-0000-0000000000a1', displayName: 'N. Varga' }] },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route('**/api/v1/workspaces/*/lifecycle', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CONFIG) }),
  );
  await page.route('**/api/v1/workspaces/*/approver-teams', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ userId: '00000000-0000-0000-0000-0000000000a2', displayName: 'K. Sato' }),
    }),
  );

  await page.reload();
});

test('a workspace admin sees the seeded lifecycle, its stages, gate and roster', async ({ page }) => {
  await page.getByRole('link', { name: 'Lifecycle & gates' }).click();
  await expect(page).toHaveURL(/\/admin\/lifecycle$/);

  await expect(page.getByRole('heading', { name: 'Lifecycle & gates', level: 1 })).toBeVisible();
  // The lifecycle dropdown selector (v2, slice 27) and its stage track render.
  await expect(page.getByRole('combobox', { name: 'Select lifecycle' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Lifecycle name' })).toHaveValue('Standard AI build');
  await expect(page.getByLabel('Stage 1 name')).toHaveValue('Execution');
  await expect(page.getByRole('textbox', { name: 'Gate name' })).toHaveValue('QA readiness gate');
  // The InfoSec roster shows the seeded member.
  await expect(page.getByText('N. Varga')).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/saved/i);
});

test('a workspace admin can add a second lifecycle', async ({ page }) => {
  await page.getByRole('link', { name: 'Lifecycle & gates' }).click();
  await page.getByRole('button', { name: 'New lifecycle' }).click();
  // The new lifecycle becomes the selected one in the editor.
  await expect(page.getByRole('textbox', { name: 'Lifecycle name' })).toHaveValue('New lifecycle');
});

test('a workspace admin can add an approver-team member', async ({ page }) => {
  await page.getByRole('link', { name: 'Lifecycle & gates' }).click();
  await page.getByLabel('Add member to GCO').fill('K. Sato');
  await page.getByLabel('Add member to GCO').press('Enter');
  // The POST resolves without error (the add input clears).
  await expect(page.getByLabel('Add member to GCO')).toHaveValue('');
});
