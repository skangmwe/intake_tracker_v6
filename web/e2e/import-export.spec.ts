import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// End-to-end for S28 (CSV Import & Export — tabs + wizards). Runs in dev mode (SSO bypass); the API is
// mocked at the network boundary so the flow is deterministic without a seeded database. Flow: a
// workspace admin on S28 steps the Import wizard (object → upload → map → run) and sees the "completed
// with issues" status + per-row report, then switches to the Export tab and exports a saved view.

const WORKSPACE_ID = '1a150000-0000-4000-8000-000000000001';

const ME = {
  user: {
    id: '00000000-0000-0000-0000-000000000001',
    displayName: 'Local Developer',
    email: 'dev@mws.ai',
    lastSignInAt: '2026-07-06T13:00:00Z',
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

const IO_OBJECTS = [
  {
    objectType: 'Request',
    label: 'Requests',
    canImport: true,
    canExport: true,
    importFields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'description', label: 'Description' },
      { key: 'requestor', label: 'Requestor (email)' },
    ],
    exportFields: [
      { key: 'id', label: 'Record ID', alwaysIncluded: true },
      { key: 'name', label: 'Name' },
      { key: 'stage', label: 'Stage' },
    ],
  },
  {
    objectType: 'Feature',
    label: 'Features',
    canImport: true,
    canExport: true,
    importFields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'featureType', label: 'Type', required: true },
      { key: 'oneLiner', label: 'One-liner' },
    ],
    exportFields: [
      { key: 'id', label: 'Record ID', alwaysIncluded: true },
      { key: 'name', label: 'Name' },
      { key: 'oneLiner', label: 'One-liner' },
    ],
  },
];

const IMPORT_STATUS = {
  id: 'imp-1',
  workspaceId: WORKSPACE_ID,
  startedBy: '00000000-0000-0000-0000-000000000001',
  startedAt: '2026-07-06T13:00:00Z',
  status: 'CompletedWithErrors',
  totalRows: 3,
  landedRows: 2,
  flaggedRows: [
    {
      rowIndex: 3,
      reasons: [
        { code: 'missing-required', message: 'A request name is required.', field: 'name' },
      ],
    },
  ],
};

const SAVED_VIEWS = [
  {
    id: '5a5e0000-0000-4000-8000-000000000001',
    workspaceId: WORKSPACE_ID,
    objectType: 'Request',
    name: 'All open requests',
    scope: 'shared',
    isDefault: true,
    columns: ['id', 'name'],
    filters: {},
    sort: [],
    ownerUserId: '00000000-0000-0000-0000-000000000001',
    createdBy: '00000000-0000-0000-0000-000000000001',
    createdAt: '2026-07-06T13:00:00Z',
    updatedAt: '2026-07-06T13:00:00Z',
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  await page.route('**/api/v1/users/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ME) }),
  );
  await page.route(/\/api\/v1\/workspaces\/[^/]+\/io\/objects$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(IO_OBJECTS),
    }),
  );
  await page.route(/\/api\/v1\/workspaces\/[^/]+\/saved-views/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAVED_VIEWS),
    }),
  );
  await page.route(/\/api\/v1\/workspaces\/[^/]+\/imports\/csv$/, (route) =>
    route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ importId: 'imp-1', status: 'Processing' }),
    }),
  );
  await page.route(/\/api\/v1\/imports\/imp-1$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(IMPORT_STATUS),
    }),
  );
  await page.route(/\/api\/v1\/exports$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/csv',
      body: 'Record ID,Name\r\nAIS-00000001,Helper\r\n',
    }),
  );
  await page.route(/\/api\/v1\/workspaces\/[^/]+\/exports\/object$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/csv',
      body: 'Record ID,Name\r\nFEAT-00000001,Alpha\r\n',
    }),
  );

  await page.reload();
});

test('admin steps the Import wizard, sees the per-row report, then exports a saved view', async ({
  page,
}) => {
  await page.goto('/admin/import-export');

  // Import wizard — Object step (Request preselected) → Upload.
  await page.getByRole('button', { name: 'Continue' }).click();

  // Upload step — choose a CSV, wait for the preview, then continue.
  await page.getByLabel('CSV file').setInputFiles({
    name: 'import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name\nAlpha'),
  });
  await expect(page.getByText(/Preview — first 1 row/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Map step — "Name" auto-maps to the required Name field → continue to review.
  await expect(page.getByRole('combobox', { name: /Map column Name/ })).toHaveValue('name');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Review step — run the import; the status + flagged row surface.
  await page.getByRole('button', { name: 'Run import' }).click();
  await expect(page.getByText(/Completed with issues/)).toBeVisible();
  await expect(page.getByText('A request name is required.')).toBeVisible();

  // Switch to the Export tab. The object-export wizard is object-agnostic, so Feature lit up in its
  // object picker alongside Request once the descriptor was registered.
  await page.getByRole('tab', { name: 'Export' }).click();
  await expect(page.getByRole('option', { name: 'Features' })).toBeAttached();

  // Export the saved view (the second entry point retained on the Export tab).
  await page.getByRole('button', { name: 'Export view' }).click();
  await expect(page.getByText('Your export has downloaded.')).toBeVisible();

  const results = await new AxeBuilder({ page }).include('.import-export-page').analyze();
  expect(results.violations).toEqual([]);
});

test('admin picks fields, reorders them, and exports the object wizard columns in that order', async ({
  page,
}) => {
  // Capture the export request body so the assertion is grounded in what actually went over the
  // wire, not just what the UI displays. Registered here (after beforeEach's route for the same
  // pattern) so it wins — Playwright routes run last-registered-first.
  let exportRequestBody: { objectType: string; fieldKeys: string[] } | null = null;
  await page.route(/\/api\/v1\/workspaces\/[^/]+\/exports\/object$/, (route) => {
    exportRequestBody = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'text/csv',
      body: 'Record ID,Stage,Name\r\nAIS-00000001,Backlog,Helper\r\n',
    });
  });

  await page.goto('/admin/import-export');
  await page.getByRole('tab', { name: 'Export' }).click();

  const availableList = () => page.getByRole('listbox', { name: /available/i });
  const selectedList = () => page.getByRole('listbox', { name: /selected/i });

  // Object step — Request carries two orderable export fields (Name, Stage) beyond its locked
  // identity column, which is what this flow needs to exercise a reorder.
  await page.getByRole('combobox', { name: 'Object to export' }).selectOption('Request');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Fields step — move both orderable fields into Selected via double-click (the reliable
  // single-item move gesture; see ExportFieldTransfer.tsx).
  await availableList().getByText('Name', { exact: true }).dblclick();
  await availableList().getByText('Stage', { exact: true }).dblclick();

  // Reorder — focus "Name" (added first, so currently ahead of "Stage" in Selected) and push it
  // down one via the keyboard-accessible path (Alt+ArrowDown). Native drag-and-drop is flaky under
  // Playwright, so the keyboard reorder is the reliable, accessible equivalent exercised here.
  await selectedList().getByText('Name', { exact: true }).focus();
  await page.keyboard.press('Alt+ArrowDown');

  // Assert the Selected list's visible order reflects the reorder before export runs: the locked
  // identity column stays pinned first, then Stage, then Name.
  await expect(selectedList().getByRole('option')).toHaveText([/Record ID/, 'Stage', 'Name']);

  // Download step — trigger the export.
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Export CSV' }).click();

  await expect(page.getByText('Your export has downloaded.')).toBeVisible();
  expect(exportRequestBody).toEqual({ objectType: 'Request', fieldKeys: ['stage', 'name'] });

  const results = await new AxeBuilder({ page }).include('.import-export-page').analyze();
  expect(results.violations).toEqual([]);
});
