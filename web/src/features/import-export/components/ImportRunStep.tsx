// Import wizard final step (S28) — review + run. Fires the mapped, object-typed import, then self-polls
// the job status (useImportStatus) until it is terminal and renders the per-row report. Import is
// create-only; each row becomes a new record (BS §13). Always renders the three non-data states
// (idle before run / status line / report). File names + CSV values are Confidential — never logged.

import { useState } from 'react';

import type { ImportColumnMapping, ImportStatusDto, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { problemMessage } from '@/shared/http/problemMessage';

import { useImportStatus, useStartImport } from '../useImportExport';
import { ImportReportTable } from './ImportReportTable';

function statusLabel(job: ImportStatusDto): string {
  switch (job.status) {
    case 'Processing':
      return 'Processing…';
    case 'Completed':
      return `Completed — ${job.landedRows} of ${job.totalRows} records created.`;
    case 'CompletedWithErrors':
      return `Completed with issues — ${job.landedRows} of ${job.totalRows} created, ${job.flaggedRows.length} flagged.`;
    case 'Failed':
      return 'The import failed. Check the file has a header row and try again.';
    default:
      return job.status;
  }
}

function statusKind(job: ImportStatusDto): 'pending' | 'success' | 'warning' | 'error' {
  switch (job.status) {
    case 'Processing':
      return 'pending';
    case 'Completed':
      return 'success';
    case 'CompletedWithErrors':
      return 'warning';
    default:
      return 'error';
  }
}

interface ImportRunStepProps {
  workspaceId: WorkspaceId;
  file: File;
  objectType: string;
  objectLabel: string;
  mapping: ImportColumnMapping[];
}

export function ImportRunStep({
  workspaceId,
  file,
  objectType,
  objectLabel,
  mapping,
}: ImportRunStepProps) {
  const [importId, setImportId] = useState<string | null>(null);
  const start = useStartImport(workspaceId);
  const status = useImportStatus(importId);
  const job = status.data;

  const onRun = () => {
    start.mutate(
      { file, objectType, mapping, mode: 'create' },
      { onSuccess: (result) => setImportId(result.importId) },
    );
  };

  return (
    <div className="ie-wizard__step">
      <p className="caption">
        Importing <strong>{file.name}</strong> as <strong>{objectLabel}</strong> — {mapping.length}{' '}
        {mapping.length === 1 ? 'column' : 'columns'} mapped. Each row becomes a new record.
      </p>

      <Button onClick={onRun} disabled={start.isPending || importId !== null}>
        {start.isPending ? 'Uploading…' : 'Run import'}
      </Button>

      {start.isError && (
        <p className="mws-alert mws-alert--error ie-panel__alert" role="alert">
          {problemMessage(start.error, 'The file could not be imported. Try again in a moment.')}
        </p>
      )}

      {importId && (
        <div className="ie-status" role="status" aria-live="polite">
          {status.isError ? (
            <span className="ie-status__line ie-status--error">
              Couldn’t read the import status. It may still be processing.
            </span>
          ) : job ? (
            <span className={`ie-status__line ie-status--${statusKind(job)}`}>
              {statusLabel(job)}
            </span>
          ) : (
            <span className="ie-status__line ie-status--pending">Starting import…</span>
          )}
        </div>
      )}

      {job && <ImportReportTable rows={job.flaggedRows} />}
    </div>
  );
}
