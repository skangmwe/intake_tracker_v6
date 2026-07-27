import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { FieldObjectType } from '@shared/types';

import {
  buildFieldCatalogRow,
  buildFieldDefinition,
  buildObjectDefinition,
  buildPlatformField,
  renderWithProviders,
} from '@/test-utils';
import { ApiError } from '@/shared/http/apiClient';

import * as api from '../api';
import * as platformSchema from '../platformSchema';
import { PlatformFieldsCatalogTab } from './PlatformFieldsCatalogTab';

jest.mock('../api');
jest.mock('../platformSchema');

const mockedApi = api as jest.Mocked<typeof api>;
const mockedPlatformSchema = platformSchema as jest.Mocked<typeof platformSchema>;

// A Global custom object's objectType is a platform-admin-defined slug ("vendor"), not one of the
// built-in FieldObjectType members — the DTOs type it as the closed union for the common case, so
// tests exercising a custom slug assert the type here rather than widening the shared contract.
const VENDOR_OBJECT_TYPE = 'vendor' as FieldObjectType;

// A Global custom object surfaces with WorkspaceId = Guid.Empty and isSystem: false.
const VENDOR = buildObjectDefinition({
  id: 'vendor',
  objectKey: 'vendor',
  name: 'Vendor',
  location: 'Global',
  isSystem: false,
  workspaceId: '00000000-0000-0000-0000-000000000000',
});

const CATALOG_ROWS = [
  buildFieldCatalogRow({
    id: 'sys',
    fieldKey: 'recordId',
    displayName: 'Record ID',
    source: 'System',
    location: 'Global',
    isReadOnly: true,
  }),
  buildFieldCatalogRow({
    id: 'plat',
    fieldKey: 'legacy-id',
    displayName: 'Legacy ID',
    source: 'Platform',
    location: 'Global',
    isReadOnly: false,
  }),
  buildFieldCatalogRow({
    id: 'glob',
    fieldKey: 'severity',
    displayName: 'Severity',
    source: 'User',
    location: 'Global',
    isReadOnly: true,
  }),
  // A Global custom object's own platform-owned field — editable here (SP3b Slice 2a, Task 6).
  buildFieldCatalogRow({
    id: 'vf-1',
    objectType: VENDOR_OBJECT_TYPE,
    objectLabel: 'Vendor',
    fieldKey: 'priority',
    displayName: 'Priority',
    fieldType: 'ShortText',
    source: 'User',
    location: 'Global',
    isReadOnly: false,
  }),
];

function seedApis() {
  mockedApi.fetchPlatformFieldCatalog.mockResolvedValue({ rows: CATALOG_ROWS });
  mockedApi.fetchPlatformFields.mockResolvedValue([buildPlatformField()]);
  mockedPlatformSchema.fetchPlatformObjects.mockResolvedValue([VENDOR]);
  mockedPlatformSchema.fetchPlatformObjectFields.mockResolvedValue([
    buildFieldDefinition({
      fieldKey: 'priority',
      displayName: 'Priority',
      objectType: VENDOR_OBJECT_TYPE,
      location: 'Global',
    }),
  ]);
}

describe('PlatformFieldsCatalogTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedApis();
  });

  it('PlatformFieldsCatalogTab — renders the catalog table', async () => {
    const { container } = renderWithProviders(<PlatformFieldsCatalogTab />);
    expect(await screen.findByText('Legacy ID')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Platform field definitions' })).toBeInTheDocument();
    expect(screen.getByText('Record ID')).toBeInTheDocument();
    expect(screen.getByText('4 field definitions')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformFieldsCatalogTab — empty catalog — shows the empty state', async () => {
    mockedApi.fetchPlatformFieldCatalog.mockResolvedValue({ rows: [] });
    const { container } = renderWithProviders(<PlatformFieldsCatalogTab />);
    expect(await screen.findByText(/no platform fields are defined yet/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformFieldsCatalogTab — while the catalog loads — shows the loading state', async () => {
    mockedApi.fetchPlatformFieldCatalog.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<PlatformFieldsCatalogTab />);
    expect(await screen.findByText(/loading the platform field catalog/i)).toBeInTheDocument();
  });

  it('PlatformFieldsCatalogTab — catalog load failure — announces the error', async () => {
    mockedApi.fetchPlatformFieldCatalog.mockRejectedValue(new Error('boom'));
    renderWithProviders(<PlatformFieldsCatalogTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
  });

  it('PlatformFieldsCatalogTab — clicking a system row opens the unified read-only sheet', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<PlatformFieldsCatalogTab />);
    await user.click(await screen.findByText('Record ID'));

    expect(await screen.findByRole('heading', { name: 'Edit Record ID' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/system field, provisioned automatically/i);
    // Exact match — the header's "Close editor" icon button also matches a loose /close/i regex.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save field/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformFieldsCatalogTab — editing a platform field calls the update endpoint', async () => {
    // Arrange
    mockedApi.updatePlatformField.mockResolvedValue(
      buildPlatformField({ displayName: 'Legacy Identifier' }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PlatformFieldsCatalogTab />);

    // Act — open the editable platform row, rename it, save.
    await user.click(await screen.findByText('Legacy ID'));
    const nameInput = await screen.findByDisplayValue('Legacy ID');
    await user.clear(nameInput);
    await user.type(nameInput, 'Legacy Identifier');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // Assert
    expect(mockedApi.updatePlatformField).toHaveBeenCalledWith(
      'legacy-id',
      expect.objectContaining({ displayName: 'Legacy Identifier' }),
    );
  });

  it('PlatformFieldsCatalogTab — an update failure is announced in the editor', async () => {
    // Arrange
    mockedApi.updatePlatformField.mockRejectedValue(
      new ApiError(403, { type: 't', title: 'x', status: 403, detail: 'This is a system field.' }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PlatformFieldsCatalogTab />);

    // Act
    await user.click(await screen.findByText('Legacy ID'));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('This is a system field.');
  });

  // ─── Fields on a Global custom object (SP3b Slice 2a, Task 6) ────────────────────────────────

  it('PlatformFieldsCatalogTab — foreign-Global row still opens the read-only sheet (unchanged)', async () => {
    // Arrange — "Severity" is a User row but isReadOnly:true (another workspace's Global field) —
    // must still route to the locked sheet, not the new editable Global-object flow.
    const user = userEvent.setup();
    renderWithProviders(<PlatformFieldsCatalogTab />);

    // Act
    await user.click(await screen.findByText('Severity'));

    // Assert
    expect(await screen.findByRole('heading', { name: 'Edit Severity' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/owned by a workspace/i);
    expect(screen.queryByRole('button', { name: /save field/i })).not.toBeInTheDocument();
  });

  it('PlatformFieldsCatalogTab — New field — Object picker limited to Global custom objects, opens create scoped to it', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = renderWithProviders(<PlatformFieldsCatalogTab />);
    await screen.findByText('Legacy ID');

    // Act
    await user.selectOptions(screen.getByLabelText(/global object for new field/i), 'vendor');
    await user.click(screen.getByRole('button', { name: /new field/i }));

    // Assert — Object is fixed (no select), no Location control, and it's labelled "Vendor". Scope
    // to the dialog — the toolbar's own object picker also renders the text "Vendor" as an option.
    const dialog = await screen.findByRole('dialog', { name: 'New field' });
    expect(within(dialog).queryByLabelText('Object')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Location')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Vendor')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformFieldsCatalogTab — New field — saving posts to the object field endpoint', async () => {
    // Arrange
    mockedPlatformSchema.createPlatformObjectField.mockResolvedValue(
      buildFieldDefinition({ fieldKey: 'region', displayName: 'Region', objectType: VENDOR_OBJECT_TYPE }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PlatformFieldsCatalogTab />);
    await screen.findByText('Legacy ID');

    // Act
    await user.selectOptions(screen.getByLabelText(/global object for new field/i), 'vendor');
    await user.click(screen.getByRole('button', { name: /new field/i }));
    // The field key is derived from the display name ("Region" → "region") and is read-only.
    await user.type(await screen.findByLabelText('Display name'), 'Region');
    await user.click(screen.getByRole('button', { name: 'Save field' }));

    // Assert
    await waitFor(() =>
      expect(mockedPlatformSchema.createPlatformObjectField).toHaveBeenCalledWith(
        'vendor',
        expect.objectContaining({ fieldKey: 'region', displayName: 'Region', objectType: 'vendor' }),
      ),
    );
  });

  it('PlatformFieldsCatalogTab — a Global object field row — opens editable, Object fixed, patches on save', async () => {
    // Arrange
    mockedPlatformSchema.updatePlatformObjectField.mockResolvedValue(
      buildFieldDefinition({ fieldKey: 'priority', displayName: 'Priority Level', objectType: VENDOR_OBJECT_TYPE }),
    );
    const user = userEvent.setup();
    const { container } = renderWithProviders(<PlatformFieldsCatalogTab />);

    // Act — open the row for the Global custom object's own field.
    await user.click(await screen.findByText('Priority'));

    // Assert — resolves via GlobalObjectFieldEditLoader to the full-parity editable editor. Scope
    // to the dialog — the toolbar's own object picker also renders the text "Vendor" as an option.
    const dialog = await screen.findByRole('dialog', { name: 'Edit Priority' });
    expect(within(dialog).queryByLabelText('Object')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Location')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Vendor')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();

    // Act — edit and save.
    const nameInput = screen.getByDisplayValue('Priority');
    await user.clear(nameInput);
    await user.type(nameInput, 'Priority Level');
    await user.click(screen.getByRole('button', { name: 'Save field' }));

    // Assert
    await waitFor(() =>
      expect(mockedPlatformSchema.updatePlatformObjectField).toHaveBeenCalledWith(
        'vendor',
        'priority',
        expect.objectContaining({ displayName: 'Priority Level' }),
      ),
    );
  });

  it('PlatformFieldsCatalogTab — deleting a Global object field confirms inline (alertdialog) then deletes', async () => {
    // Arrange
    mockedPlatformSchema.deletePlatformObjectField.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { container } = renderWithProviders(<PlatformFieldsCatalogTab />);
    await user.click(await screen.findByText('Priority'));
    await screen.findByRole('dialog', { name: 'Edit Priority' });

    // Act — a raw Delete click confirms inline first; it must NOT delete immediately.
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mockedPlatformSchema.deletePlatformObjectField).not.toHaveBeenCalled();
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent(/removed from every workspace/i);
    expect(await axe(container)).toHaveNoViolations();

    // Act — confirming actually deletes.
    await user.click(within(confirm).getByRole('button', { name: 'Delete field' }));

    // Assert
    await waitFor(() =>
      expect(mockedPlatformSchema.deletePlatformObjectField).toHaveBeenCalledWith('vendor', 'priority'),
    );
  });

  it('PlatformFieldsCatalogTab — delete confirm — Cancel dismisses without deleting', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<PlatformFieldsCatalogTab />);
    await user.click(await screen.findByText('Priority'));
    await screen.findByRole('dialog', { name: 'Edit Priority' });

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mockedPlatformSchema.deletePlatformObjectField).not.toHaveBeenCalled();
  });

  it('PlatformFieldsCatalogTab — no Global custom objects — New field picker is absent', async () => {
    // Arrange
    mockedPlatformSchema.fetchPlatformObjects.mockResolvedValue([]);

    // Act
    renderWithProviders(<PlatformFieldsCatalogTab />);
    await screen.findByText('Legacy ID');

    // Assert
    expect(screen.queryByRole('button', { name: /new field/i })).not.toBeInTheDocument();
  });
});
