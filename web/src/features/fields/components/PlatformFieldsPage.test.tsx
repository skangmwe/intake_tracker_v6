import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { PlatformWorkspaceDto, WorkspaceId } from '@shared/types';

import {
  buildFieldCatalogRow,
  buildMe,
  buildPlatformField,
  renderWithProviders,
} from '@/test-utils';

import * as api from '../api';
import * as schemaApi from '../platformSchema';
import { PlatformFieldsPage } from './PlatformFieldsPage';

jest.mock('../api');
jest.mock('../platformSchema');

const mockedApi = api as jest.Mocked<typeof api>;
const mockedSchemaApi = schemaApi as jest.Mocked<typeof schemaApi>;

const WORKSPACES: PlatformWorkspaceDto[] = [
  { id: 'ws-1' as WorkspaceId, name: 'AI Solutions', kind: 'ai-solutions' },
];

describe('PlatformFieldsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchPlatformFieldCatalog.mockResolvedValue({
      rows: [buildFieldCatalogRow({ id: 'plat', fieldKey: 'legacy-id', displayName: 'Legacy ID' })],
    });
    mockedApi.fetchPlatformFields.mockResolvedValue([buildPlatformField()]);
    mockedSchemaApi.fetchPlatformObjects.mockResolvedValue([]);
    mockedSchemaApi.fetchPlatformWorkspaces.mockResolvedValue(WORKSPACES);
    mockedSchemaApi.fetchPlatformRelationships.mockResolvedValue([]);
  });

  it('PlatformFieldsPage — not a platform admin — shows a no-access response and fetches nothing', async () => {
    const { container } = renderWithProviders(<PlatformFieldsPage />, {
      seedMe: buildMe({ isPlatformAdmin: false }),
    });
    expect(await screen.findByText(/don’t have access/i)).toBeInTheDocument();
    expect(mockedApi.fetchPlatformFieldCatalog).not.toHaveBeenCalled();
    expect(mockedSchemaApi.fetchPlatformObjects).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformFieldsPage — platform admin — defaults to the Fields tab catalog', async () => {
    const { container } = renderWithProviders(<PlatformFieldsPage />, {
      seedMe: buildMe({ isPlatformAdmin: true }),
    });
    expect(await screen.findByText('Legacy ID')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /fields/i })).toHaveAttribute('aria-selected', 'true');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformFieldsPage — Objects tab shows the global objects reference', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<PlatformFieldsPage />, { seedMe: buildMe({ isPlatformAdmin: true }) });
    await screen.findByText('Legacy ID');

    // Act
    await user.click(screen.getByRole('tab', { name: /objects/i }));

    // Assert — the Objects tab loaded (empty reference here); the Fields catalog is gone.
    expect(await screen.findByText(/no global objects are defined yet/i)).toBeInTheDocument();
    expect(mockedSchemaApi.fetchPlatformObjects).toHaveBeenCalled();
  });

  it('PlatformFieldsPage — Relationships tab shows the workspace picker', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProviders(<PlatformFieldsPage />, { seedMe: buildMe({ isPlatformAdmin: true }) });
    await screen.findByText('Legacy ID');

    // Act
    await user.click(screen.getByRole('tab', { name: /relationships/i }));

    // Assert
    expect(await screen.findByRole('combobox', { name: /workspace/i })).toBeInTheDocument();
    expect(mockedSchemaApi.fetchPlatformWorkspaces).toHaveBeenCalled();
  });
});
