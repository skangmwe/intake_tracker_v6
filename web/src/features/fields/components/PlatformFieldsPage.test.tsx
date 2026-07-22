import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildFieldCatalogRow, buildMe, buildPlatformField, renderWithProviders } from '@/test-utils';
import { ApiError } from '@/shared/http/apiClient';

import * as api from '../api';
import { PlatformFieldsPage } from './PlatformFieldsPage';

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

describe('PlatformFieldsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedApis();
  });

  it('PlatformFieldsPage — not a platform admin — shows a no-access response', async () => {
    const { container } = renderWithProviders(<PlatformFieldsPage />, {
      seedMe: buildMe({ isPlatformAdmin: false }),
    });
    expect(await screen.findByText(/don’t have access/i)).toBeInTheDocument();
    expect(mockedApi.fetchPlatformFieldCatalog).not.toHaveBeenCalled();
    expect(mockedApi.fetchPlatformFields).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformFieldsPage — platform admin — renders the catalog table', async () => {
    const { container } = renderWithProviders(<PlatformFieldsPage />, {
      seedMe: buildMe({ isPlatformAdmin: true }),
    });
    expect(await screen.findByText('Legacy ID')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Platform field definitions' })).toBeInTheDocument();
    expect(screen.getByText('Record ID')).toBeInTheDocument();
    expect(screen.getByText('3 field definitions')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformFieldsPage — empty catalog — shows the empty state', async () => {
    mockedApi.fetchPlatformFieldCatalog.mockResolvedValue({ rows: [] });
    renderWithProviders(<PlatformFieldsPage />, { seedMe: buildMe({ isPlatformAdmin: true }) });
    expect(await screen.findByText(/no platform fields are defined yet/i)).toBeInTheDocument();
  });

  it('PlatformFieldsPage — while the catalog loads — shows the loading state', async () => {
    mockedApi.fetchPlatformFieldCatalog.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<PlatformFieldsPage />, { seedMe: buildMe({ isPlatformAdmin: true }) });
    expect(await screen.findByText(/loading the platform field catalog/i)).toBeInTheDocument();
  });

  it('PlatformFieldsPage — catalog load failure — announces the error', async () => {
    mockedApi.fetchPlatformFieldCatalog.mockRejectedValue(new Error('boom'));
    renderWithProviders(<PlatformFieldsPage />, { seedMe: buildMe({ isPlatformAdmin: true }) });
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
  });

  it('PlatformFieldsPage — clicking a system row opens the read-only sheet', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<PlatformFieldsPage />, {
      seedMe: buildMe({ isPlatformAdmin: true }),
    });
    await user.click(await screen.findByText('Record ID'));

    const sheet = await screen.findByRole('dialog', { name: 'Record ID' });
    expect(within(sheet).getByText(/system field, provisioned automatically/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformFieldsPage — editing a platform field calls the update endpoint', async () => {
    // Arrange
    mockedApi.updatePlatformField.mockResolvedValue(buildPlatformField({ displayName: 'Legacy Identifier' }));
    const user = userEvent.setup();
    renderWithProviders(<PlatformFieldsPage />, { seedMe: buildMe({ isPlatformAdmin: true }) });

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

  it('PlatformFieldsPage — an update failure is announced in the editor', async () => {
    // Arrange
    mockedApi.updatePlatformField.mockRejectedValue(
      new ApiError(403, { type: 't', title: 'x', status: 403, detail: 'This is a system field.' }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PlatformFieldsPage />, { seedMe: buildMe({ isPlatformAdmin: true }) });

    // Act
    await user.click(await screen.findByText('Legacy ID'));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('This is a system field.');
  });
});
