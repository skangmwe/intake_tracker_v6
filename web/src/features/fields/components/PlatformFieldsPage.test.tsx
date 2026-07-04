import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildMe, buildPlatformField, renderWithProviders } from '@/test-utils';
import { ApiError } from '@/shared/http/apiClient';

import * as api from '../api';
import { PlatformFieldsPage } from './PlatformFieldsPage';

jest.mock('../api');

const mockedApi = api as jest.Mocked<typeof api>;

describe('PlatformFieldsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchPlatformFields.mockResolvedValue([
      buildPlatformField(),
      buildPlatformField({ id: 'p2' as never, fieldKey: 'record-id', displayName: 'Record ID', isSystemImmutable: true }),
    ]);
  });

  it('PlatformFieldsPage — not a platform admin — shows a no-access response', async () => {
    const { container } = renderWithProviders(<PlatformFieldsPage />, { seedMe: buildMe({ isPlatformAdmin: false }) });
    expect(await screen.findByText(/don’t have access/i)).toBeInTheDocument();
    expect(mockedApi.fetchPlatformFields).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformFieldsPage — platform admin — lists the platform fields', async () => {
    const { container } = renderWithProviders(<PlatformFieldsPage />, { seedMe: buildMe({ isPlatformAdmin: true }) });
    expect(await screen.findByText('Record ID')).toBeInTheDocument();
    expect(screen.getByText(/system · read-only/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformFieldsPage — empty catalog — shows the empty state', async () => {
    mockedApi.fetchPlatformFields.mockResolvedValue([]);
    renderWithProviders(<PlatformFieldsPage />, { seedMe: buildMe({ isPlatformAdmin: true }) });
    expect(await screen.findByText(/no platform fields are defined/i)).toBeInTheDocument();
  });

  it('PlatformFieldsPage — update failure — announces the error', async () => {
    // Arrange
    mockedApi.updatePlatformField.mockRejectedValue(
      new ApiError(403, { type: 't', title: 'x', status: 403, detail: 'This is a system field.' }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PlatformFieldsPage />, { seedMe: buildMe({ isPlatformAdmin: true }) });
    await screen.findByDisplayValue('Legacy ID');

    // Act
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('This is a system field.');
  });

  it('PlatformFieldsPage — editing a field — calls the update endpoint', async () => {
    // Arrange
    mockedApi.updatePlatformField.mockResolvedValue(buildPlatformField({ displayName: 'Legacy Identifier' }));
    const user = userEvent.setup();
    renderWithProviders(<PlatformFieldsPage />, { seedMe: buildMe({ isPlatformAdmin: true }) });
    await screen.findByDisplayValue('Legacy ID');

    // Act
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Assert
    expect(mockedApi.updatePlatformField).toHaveBeenCalledWith('legacy-id', expect.objectContaining({ displayName: 'Legacy ID' }));
  });
});
