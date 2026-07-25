import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildFieldCatalogRow, buildPlatformField, renderWithProviders } from '@/test-utils';
import { ApiError } from '@/shared/http/apiClient';

import * as api from '../api';
import { PlatformFieldsCatalogTab } from './PlatformFieldsCatalogTab';

jest.mock('../api');

const mockedApi = api as jest.Mocked<typeof api>;

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
];

function seedApis() {
  mockedApi.fetchPlatformFieldCatalog.mockResolvedValue({ rows: CATALOG_ROWS });
  mockedApi.fetchPlatformFields.mockResolvedValue([buildPlatformField()]);
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
    expect(screen.getByText('3 field definitions')).toBeInTheDocument();
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
});
