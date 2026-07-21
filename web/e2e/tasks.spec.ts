import { expect, test } from '@playwright/test';

// End-to-end for slice 7 (Tasks & gates tab — tasks section). Runs in dev mode (SSO bypass); the API
// is mocked at the network boundary so the flow is deterministic without a seeded database. Flow 1:
// a member opens a record, switches to Tasks & gates, adds a task via the composer, and checks it off.
// Flow 2: the member applies a bundle template and the phase-grouped tasks appear.

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
  stage: 'execution',
  hold: { held: false },
  displayStatus: 'Execution',
  name: 'Meeting-notes action extraction',
  description: 'Pull action items out of meetings.',
  fields: { name: 'Meeting-notes action extraction' },
  eTag: 'AAAAAAAAAGQ=',
};

const SCHEMA = { workspaceId: WORKSPACE_ID, objectType: 'Request', fields: [], platformFields: [] };

const BUNDLES = [
  {
    id: 'bundle-drafting',
    name: 'Drafting assistant',
    tasks: [
      { title: 'Define prompt + guardrails', phase: 'Execution' },
      { title: 'Reviewer QA on 20 drafts', phase: 'Validation' },
    ],
  },
];

function task(id: string, title: string, phase: string, status = 'Open') {
  return {
    id,
    parentRequestId: RECORD_ID,
    title,
    phase,
    status,
    assignee: ME.user.id,
    createdAt: '2026-07-04T13:00:00Z',
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  const tasks: Array<Record<string, unknown>> = [];
  let seq = 0;

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route('**/api/v1/workspaces/*/fields**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCHEMA) }),
  );
  await page.route('**/api/v1/workspaces/*/task-fields', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route('**/api/v1/workspaces/*/task-bundles', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BUNDLES) }),
  );
  await page.route(`**/api/v1/requests/${RECORD_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RECORD) }),
  );

  // GET lists tasks; POST creates a single task or applies a bundle (both append to the array).
  await page.route(`**/api/v1/requests/${RECORD_ID}/tasks`, async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}');
      const created: Array<Record<string, unknown>> = [];
      if (body.kind === 'bundle') {
        for (const entry of BUNDLES[0]?.tasks ?? []) {
          seq += 1;
          created.push(task(`t-${seq}`, entry.title, entry.phase));
        }
      } else {
        seq += 1;
        created.push(task(`t-${seq}`, body.title, body.phase ?? 'Unphased'));
      }
      tasks.push(...created);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tasks) });
  });

  // PATCH marks a task Done (open tasks sink to the bottom on the next GET).
  await page.route('**/api/v1/tasks/*', async (route) => {
    const id = route.request().url().split('/').pop() ?? '';
    const body = JSON.parse(route.request().postData() ?? '{}');
    const found = tasks.find((entry) => entry.id === id);
    if (found && body.status) found.status = body.status;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(found ?? {}) });
  });

  await page.reload();
});

test('add a task on the Tasks & gates tab and check it off', async ({ page }) => {
  await page.goto(`/requests/${RECORD_ID}`);
  await expect(page.getByRole('heading', { name: 'Meeting-notes action extraction' })).toBeVisible();

  await page.getByRole('tab', { name: 'Tasks & gates' }).click();
  await expect(page.getByText(/No tasks yet/)).toBeVisible();

  // Add a single task via the composer.
  await page.getByRole('textbox', { name: 'New task title' }).fill('Draft the QA test set');
  await page.getByRole('button', { name: 'Add task' }).last().click();

  await expect(page.getByText('Draft the QA test set')).toBeVisible();
  await expect(page.getByText('1 open')).toBeVisible();

  // Check it off — it becomes Done.
  await page.getByRole('button', { name: 'Mark Draft the QA test set done' }).click();
  await expect(page.getByText('0 open')).toBeVisible();
});

test('apply a bundle template and see its phase-grouped tasks', async ({ page }) => {
  await page.goto(`/requests/${RECORD_ID}`);
  await page.getByRole('tab', { name: 'Tasks & gates' }).click();

  await page.getByRole('tab', { name: 'Add bundle' }).click();
  await page.getByLabel('Apply a task bundle template').selectOption('bundle-drafting');
  await page.getByRole('button', { name: 'Add bundle' }).click();

  // Both bundle tasks land, under their phase headers.
  await expect(page.getByText('Define prompt + guardrails')).toBeVisible();
  await expect(page.getByText('Reviewer QA on 20 drafts')).toBeVisible();
});
