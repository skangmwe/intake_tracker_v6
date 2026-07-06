// S32 — the shared/personal saved-view list for one object type (BS §22.3-22.4). Lists every view the
// admin can see for the surface (all shared + their own personal), with per-item actions: promote a
// personal view to shared, set / clear the default, and retire (soft-delete, confirmed). All three go
// through the id-scoped saved-view endpoints, which enforce WorkspaceAdmin for shared writes. Renders
// the loading / error / empty states explicitly (web-component-architecture.md).

import { useState } from 'react';

import type { SavedViewDto, SavedViewObjectType, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { StatusPill } from '@/shared/components/Feedback';
import { problemMessage } from '@/shared/http/problemMessage';

import { useDeleteSavedView, useSavedViews, useUpdateSavedView } from '../useSavedViews';
import { toUpsertRequest } from '../savedViewsAdminModel';
import { RetireViewDialog } from './RetireViewDialog';

const OBJECT_TYPE_LABEL: Record<SavedViewObjectType, string> = {
  Request: 'Requests',
  Feature: 'Feature Catalog',
  Task: 'Tasks',
  Announcement: 'Announcements',
};

interface SavedViewsSectionProps {
  workspaceId: WorkspaceId;
  objectType: SavedViewObjectType;
}

export function SavedViewsSection({ workspaceId, objectType }: SavedViewsSectionProps) {
  const views = useSavedViews(workspaceId, objectType);
  const update = useUpdateSavedView(workspaceId, objectType);
  const remove = useDeleteSavedView(workspaceId, objectType);
  const [toRetire, setToRetire] = useState<SavedViewDto | null>(null);

  const label = OBJECT_TYPE_LABEL[objectType];
  const headingId = `views-section-${objectType}`;

  const makeShared = (view: SavedViewDto) =>
    update.mutate({ savedViewId: view.id, request: toUpsertRequest(view, { scope: 'shared' }) });

  const toggleDefault = (view: SavedViewDto) =>
    update.mutate({ savedViewId: view.id, request: toUpsertRequest(view, { isDefault: !view.isDefault }) });

  const confirmRetire = () => {
    if (!toRetire) return;
    remove.mutate(toRetire.id, { onSuccess: () => setToRetire(null) });
  };

  return (
    <section className="views-admin__section" aria-labelledby={headingId}>
      <h2 id={headingId} className="h3 views-admin__section-title">
        {label}
      </h2>

      {views.isLoading && (
        <p className="caption" role="status">
          Loading views…
        </p>
      )}

      {views.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          These views could not be loaded. Try again in a moment.
        </p>
      )}

      {update.isError && (
        <p className="mws-alert mws-alert--error views-admin__error" role="alert">
          {problemMessage(update.error)}
        </p>
      )}

      {views.data && views.data.length === 0 && (
        <p className="views-admin__empty">No shared or personal views for {label} yet.</p>
      )}

      {views.data && views.data.length > 0 && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a horizontally-scrollable region must be keyboard-focusable so keyboard users can scroll it (axe scrollable-region-focusable).
        <div className="views-admin__table-shell" tabIndex={0} role="region" aria-label={`${label} views`}>
          <table className="views-admin__table">
            <thead>
              <tr>
                <th scope="col">View</th>
                <th scope="col">Visibility</th>
                <th scope="col">Default</th>
                <th scope="col" className="views-admin__col-action">
                  <span className="mws-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {views.data.map((view) => {
                const isShared = view.scope === 'shared';
                const pending = update.isPending && update.variables?.savedViewId === view.id;
                return (
                  <tr key={view.id}>
                    <td className="views-admin__name">{view.name}</td>
                    <td>
                      <StatusPill
                        status={isShared ? 'info' : 'neutral'}
                        label={isShared ? 'Shared' : 'Personal'}
                      />
                    </td>
                    <td>{view.isDefault ? <StatusPill status="success" label="Default" /> : '—'}</td>
                    <td className="views-admin__col-action">
                      {!isShared && (
                        <Button variant="secondary" compact disabled={pending} onClick={() => makeShared(view)}>
                          Make shared
                        </Button>
                      )}
                      <Button variant="secondary" compact disabled={pending} onClick={() => toggleDefault(view)}>
                        {view.isDefault ? 'Remove default' : 'Set as default'}
                      </Button>
                      <Button variant="destructive" compact onClick={() => setToRetire(view)}>
                        Retire
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toRetire && (
        <RetireViewDialog
          view={toRetire}
          onConfirm={confirmRetire}
          onCancel={() => {
            remove.reset();
            setToRetire(null);
          }}
          isPending={remove.isPending}
          error={remove.isError ? remove.error : null}
        />
      )}
    </section>
  );
}
