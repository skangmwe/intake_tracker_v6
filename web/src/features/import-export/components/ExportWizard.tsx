// Export wizard (S28, Export tab). Three steps on a shared Stepper: pick an object, choose which
// columns to export (identity columns are locked on), then download the CSV. Columns follow the
// selection; rows follow the caller's entitlements (the API enforces both — export never widens
// access, BS §22.4). Renders the io-object catalog's loading / error / empty states explicitly.

import { useMemo, useState } from 'react';

import type { IoObjectDto, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Select } from '@/shared/components/Form';
import { Stepper } from '@/shared/components/Feedback';
import { problemMessage } from '@/shared/http/problemMessage';

import { useExportObject, useIoObjects } from '../useImportExport';
import { ExportFieldPicker } from './ExportFieldPicker';

const STEPS = [{ label: 'Object' }, { label: 'Fields' }, { label: 'Download' }];

export function ExportWizard({ workspaceId }: { workspaceId: WorkspaceId }) {
  const { data: objects, isLoading, isError } = useIoObjects(workspaceId);
  const exportable = useMemo(() => (objects ?? []).filter((item) => item.canExport), [objects]);

  const [stepIndex, setStepIndex] = useState(0);
  const [objectType, setObjectType] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const exportMutation = useExportObject(workspaceId);

  const active: IoObjectDto | undefined =
    exportable.find((item) => item.objectType === objectType) ?? exportable[0];

  const chooseObject = (value: string) => {
    setObjectType(value);
    setSelected(new Set()); // fields differ per object — reset the selection.
  };

  const toggleField = (fieldKey: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(fieldKey)) {
        next.delete(fieldKey);
      } else {
        next.add(fieldKey);
      }
      return next;
    });
  };

  const onExport = () => {
    if (active) {
      exportMutation.mutate({ objectType: active.objectType, fieldKeys: [...selected] });
    }
  };

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

  if (exportable.length === 0 || !active) {
    return (
      <p className="caption ie-panel__empty" data-ds="empty-zero">
        No objects are available to export yet.
      </p>
    );
  }

  return (
    <section className="ie-wizard" aria-labelledby="ie-export-wizard-heading">
      <h2 id="ie-export-wizard-heading" className="ie-panel__title">
        Export to CSV
      </h2>
      <Stepper steps={STEPS} currentIndex={stepIndex} />

      {stepIndex === 0 && (
        <div className="ie-wizard__step">
          <Select
            label="Object to export"
            value={active.objectType}
            options={exportable.map((item) => ({ value: item.objectType, label: item.label }))}
            onChange={chooseObject}
          />
        </div>
      )}

      {stepIndex === 1 && (
        <div className="ie-wizard__step">
          <ExportFieldPicker
            fields={active.exportFields}
            selected={selected}
            onToggle={toggleField}
          />
        </div>
      )}

      {stepIndex === 2 && (
        <div className="ie-wizard__step">
          <p className="caption">
            Exporting <strong>{active.label}</strong> with {selected.size + countLocked(active)}{' '}
            {selected.size + countLocked(active) === 1 ? 'column' : 'columns'}.
          </p>
          <Button variant="secondary" onClick={onExport} disabled={exportMutation.isPending}>
            {exportMutation.isPending ? 'Preparing…' : 'Export CSV'}
          </Button>
          {exportMutation.isError && (
            <p className="mws-alert mws-alert--error ie-panel__alert" role="alert">
              {problemMessage(
                exportMutation.error,
                'The export could not be prepared. Try again in a moment.',
              )}
            </p>
          )}
          {exportMutation.isSuccess && (
            <p className="ie-panel__note" role="status">
              Your export has downloaded.
            </p>
          )}
        </div>
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
          <Button onClick={() => setStepIndex((index) => Math.min(STEPS.length - 1, index + 1))}>
            Continue
          </Button>
        )}
      </div>
    </section>
  );
}

/** Count of always-included identity columns for an object (added to the CSV regardless of selection). */
function countLocked(object: IoObjectDto): number {
  return object.exportFields.filter((field) => field.alwaysIncluded === true).length;
}
