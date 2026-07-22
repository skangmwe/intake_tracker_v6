import { screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { buildRelationship, renderWithProviders } from '@/test-utils';

import * as api from '../platformSchema';
import { PlatformRelationshipsTab } from './PlatformRelationshipsTab';

jest.mock('../platformSchema');
const mockedApi = api as jest.Mocked<typeof api>;

const RELATIONSHIPS = [
  buildRelationship({
    id: 'r1' as never,
    name: 'Request has Tasks',
    isSystem: true,
    sortOrder: 1,
    fromObjectType: 'Request',
    toObjectType: 'Task',
    fromSideLabel: 'Tasks',
    toSideLabel: 'Request',
  }),
  buildRelationship({
    id: 'r2' as never,
    name: 'Request has Attachments',
    isSystem: true,
    sortOrder: 0,
    fromObjectType: 'Request',
    toObjectType: 'Attachment',
    fromSideLabel: 'Attachments',
    toSideLabel: 'Request',
  }),
];

describe('PlatformRelationshipsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchPlatformRelationships.mockResolvedValue(RELATIONSHIPS);
  });

  it('PlatformRelationshipsTab — resolved — shows a read-only, system-seeded relationships table', async () => {
    // Act
    const { container } = renderWithProviders(<PlatformRelationshipsTab />);

    // Assert
    expect(await screen.findByText('Request has Tasks')).toBeInTheDocument();
    expect(screen.getByText('Request has Attachments')).toBeInTheDocument();
    // Origin is always System, one badge per row.
    expect(screen.getAllByText('System')).toHaveLength(2);
    // Read-only — no picker, no create / retire affordances.
    expect(screen.queryByRole('combobox', { name: /workspace/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new relationship/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retire/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformRelationshipsTab — while loading — shows the loading state', async () => {
    // Arrange
    mockedApi.fetchPlatformRelationships.mockReturnValue(new Promise(() => {}));

    // Act
    const { container } = renderWithProviders(<PlatformRelationshipsTab />);

    // Assert
    expect(await screen.findByText(/loading relationships/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformRelationshipsTab — load failure — announces the error', async () => {
    // Arrange
    mockedApi.fetchPlatformRelationships.mockRejectedValue(new Error('boom'));

    // Act
    const { container } = renderWithProviders(<PlatformRelationshipsTab />);

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /platform relationship list could not be loaded/i,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformRelationshipsTab — no relationships — shows the empty state', async () => {
    // Arrange
    mockedApi.fetchPlatformRelationships.mockResolvedValue([]);

    // Act
    const { container } = renderWithProviders(<PlatformRelationshipsTab />);

    // Assert
    expect(await screen.findByText(/no inherited relationships yet/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
