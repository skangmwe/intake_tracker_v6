import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildObjectDefinition, renderWithProviders } from '@/test-utils';

import * as api from '../platformSchema';
import { PlatformObjectsTab } from './PlatformObjectsTab';

jest.mock('../platformSchema');
const mockedApi = api as jest.Mocked<typeof api>;

const BUILTINS = [
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

// A Global custom object surfaces with WorkspaceId = Guid.Empty and isSystem: false.
const VENDOR = buildObjectDefinition({
  id: 'vendor',
  name: 'Vendor',
  pluralLabel: 'Vendors',
  location: 'Global',
  description: 'A supplier.',
  isSystem: false,
  workspaceId: '00000000-0000-0000-0000-000000000000',
});

describe('PlatformObjectsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.fetchPlatformObjects.mockResolvedValue([...BUILTINS, VENDOR]);
  });

  it('PlatformObjectsTab — global objects resolved — built-ins read-only, custom editable, New object present', async () => {
    // Act
    const { container } = renderWithProviders(<PlatformObjectsTab />);

    // Assert
    expect(await screen.findByRole('table', { name: 'Global objects' })).toBeInTheDocument();
    expect(screen.getByText('Request')).toBeInTheDocument();
    expect(screen.getByText('Vendor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new object/i })).toBeInTheDocument();
    // Built-ins have no Edit action; the Global custom object does.
    expect(screen.getByRole('button', { name: 'Edit Vendor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Request' })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PlatformObjectsTab — while loading — shows the loading state', async () => {
    mockedApi.fetchPlatformObjects.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<PlatformObjectsTab />);
    expect(await screen.findByText(/loading objects/i)).toBeInTheDocument();
  });

  it('PlatformObjectsTab — load failure — announces the error', async () => {
    mockedApi.fetchPlatformObjects.mockRejectedValue(new Error('boom'));
    renderWithProviders(<PlatformObjectsTab />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
  });

  it('PlatformObjectsTab — no objects — shows the empty state', async () => {
    mockedApi.fetchPlatformObjects.mockResolvedValue([]);
    renderWithProviders(<PlatformObjectsTab />);
    expect(await screen.findByText(/no global objects are defined yet/i)).toBeInTheDocument();
  });

  it('PlatformObjectsTab — new object saved — posts a Global create', async () => {
    // Arrange
    mockedApi.createPlatformObject.mockResolvedValue(VENDOR);
    const user = userEvent.setup();
    renderWithProviders(<PlatformObjectsTab />);
    await screen.findByRole('table', { name: 'Global objects' });

    // Act
    await user.click(screen.getByRole('button', { name: /new object/i }));
    expect(await screen.findByRole('heading', { name: /new global object/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Display name'), 'Matter');
    await user.click(screen.getByRole('button', { name: 'Save object' }));

    // Assert — Location is forced to Global.
    await waitFor(() =>
      expect(mockedApi.createPlatformObject).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Matter', location: 'Global' }),
      ),
    );
  });

  it('PlatformObjectsTab — custom object edited — patches by id', async () => {
    // Arrange
    mockedApi.updatePlatformObject.mockResolvedValue(VENDOR);
    const user = userEvent.setup();
    renderWithProviders(<PlatformObjectsTab />);
    await screen.findByRole('table', { name: 'Global objects' });

    // Act
    await user.click(screen.getByRole('button', { name: 'Edit Vendor' }));
    expect(await screen.findByRole('heading', { name: /edit vendor/i })).toBeInTheDocument();
    const nameInput = screen.getByLabelText('Display name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Vendor 2');
    await user.click(screen.getByRole('button', { name: 'Save object' }));

    // Assert
    await waitFor(() =>
      expect(mockedApi.updatePlatformObject).toHaveBeenCalledWith(
        'vendor',
        expect.objectContaining({ name: 'Vendor 2' }),
      ),
    );
  });

  it('PlatformObjectsTab — custom object deleted — deletes by id', async () => {
    // Arrange
    mockedApi.deletePlatformObject.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<PlatformObjectsTab />);
    await screen.findByRole('table', { name: 'Global objects' });

    // Act
    await user.click(screen.getByRole('button', { name: 'Edit Vendor' }));
    await user.click(await screen.findByRole('button', { name: /delete/i }));

    // Assert
    await waitFor(() => expect(mockedApi.deletePlatformObject).toHaveBeenCalledWith('vendor'));
  });
});
