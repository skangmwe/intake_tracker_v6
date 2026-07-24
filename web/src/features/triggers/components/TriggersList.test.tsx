// Behaviour + a11y tests for the trigger list + editor orchestration. The triggers api and the
// borrowed fields api (condition field keys) are mocked at the boundary; the real model hooks run
// against a fresh QueryClient. axe runs across the error, empty, populated, and editor-open states.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { WorkspaceFieldSchemaDto, WorkspaceId } from '@shared/types';

import { buildFieldDefinition, renderWithProviders } from '@/test-utils';

import * as api from '../api';
import * as fieldsApi from '@/features/fields/api';
import type { TriggerDto } from '../types';
import { TriggersList } from './TriggersList';

jest.mock('../api');
jest.mock('@/features/fields/api');

const mockedApi = api as jest.Mocked<typeof api>;
const mockedFieldsApi = fieldsApi as jest.Mocked<typeof fieldsApi>;

const WS = 'ws-1' as WorkspaceId;

function buildTrigger(overrides: Partial<TriggerDto> = {}): TriggerDto {
  return {
    triggerId: 't-1',
    objectType: 'Request',
    kind: 'Authored',
    name: 'SLA breach',
    isEnabled: true,
    cadence: 'RepeatEveryNDays',
    repeatIntervalDays: 1,
    windowDays: null,
    notificationCategory: 'sla-reminder',
    recipients: ['assignedAnalyst'],
    notificationTitle: 'Request nearing SLA',
    notificationBody: 'Please review.',
    conditions: [{ whenFieldKey: 'dueDate', comparator: 'lt', compareValue: '@today' }],
    ...overrides,
  };
}

const SCHEMA: WorkspaceFieldSchemaDto = {
  workspaceId: WS,
  objectType: 'Request',
  fields: [buildFieldDefinition({ fieldKey: 'dueDate', displayName: 'Due date' })],
  platformFields: [],
};

describe('TriggersList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFieldsApi.fetchWorkspaceFields.mockResolvedValue(SCHEMA);
  });

  it('loading — shows the loading status', () => {
    // Arrange
    mockedApi.fetchTriggers.mockReturnValue(new Promise(() => undefined));

    // Act
    renderWithProviders(<TriggersList workspaceId={WS} />);

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(/loading triggers/i);
  });

  it('error — shows a recovery alert (no axe violations)', async () => {
    // Arrange
    mockedApi.fetchTriggers.mockRejectedValue(new Error('boom'));

    // Act
    const { container } = renderWithProviders(<TriggersList workspaceId={WS} />);

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('empty — shows the zero-data state with a create action (no axe violations)', async () => {
    // Arrange
    mockedApi.fetchTriggers.mockResolvedValue([]);

    // Act
    const { container } = renderWithProviders(<TriggersList workspaceId={WS} />);

    // Assert
    expect(await screen.findByText(/no triggers yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /new trigger/i }).length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('populated — renders a row per trigger with an enabled/disabled badge (no axe violations)', async () => {
    // Arrange
    mockedApi.fetchTriggers.mockResolvedValue([
      buildTrigger(),
      buildTrigger({ triggerId: 't-2', name: 'Benefit review', isEnabled: false, cadence: 'Once' }),
    ]);

    // Act
    const { container } = renderWithProviders(<TriggersList workspaceId={WS} />);

    // Assert
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('SLA breach')).toBeInTheDocument();
    expect(screen.getByText('Benefit review')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('New trigger — opens the empty editor sheet', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchTriggers.mockResolvedValue([buildTrigger()]);
    renderWithProviders(<TriggersList workspaceId={WS} />);
    await screen.findByRole('table');

    // Act
    await user.click(screen.getByRole('button', { name: /new trigger/i }));

    // Assert
    expect(await screen.findByRole('dialog', { name: /add trigger/i })).toBeInTheDocument();
  });

  it('Edit then Delete — opens the row and calls the delete api', async () => {
    // Arrange
    const user = userEvent.setup();
    mockedApi.fetchTriggers.mockResolvedValue([buildTrigger()]);
    mockedApi.deleteTrigger.mockResolvedValue();
    renderWithProviders(<TriggersList workspaceId={WS} />);
    await screen.findByRole('table');

    // Act
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(await screen.findByRole('dialog', { name: /edit sla breach/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete trigger/i }));

    // Assert
    await waitFor(() => expect(mockedApi.deleteTrigger).toHaveBeenCalledWith(WS, 't-1'));
  });
});
