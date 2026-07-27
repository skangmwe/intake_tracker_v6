// GlobalObjectFieldEditLoader — resolves a Global custom object's catalog row into its full field
// definition before opening the editor. The data hook is mocked (its own tests cover the fetch);
// this covers the loading / error / found states plus axe on each.

import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { FieldObjectType } from '@shared/types';

import { buildFieldDefinition } from '@/test-utils';

import { usePlatformObjectFields } from '../usePlatformSchema';
import { GlobalObjectFieldEditLoader } from './GlobalObjectFieldEditLoader';

jest.mock('../usePlatformSchema');
const mockedUseFields = usePlatformObjectFields as jest.MockedFunction<
  typeof usePlatformObjectFields
>;

function queryResult(overrides: Partial<{ data: unknown; isLoading: boolean; isError: boolean }>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof usePlatformObjectFields>;
}

function renderLoader(overrides: Partial<React.ComponentProps<typeof GlobalObjectFieldEditLoader>> = {}) {
  const props: React.ComponentProps<typeof GlobalObjectFieldEditLoader> = {
    objectKey: 'vendor',
    objectLabel: 'Vendor',
    fieldKey: 'priority',
    availableKeysByObject: {},
    saveError: null,
    isSaving: false,
    onSave: jest.fn(),
    onDelete: jest.fn(),
    isDeleting: false,
    onClose: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<GlobalObjectFieldEditLoader {...props} />) };
}

describe('GlobalObjectFieldEditLoader', () => {
  it('GlobalObjectFieldEditLoader — loading — shows a loading message inside the sheet chrome', async () => {
    // Arrange
    mockedUseFields.mockReturnValue(queryResult({ isLoading: true }));

    // Act
    const { container } = renderLoader();

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(/loading the field/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('GlobalObjectFieldEditLoader — fetch error — shows a recoverable message', async () => {
    // Arrange
    mockedUseFields.mockReturnValue(queryResult({ isError: true, data: undefined }));

    // Act
    const { container } = renderLoader();

    // Assert
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('GlobalObjectFieldEditLoader — field not found in the fetched list — shows a recoverable message', () => {
    // Arrange
    mockedUseFields.mockReturnValue(queryResult({ data: [] }));

    // Act
    renderLoader({ fieldKey: 'missing' });

    // Assert
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it('GlobalObjectFieldEditLoader — field found — opens the editor with Object fixed, no Location', async () => {
    // Arrange
    // A Global custom object's objectType is a platform-admin-defined slug, not a built-in
    // FieldObjectType member — the DTO types it as the closed union for the common case.
    const field = buildFieldDefinition({
      fieldKey: 'priority',
      displayName: 'Priority',
      objectType: 'vendor' as FieldObjectType,
    });
    mockedUseFields.mockReturnValue(queryResult({ data: [field] }));

    // Act
    const { container } = renderLoader();

    // Assert
    expect(screen.getByRole('dialog', { name: 'Edit Priority' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Object')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Location')).not.toBeInTheDocument();
    expect(screen.getByText('Vendor')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
