// Import wizard (S28, Import tab). Four steps on a shared Stepper: pick an object, upload a CSV (with a
// live preview), map columns to fields, then review + run. Import is create-only and CSV-only (BS §13).
// Column mapping + the target object travel to the server; the run + status polling live in
// ImportRunStep. Renders the io-object catalog's loading / error / empty states explicitly.

import { useMemo, useState, type ChangeEvent } from 'react';

import type { IoObjectDto, WorkspaceId } from '@shared/types';

import { CSV_PREVIEW_ROW_LIMIT } from '@/shared/constants';
import { Button } from '@/shared/components/Button';
import { Select } from '@/shared/components/Form';
import { Stepper } from '@/shared/components/Feedback';

import { parseCsvPreview, type CsvPreview } from '../csvPreview';
import {
  autoMapColumns,
  toMappingPayload,
  validateMapping,
  type ColumnMapping,
} from '../importMapping';
import { useIoObjects } from '../useImportExport';
import { ImportColumnMapper } from './ImportColumnMapper';
import { ImportPreviewTable } from './ImportPreviewTable';
import { ImportRunStep } from './ImportRunStep';

const STEPS = [
  { label: 'Object' },
  { label: 'Upload' },
  { label: 'Map columns' },
  { label: 'Review' },
];
const CSV_EXTENSION = /\.csv$/i;

export function ImportWizard({ workspaceId }: { workspaceId: WorkspaceId }) {
  const { objects, isLoading, isError } = useIoObjectsForImport(workspaceId);

  const [stepIndex, setStepIndex] = useState(0);
  const [objectType, setObjectType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});

  const active: IoObjectDto | undefined =
    objects.find((item) => item.objectType === objectType) ?? objects[0];

  const validity = useMemo(
    () => validateMapping(mapping, active?.importFields ?? []),
    [mapping, active],
  );

  const chooseObject = (value: string) => {
    setObjectType(value);
    // Fields differ per object — clear the upload so mapping is always against the chosen object.
    setFile(null);
    setPreview(null);
    setFileError(null);
    setMapping({});
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    const fields = active?.importFields ?? [];
    setFile(picked);
    setPreview(null);
    setMapping({});
    if (!picked) {
      setFileError(null);
      return;
    }
    if (!CSV_EXTENSION.test(picked.name)) {
      setFileError('Choose a .csv file.');
      return;
    }
    const text = await picked.text();
    const parsed = parseCsvPreview(text, CSV_PREVIEW_ROW_LIMIT);
    if (parsed.headers.length === 0) {
      setFileError('That file has no header row. Add column names in the first row.');
      return;
    }
    setFileError(null);
    setPreview(parsed);
    setMapping(autoMapColumns(parsed.headers, fields));
  };

  const canContinue =
    stepIndex === 0 || (stepIndex === 1 && preview !== null) || (stepIndex === 2 && validity.valid);

  if (isLoading) {
    return (
      <p className="caption" role="status">
        Loading objects…
      </p>
    );
  }
  if (isError) {
    return (
      <p className="mws-alert mws-alert--error ie-panel__alert" role="alert">
        Objects could not be loaded. Try again in a moment.
      </p>
    );
  }
  if (objects.length === 0 || !active) {
    return (
      <p className="caption ie-panel__empty" data-ds="empty-zero">
        No objects are available to import yet.
      </p>
    );
  }

  return (
    <section className="ie-wizard" aria-labelledby="ie-import-heading">
      <h2 id="ie-import-heading" className="ie-panel__title">
        Import from CSV
      </h2>
      <Stepper steps={STEPS} currentIndex={stepIndex} />

      {stepIndex === 0 && (
        <div className="ie-wizard__step">
          <Select
            label="Object to import"
            value={active.objectType}
            options={objects.map((item) => ({ value: item.objectType, label: item.label }))}
            onChange={chooseObject}
          />
        </div>
      )}

      {stepIndex === 1 && (
        <div className="ie-wizard__step">
          <label className="ie-import__label" htmlFor="ie-file">
            CSV file
          </label>
          <input
            id="ie-file"
            className="ie-import__file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void onFileChange(event)}
          />
          {fileError && (
            <p className="mws-alert mws-alert--error ie-panel__alert" role="alert">
              {fileError}
            </p>
          )}
          {preview && <ImportPreviewTable preview={preview} />}
        </div>
      )}

      {stepIndex === 2 && preview && (
        <div className="ie-wizard__step">
          <ImportColumnMapper
            headers={preview.headers}
            sampleRow={preview.rows[0]}
            fields={active.importFields}
            mapping={mapping}
            onChange={(columnIndex, fieldKey) =>
              setMapping((current) => ({ ...current, [columnIndex]: fieldKey }))
            }
          />
          {!validity.hasAnyMapping && (
            <p className="caption ie-map__hint">Map at least one column to continue.</p>
          )}
          {validity.missingRequired.length > 0 && (
            <p className="mws-alert mws-alert--warning ie-panel__alert" role="alert">
              Map a column to: {validity.missingRequired.map((field) => field.label).join(', ')}.
            </p>
          )}
        </div>
      )}

      {stepIndex === 3 && file && (
        <ImportRunStep
          workspaceId={workspaceId}
          file={file}
          objectType={active.objectType}
          objectLabel={active.label}
          mapping={toMappingPayload(mapping)}
        />
      )}

      <div className="ie-wizard__nav">
        <Button
          variant="secondary"
          onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
          disabled={stepIndex === 0}
        >
          Back
        </Button>
        {stepIndex < STEPS.length - 1 && (
          <Button onClick={() => setStepIndex((index) => index + 1)} disabled={!canContinue}>
            Continue
          </Button>
        )}
      </div>
    </section>
  );
}

/** The importable slice of the io-object catalog, with a stable empty array while loading. */
function useIoObjectsForImport(workspaceId: WorkspaceId) {
  const query = useIoObjects(workspaceId);
  const objects = useMemo(() => (query.data ?? []).filter((item) => item.canImport), [query.data]);
  return { objects, isLoading: query.isLoading, isError: query.isError };
}
