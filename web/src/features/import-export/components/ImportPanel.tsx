// Import panel (S28) — CSV upload area, live status, and the per-row validation report. Import is
// create-only and never updates a live record (BS §13). The status self-polls (useImportStatus) until
// the job is terminal; the summary always renders the three non-data states (loading / error / result).

import { useState, type ChangeEvent, type FormEvent } from 'react';

import type { ImportStatusDto, WorkspaceId } from '@shared/types';

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

export function ImportPanel({ workspaceId }: { workspaceId: WorkspaceId }) {
  const [file, setFile] = useState<File | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const start = useStartImport(workspaceId);
  const status = useImportStatus(importId);
  const job = status.data;

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setImportId(null);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    start.mutate(file, { onSuccess: (result) => setImportId(result.importId) });
  };

  return (
    <section className="ie-panel" aria-labelledby="ie-import-heading">
      <h2 id="ie-import-heading" className="ie-panel__title">
        Import records
      </h2>
      <p className="caption ie-panel__lead">
        Upload a CSV to create records. Import never updates existing records; each row becomes a new
        request.
      </p>

      <form className="ie-import__form" onSubmit={onSubmit}>
        <label className="ie-import__label" htmlFor="ie-file">
          CSV file
        </label>
        <input
          id="ie-file"
          className="ie-import__file"
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
        />
        <Button type="submit" disabled={!file || start.isPending}>
          {start.isPending ? 'Uploading…' : 'Import CSV'}
        </Button>
      </form>

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
            <span className={`ie-status__line ie-status--${statusKind(job)}`}>{statusLabel(job)}</span>
          ) : (
            <span className="ie-status__line ie-status--pending">Starting import…</span>
          )}
        </div>
      )}

      {job && <ImportReportTable rows={job.flaggedRows} />}
    </section>
  );
}
