import { screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { buildObjectDefinition, renderWithProviders } from '@/test-utils';

import * as api from '../platformSchema';
import { PlatformObjectsTab } from './PlatformObjectsTab';

jest.mock('../platformSchema');
const mockedApi = api as jest.Mocked<typeof api>;

const GLOBAL_OBJECTS = [
  buildObjectDefinition({
    id: 'req',
    name: 'Request',
    pluralLabel: 'Requests',
    location: 'Global',
    description: 'The core intake record.',
    isSystem: true,
  }),
  buildObjectDefinition({
    id: 'task',
    name: 'Task',
    pluralLabel: 'Tasks',
    location: 'Global',
    description: 'A unit of delivery work.',
    isSystem: true,
  }),
];

describe('PlatformObjectsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchPlatformObjects.mockResolvedValue(GLOBAL_OBJECTS);
  });

  it('PlatformObjectsTab — global objects resolved — renders Request and Task, read-only', async () => {
    // Act
    const { container } = renderWithProviders(<PlatformObjectsTab />);

    // Assert
    expect(await screen.findByRole('table', { name: 'Global objects' })).toBeInTheDocument();
    expect(screen.getByText('Request')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getAllByText('Global')).toHaveLength(2);
    // Read-only: no editor trigger, no "New object" button.
    expect(screen.queryByRole('button', { name: /new object/i })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformObjectsTab — while loading — shows the loading state', async () => {
    mockedApi.fetchPlatformObjects.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithProviders(<PlatformObjectsTab />);
    expect(await screen.findByText(/loading objects/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformObjectsTab — load failure — announces the error', async () => {
    mockedApi.fetchPlatformObjects.mockRejectedValue(new Error('boom'));
    const { container } = renderWithProviders(<PlatformObjectsTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformObjectsTab — no objects — shows the empty state', async () => {
    mockedApi.fetchPlatformObjects.mockResolvedValue([]);
    const { container } = renderWithProviders(<PlatformObjectsTab />);
    expect(await screen.findByText(/no global objects are defined yet/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
