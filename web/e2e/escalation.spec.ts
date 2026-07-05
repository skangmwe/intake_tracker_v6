import { expect, test } from '@playwright/test';

// End-to-end for slice 9 (Escalation bridge — S18 + S5). Runs in dev mode (SSO bypass); the API is
// mocked at the network boundary so the flow is deterministic without a seeded database. A PG member
// opens a non-escalated record, escalates it via the confirm-and-lock modal, and the record refetches
// into its escalated variant — the "Escalated · [origin]" pill, the slim mirror note, and the crossing
// field locked read-only on the PG side. The record GET flips to the escalated shape once the escalate
// POST lands, mirroring the real invalidate-and-refetch.

const PG_WORKSPACE = 'b0000000-0000-4000-8000-000000000002';
const AI_WORKSPACE = '1a150000-0000-4000-8000-000000000001';
const REC = 'LIT-00000001';

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
      workspaceId: PG_WORKSPACE,
      workspaceName: 'Litigation',
      workspaceKind: 'pg-dept',
      workspacePrefix: 'LIT',
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
  { key: 'discovery', label: 'Discovery' },
  { key: 'build', label: 'Build' },
  { key: 'qa', label: 'QA' },
];

function field(overrides: Record<string, unknown>) {
  return {
    id: `fd-${overrides.fieldKey}`,
    workspaceId: PG_WORKSPACE,
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
  workspaceId: PG_WORKSPACE,
  objectType: 'Request',
  fields: [
    field({ fieldKey: 'name', displayName: 'Name', isRequired: true, sortOrder: 10 }),
    field({ fieldKey: 'description', displayName: 'Description', fieldType: 'LongText', sortOrder: 11 }),
    field({ fieldKey: 'deptPgClient', displayName: 'Dept / PG / Client', sortOrder: 15 }),
  ],
  platformFields: [],
};

function record(escalated: boolean) {
  return {
    id: REC,
    workspaceId: PG_WORKSPACE,
    origin: 'Litigation',
    createdAt: '2026-07-04T13:00:00Z',
    updatedAt: '2026-07-04T13:00:00Z',
    createdBy: ME.user.id,
    updatedBy: ME.user.id,
    lifecycleId: '00000000-0000-0000-0000-00000000010c',
    stages: STAGES,
    stage: 'intake',
    hold: { held: false },
    displayStatus: 'Intake',
    name: 'Contract clause finder',
    description: 'Surface the right clause from the precedent library.',
    fields: { name: 'Contract clause finder', description: '…', deptPgClient: 'Litigation' },
    eTag: 'AAAAAAAAAGQ=',
    bridge: escalated
      ? {
          isEscalated: true,
          originWorkspaceId: PG_WORKSPACE,
          originWorkspaceName: 'Litigation',
          aiWorkspaceId: AI_WORKSPACE,
          escalatedAt: '2026-07-04T18:00:00Z',
          aiSolutionsStatus: 'Intake',
          lockedFields: ['name', 'description', 'deptPgClient'],
        }
      : undefined,
  };
}

test.beforeEach(async ({ page }) => {
  let escalated = false;

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route('**/api/v1/workspaces/*/fields**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCHEMA) }),
  );
  await page.route(`**/api/v1/requests/${REC}/escalate`, (route) => {
    escalated = true;
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ recordId: REC, aiWorkspaceId: AI_WORKSPACE, aiRecord: null }),
    });
  });
  await page.route(`**/api/v1/requests/${REC}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(record(escalated)) }),
  );

  await page.reload();
});

test('a PG member escalates a record and the escalated variant renders', async ({ page }) => {
  await page.goto(`/requests/${REC}`);
  await expect(page.getByRole('heading', { name: 'Contract clause finder' })).toBeVisible();

  // The escalate action lives on the Status tab for a not-yet-escalated PG record.
  await page.getByRole('tab', { name: 'Status' }).click();
  await page.getByRole('button', { name: 'Escalate to AI Solutions' }).click();

  // Confirm-and-lock modal.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Escalate to AI Solutions' }).click();

  // The record refetches into its escalated variant: origin pill + mirror note.
  await expect(page.getByText('Escalated · Litigation')).toBeVisible();
  await page.getByRole('tab', { name: 'Intake' }).click();
  await expect(page.getByRole('complementary', { name: 'Escalation bridge' })).toContainText('AI Solutions Status');
});
