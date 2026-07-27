// FieldEditLoader — resolves a workspace catalog row into its full field definition before opening
// the editor. The data hook is mocked (its own tests cover the fetch); this covers the loading /
// error / not-found / found states plus axe on each.

import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { WorkspaceId } from '@shared/types';

import { buildFieldDefinition } from '@/test-utils';

import { useWorkspaceFields } from '../useFields';
import { FieldEditLoader } from './FieldEditLoader';

jest.mock('../useFields');
const mockedUseFields = useWorkspaceFields as jest.MockedFunction<typeof useWorkspaceFields>;

function queryResult(overrides: Partial<{ data: unknown; isLoading: boolean; isError: boolean }>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof useWorkspaceFields>;
}

function renderLoader(overrides: Partial<React.ComponentProps<typeof FieldEditLoader>> = {}) {
  const props: React.ComponentProps<typeof FieldEditLoader> = {
    workspaceId: 'ws-1' as WorkspaceId,
    objectType: 'Request',
    fieldKey: 'severity',
    availableKeysByObject: {},
    customObjectOptions: [],
    saveError: null,
    isSaving: false,
    onSave: jest.fn(),
    onArchive: jest.fn(),
    isArchiving: false,
    onClose: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<FieldEditLoader {...props} />) };
}

describe('FieldEditLoader', () => {
  it('FieldEditLoader — loading — shows a loading message inside the sheet chrome', async () => {
    // Arrange
    mockedUseFields.mockReturnValue(queryResult({ isLoading: true }));

    // Act
    const { container } = renderLoader();

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(/loading the field/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FieldEditLoader — fetch error — shows a recoverable message', async () => {
    // Arrange
    mockedUseFields.mockReturnValue(queryResult({ isError: true }));

    // Act
    const { container } = renderLoader();

    // Assert
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FieldEditLoader — field not found in the fetched schema — shows a recoverable message', () => {
    // Arrange
    mockedUseFields.mockReturnValue(queryResult({ data: { fields: [] } }));

    // Act
    renderLoader({ fieldKey: 'missing' });

    // Assert
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it('FieldEditLoader — field found — opens the editor with Object and Location', async () => {
    // Arrange
    const field = buildFieldDefinition({ fieldKey: 'severity', displayName: 'Severity' });
    mockedUseFields.mockReturnValue(queryResult({ data: { fields: [field] } }));

    // Act
    const { container } = renderLoader();

    // Assert
    expect(screen.getByRole('dialog', { name: 'Edit Severity' })).toBeInTheDocument();
    expect(screen.getByLabelText('Object')).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
