import { expect, test } from '@playwright/test';

// End-to-end for slice 8 (Gates & approvals). Runs in dev mode (SSO bypass); the API is mocked at the
// network boundary with a stateful gate so the flow is deterministic without a seeded database.
// Flow 1: a member opens a record, switches to Tasks & gates, sees the open gate, picks their name and
// approves — the gate resolves. Flow 2: the member rejects with a comment (changes requested), then
// re-requests the slot back to pending.

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

const RECORD = {
  id: RECORD_ID,
  workspaceId: WORKSPACE_ID,
  origin: 'AI Solutions',
  createdAt: '2026-07-04T13:00:00Z',
  updatedAt: '2026-07-04T13:00:00Z',
  createdBy: ME.user.id,
  updatedBy: ME.user.id,
  lifecycleId: LIFECYCLE_ID,
  stages: [
    { key: 'execution', label: 'Execution' },
    { key: 'validation', label: 'Validation' },
  ],
  stage: 'execution',
  hold: { held: false },
  displayStatus: 'Execution',
  name: 'Meeting-notes action extraction',
  description: 'Pull action items out of meetings.',
  fields: { name: 'Meeting-notes action extraction' },
  eTag: 'AAAAAAAAAGQ=',
};

const SCHEMA = { workspaceId: WORKSPACE_ID, objectType: 'Request', fields: [], platformFields: [] };
const MEMBER = { userId: ME.user.id, displayName: 'Local Developer' };

function pendingGate() {
  return {
    id: 'gate-1',
    requestRecordId: RECORD_ID,
    gateDefinitionId: 'g1',
    gateName: 'QA readiness gate',
    fromStage: 'Execution',
    toStage: 'Validation',
    state: 'Pending',
    openedAt: '2026-07-04T18:00:00Z',
    slots: [{ slotIndex: 0, roleLabel: 'GCO', displayLabel: 'GCO', eligibleMembers: [MEMBER] }],
    decisions: [] as Array<Record<string, unknown>>,
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  let gate = pendingGate();

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
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route(`**/api/v1/requests/${RECORD_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RECORD) }),
  );
  await page.route(`**/api/v1/requests/${RECORD_ID}/tasks`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route(`**/api/v1/requests/${RECORD_ID}/approval-requests`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([gate]) }),
  );

  // POST a decision — Approved resolves the gate; Rejected moves it to ChangesRequested.
  await page.route('**/api/v1/approval-requests/*/decisions', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}');
    if (body.decision === 'Approved') {
      gate = {
        ...gate,
        state: 'Resolved',
        decisions: [{ slotIndex: 0, decision: 'Approved', decidedByName: 'Local Developer', decidedAt: '2026-07-04T18:05:00', isProxy: false, superseded: false }],
      };
    } else {
      gate = {
        ...gate,
        state: 'ChangesRequested',
        decisions: [{ slotIndex: 0, decision: 'Rejected', decidedByName: 'Local Developer', decidedAt: '2026-07-04T18:05:00', comment: body.comment, isProxy: false, superseded: false }],
      };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gate) });
  });

  // POST re-request — returns the rejected slot to pending (rejection retained as superseded history).
  await page.route('**/api/v1/approval-requests/*/re-request', async (route) => {
    gate = {
      ...gate,
      state: 'Pending',
      decisions: gate.decisions.map((decision) => ({ ...decision, superseded: true })),
    };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gate) });
  });

  await page.reload();
});

test('approve an open gate — it resolves', async ({ page }) => {
  await page.goto(`/requests/${RECORD_ID}`);
  await expect(page.getByRole('heading', { name: 'Meeting-notes action extraction' })).toBeVisible();

  await page.getByRole('tab', { name: 'Tasks & gates' }).click();

  // The open gate renders with its transition pill and name picker.
  await expect(page.getByText('QA readiness gate')).toBeVisible();
  await expect(page.getByText('Gate · fires on Execution → Validation')).toBeVisible();

  await page.getByLabel('Select your name').selectOption(ME.user.id);
  await page.getByRole('button', { name: 'Approve' }).click();

  // The gate resolves.
  await expect(page.getByText('Resolved')).toBeVisible();
});

test('reject a gate then re-request the slot', async ({ page }) => {
  await page.goto(`/requests/${RECORD_ID}`);
  await page.getByRole('tab', { name: 'Tasks & gates' }).click();

  await page.getByLabel('Select your name').selectOption(ME.user.id);
  await page.getByLabel('Comment').fill('Add a load test before QA');
  await page.getByRole('button', { name: 'Reject' }).click();

  // The gate is blocked and shows the change-request comment.
  await expect(page.getByText('Changes requested')).toBeVisible();
  await expect(page.getByText('“Add a load test before QA”')).toBeVisible();

  // Re-request returns the slot to pending — the name picker is back.
  await page.getByRole('button', { name: /Re-request approval/ }).click();
  await expect(page.getByLabel('Select your name')).toBeVisible();
});
