// TanStack Query hooks for Import/Export (S28) — web-state-management.md. The IO object catalog seeds
// the wizards' object + field pickers; the import mutation carries the target object + column mapping;
// the import status query self-polls while the job is still Processing and stops once it reaches a
// terminal status; the export mutations download the returned CSV Blob.

import { useMutation, useQuery } from '@tanstack/react-query';

import type {
  ImportColumnMapping,
  ImportMode,
  ImportStatusDto,
  ImportStartResponse,
  IoObjectDto,
  ObjectExportRequest,
  SavedViewId,
  WorkspaceId,
} from '@shared/types';

import { IMPORT_POLL_INTERVAL_MS } from '@/shared/constants';
import { saveBlob } from '@/shared/http/download';

import { exportObject, exportView, fetchImportStatus, fetchIoObjects, startImport } from './api';

export const importStatusKey = (importId: string) => ['import', importId] as const;
export const ioObjectsKey = (workspaceId: WorkspaceId | undefined) =>
  ['io-objects', workspaceId] as const;

/** The importable/exportable object catalog for the wizards' pickers. */
export function useIoObjects(workspaceId: WorkspaceId | undefined) {
  return useQuery<IoObjectDto[]>({
    queryKey: ioObjectsKey(workspaceId),
    queryFn: ({ signal }) => fetchIoObjects(workspaceId as WorkspaceId, signal),
    enabled: Boolean(workspaceId),
  });
}

/** Variables for a wizard-driven import: the file, the target object, the column mapping, and the import mode. */
export interface StartImportVars {
  file: File;
  objectType: string;
  mapping: ImportColumnMapping[];
  mode: ImportMode;
}

/** Kick off a CSV import — returns the importId to poll. */
export function useStartImport(workspaceId: WorkspaceId | undefined) {
  return useMutation<ImportStartResponse, Error, StartImportVars>({
    mutationFn: ({ file, objectType, mapping, mode }) =>
      startImport(workspaceId as WorkspaceId, file, objectType, mapping, mode),
  });
}

/** Poll an import's status + per-row report. Self-stops once the job leaves the Processing state. */
export function useImportStatus(importId: string | null) {
  return useQuery<ImportStatusDto>({
    queryKey: importId ? importStatusKey(importId) : ['import', 'idle'],
    queryFn: ({ signal }) => fetchImportStatus(importId as string, signal),
    enabled: Boolean(importId),
    refetchInterval: (query) =>
      query.state.data?.status === 'Processing' ? IMPORT_POLL_INTERVAL_MS : false,
  });
}

/** Export a saved view to CSV and save the download. */
export function useExportView() {
  return useMutation<void, Error, SavedViewId>({
    mutationFn: async (savedViewId) => {
      const blob = await exportView(savedViewId);
      saveBlob(blob, 'requests-export.csv');
    },
  });
}

/** Export an object's chosen columns to CSV and save the download (the export wizard). */
export function useExportObject(workspaceId: WorkspaceId | undefined) {
  return useMutation<void, Error, ObjectExportRequest>({
    mutationFn: async (request) => {
      const blob = await exportObject(workspaceId as WorkspaceId, request);
      saveBlob(blob, `${request.objectType.toLowerCase()}-export.csv`);
    },
  });
}
