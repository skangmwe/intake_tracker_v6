// TanStack Query hooks for Import/Export (S28) — web-state-management.md. The import status query
// self-polls while the job is still Processing and stops once it reaches a terminal status; the export
// mutation downloads the returned CSV Blob.

import { useMutation, useQuery } from '@tanstack/react-query';

import type { ImportStatusDto, ImportStartResponse, SavedViewId, WorkspaceId } from '@shared/types';

import { IMPORT_POLL_INTERVAL_MS } from '@/shared/constants';
import { saveBlob } from '@/shared/http/download';

import { exportView, fetchImportStatus, startImport } from './api';

export const importStatusKey = (importId: string) => ['import', importId] as const;

/** Kick off a CSV import — returns the importId to poll. */
export function useStartImport(workspaceId: WorkspaceId | undefined) {
  return useMutation<ImportStartResponse, Error, File>({
    mutationFn: (file) => startImport(workspaceId as WorkspaceId, file),
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
