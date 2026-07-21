// Unit tests for the field-schema hooks. The API boundary is mocked; a local QueryClient wrapper
// hosts the hooks (web-testing.md — renderHook keeps a local wrapper).

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type {
  FieldDefinitionDto,
  TaskLibraryFieldDto,
  WorkspaceFieldCatalogDto,
  WorkspaceFieldSchemaDto,
  WorkspaceId,
} from '@shared/types';

import { buildFieldCatalogRow, buildFieldDefinition } from '@/test-utils';

import * as api from './api';
import {
  useAddTaskLibraryField,
  useFieldCatalog,
  useRetireField,
  useSaveField,
  useTaskLibrary,
  useWorkspaceFields,
} from './useFields';

jest.mock('./api');

const mockedApi = api as jest.Mocked<typeof api>;
const WORKSPACE_ID = 'ws-1' as WorkspaceId;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useFields hooks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('useWorkspaceFields — fetches the schema for the workspace and object', async () => {
    // Arrange
    const schema: WorkspaceFieldSchemaDto = {
      workspaceId: WORKSPACE_ID,
      objectType: 'Request',
      fields: [buildFieldDefinition()],
      platformFields: [],
    };
    mockedApi.fetchWorkspaceFields.mockResolvedValue(schema);

    // Act
    const { result } = renderHook(() => useWorkspaceFields(WORKSPACE_ID, 'Request'), { wrapper });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.fields).toHaveLength(1);
  });

  it('useWorkspaceFields — disabled without a workspace id', () => {
    const { result } = renderHook(() => useWorkspaceFields(undefined, 'Request'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.fetchWorkspaceFields).not.toHaveBeenCalled();
  });

  it('useFieldCatalog — fetches the flat catalog for the workspace', async () => {
    // Arrange
    const catalog: WorkspaceFieldCatalogDto = {
      workspaceId: WORKSPACE_ID,
      rows: [buildFieldCatalogRow()],
    };
    mockedApi.fetchFieldCatalog.mockResolvedValue(catalog);

    // Act
    const { result } = renderHook(() => useFieldCatalog(WORKSPACE_ID), { wrapper });

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.rows).toHaveLength(1);
  });

  it('useFieldCatalog — disabled without a workspace id', () => {
    const { result } = renderHook(() => useFieldCatalog(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedApi.fetchFieldCatalog).not.toHaveBeenCalled();
  });

  it('useSaveField — create — calls createField', async () => {
    // Arrange
    mockedApi.createField.mockResolvedValue(buildFieldDefinition() as FieldDefinitionDto);
    const { result } = renderHook(() => useSaveField(WORKSPACE_ID), { wrapper });

    // Act
    result.current.mutate({
      fieldKey: 'severity',
      request: {
        objectType: 'Request',
        fieldKey: 'severity',
        displayName: 'Severity',
        fieldType: 'ShortText',
        category: 'WorkspaceLocal',
      },
      isCreate: true,
    });

    // Assert
    await waitFor(() => expect(mockedApi.createField).toHaveBeenCalled());
    expect(mockedApi.updateField).not.toHaveBeenCalled();
  });

  it('useSaveField — edit — calls updateField', async () => {
    mockedApi.updateField.mockResolvedValue(buildFieldDefinition() as FieldDefinitionDto);
    const { result } = renderHook(() => useSaveField(WORKSPACE_ID), { wrapper });

    result.current.mutate({
      fieldKey: 'name',
      request: {
        objectType: 'Request',
        fieldKey: 'name',
        displayName: 'Name',
        fieldType: 'ShortText',
        category: 'Crossing',
      },
      isCreate: false,
    });

    await waitFor(() =>
      expect(mockedApi.updateField).toHaveBeenCalledWith(WORKSPACE_ID, 'name', expect.anything()),
    );
  });

  it('useRetireField — calls retireField with the field key and object type', async () => {
    // Arrange
    mockedApi.retireField.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRetireField(WORKSPACE_ID), { wrapper });

    // Act
    result.current.mutate({ fieldKey: 'severity', objectType: 'Task' });

    // Assert
    await waitFor(() =>
      expect(mockedApi.retireField).toHaveBeenCalledWith(WORKSPACE_ID, 'severity', 'Task'),
    );
  });

  it('useTaskLibrary + useAddTaskLibraryField — read and add a task field', async () => {
    // Arrange
    const library: TaskLibraryFieldDto[] = [];
    mockedApi.fetchTaskLibrary.mockResolvedValue(library);
    mockedApi.createTaskLibraryField.mockResolvedValue(
      buildFieldDefinition() as FieldDefinitionDto,
    );
    const read = renderHook(() => useTaskLibrary(WORKSPACE_ID), { wrapper });
    await waitFor(() => expect(read.result.current.isSuccess).toBe(true));

    const add = renderHook(() => useAddTaskLibraryField(WORKSPACE_ID), { wrapper });

    // Act
    add.result.current.mutate({ fieldKey: 'repoUrl', displayName: 'Repo URL', fieldType: 'Url' });

    // Assert
    await waitFor(() => expect(mockedApi.createTaskLibraryField).toHaveBeenCalled());
  });
});
