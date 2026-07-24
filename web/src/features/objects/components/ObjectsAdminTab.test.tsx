// ObjectsAdminTab — the three non-data states, the object list, and opening the create sheet. The
// data hooks are mocked (the API/selector paths are covered by their own tests). Includes an axe check.

import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { WorkspaceId } from '@shared/types';

import { buildObjectDefinition } from '@/test-utils';

import { useDeleteObject, useSaveObject, useWorkspaceObjects } from '../useObjects';
import { ObjectsAdminTab } from './ObjectsAdminTab';

// ObjectsAdminTab navigates to a custom object's records list, so it must render inside a router.
function renderTab(workspaceId: WorkspaceId) {
  return render(<ObjectsAdminTab workspaceId={workspaceId} />, { wrapper: MemoryRouter });
}

jest.mock('../useObjects');

const mockUseWorkspaceObjects = useWorkspaceObjects as jest.MockedFunction<
  typeof useWorkspaceObjects
>;
const mockUseSaveObject = useSaveObject as jest.MockedFunction<typeof useSaveObject>;
const mockUseDeleteObject = useDeleteObject as jest.MockedFunction<typeof useDeleteObject>;

const WORKSPACE_ID = 'ws-1' as WorkspaceId;

function queryResult(
  overrides: Partial<{
    data: ReturnType<typeof buildObjectDefinition>[];
    isLoading: boolean;
    isError: boolean;
  }>,
) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  } as unknown as ReturnType<typeof useWorkspaceObjects>;
}

function mutationResult() {
  return {
    mutate: jest.fn(),
    reset: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useSaveObject>;
}

beforeEach(() => {
  mockUseSaveObject.mockReturnValue(mutationResult());
  mockUseDeleteObject.mockReturnValue(
    mutationResult() as unknown as ReturnType<typeof useDeleteObject>,
  );
});

describe('ObjectsAdminTab', () => {
  it('ObjectsAdminTab — loading — shows a status message', () => {
    // Arrange
    mockUseWorkspaceObjects.mockReturnValue(queryResult({ isLoading: true }));

    // Act
    renderTab(WORKSPACE_ID);

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(/loading objects/i);
  });

  it('ObjectsAdminTab — error — shows an alert', () => {
    // Arrange
    mockUseWorkspaceObjects.mockReturnValue(queryResult({ isError: true }));

    // Act
    renderTab(WORKSPACE_ID);

    // Assert
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/i);
  });

  it('ObjectsAdminTab — with objects — renders the list', () => {
    // Arrange
    mockUseWorkspaceObjects.mockReturnValue(
      queryResult({
        data: [
          buildObjectDefinition({ id: 'o-request', name: 'Request', isSystem: true }),
          buildObjectDefinition({ id: 'o-vendor', name: 'Vendor' }),
        ],
      }),
    );

    // Act
    renderTab(WORKSPACE_ID);

    // Assert
    expect(screen.getByText('Request')).toBeInTheDocument();
    expect(screen.getByText('Vendor')).toBeInTheDocument();
  });

  it('ObjectsAdminTab — New object — opens the create sheet', async () => {
    // Arrange
    const user = userEvent.setup();
    mockUseWorkspaceObjects.mockReturnValue(
      queryResult({
        data: [buildObjectDefinition({ id: 'o-request', name: 'Request', isSystem: true })],
      }),
    );
    renderTab(WORKSPACE_ID);

    // Act
    await user.click(screen.getByRole('button', { name: 'New object' }));

    // Assert
    expect(screen.getByRole('dialog', { name: 'New object' })).toBeInTheDocument();
  });

  it('ObjectsAdminTab — with objects — no accessibility violations', async () => {
    // Arrange
    mockUseWorkspaceObjects.mockReturnValue(
      queryResult({ data: [buildObjectDefinition({ id: 'o-vendor', name: 'Vendor' })] }),
    );
    const { container } = renderTab(WORKSPACE_ID);

    // Act
    const results = await axe(container);

    // Assert
    expect(results).toHaveNoViolations();
  });
});
