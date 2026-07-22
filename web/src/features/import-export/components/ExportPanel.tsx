// Export panel (S28) — pick a saved view and download it as CSV. Columns follow the view; rows follow
// the caller's entitlements (the API enforces both — export never widens access, BS §22.4). Renders
// loading / error / empty (no saved views yet) / list states explicitly.

import { useState } from 'react';

import type { SavedViewId, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { problemMessage } from '@/shared/http/problemMessage';
import { useSavedViews } from '@/features/saved-views';

import { useExportView } from '../useImportExport';

export function ExportPanel({ workspaceId }: { workspaceId: WorkspaceId }) {
  const { data: views, isLoading, isError } = useSavedViews(workspaceId, 'Request');
  const [selectedId, setSelectedId] = useState('');
  const exportMutation = useExportView();

  const list = views ?? [];
  const effective = (list.find((view) => view.id === selectedId)?.id ?? list[0]?.id) as
    SavedViewId | undefined;

  const onExport = () => {
    if (effective) exportMutation.mutate(effective);
  };

  return (
    <section className="ie-panel" aria-labelledby="ie-export-heading">
      <h2 id="ie-export-heading" className="ie-panel__title">
        Export a view
      </h2>
      <p className="caption ie-panel__lead">
        Download a saved request view as CSV. The columns follow the view; you only ever export rows
        you can already see.
      </p>

      {isLoading && (
        <p className="caption" role="status">
          Loading saved views…
        </p>
      )}

      {isError && (
        <p className="mws-alert mws-alert--error ie-panel__alert" role="alert">
          Saved views could not be loaded. Try again in a moment.
        </p>
      )}

      {!isLoading && !isError && list.length === 0 && (
        <p className="caption ie-panel__empty" data-ds="empty-zero">
          No saved views yet. Create one on the Requests list, then export it here.
        </p>
      )}

      {!isLoading && !isError && list.length > 0 && (
        <div className="ie-export__row">
          <label className="ie-export__label" htmlFor="ie-view">
            Saved view
          </label>
          <select
            id="ie-view"
            className="ie-export__select"
            value={effective ?? ''}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {list.map((view) => (
              <option key={view.id} value={view.id}>
                {view.name}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={onExport}
            disabled={!effective || exportMutation.isPending}
          >
            {exportMutation.isPending ? 'Preparing…' : 'Export view'}
          </Button>
        </div>
      )}

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
    </section>
  );
}
