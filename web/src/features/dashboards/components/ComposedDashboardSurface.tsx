// The composed-dashboard canvas (S6, slice 28): a two-column grid of user-authored widgets, each
// rendered through the shared WidgetRenderer (drill-through off — composed widgets are static). In
// edit-layout mode every widget gains reorder / edit / remove controls and an "Add widget" affordance
// opens the composer. Owns the widget mutations and the composer sheet; the page owns the switcher,
// the editing toggle, and the new-dashboard flow.

import { useState } from 'react';
import { ArrowDown, ArrowUp, PencilSimple, Plus, Trash } from '@phosphor-icons/react';

import type { DashboardWidgetDto, SavedDashboardDto, WidgetId, WorkspaceId } from '@shared/types';

import { Button, IconButton } from '@/shared/components/Button';

import {
  useAddWidget,
  useDeleteWidget,
  useReorderWidgets,
  useUpdateWidget,
} from '../useDashboards';
import { problemMessage } from '@/shared/http/problemMessage';

import type { ComposerScopeOptions } from '../useComposerScopeOptions';
import {
  draftFromWidget,
  draftToComposeRequest,
  emptyWidgetDraft,
  scopeLabel,
  type WidgetDraft,
} from '../composerModel';
import { WidgetRenderer } from './WidgetRenderer';
import { WidgetComposerSheet } from './WidgetComposerSheet';

interface ComposerState {
  mode: 'new' | 'edit';
  draft: WidgetDraft;
}

interface ComposedDashboardSurfaceProps {
  dashboard: SavedDashboardDto;
  workspaceId: WorkspaceId | null;
  editing: boolean;
  scope: ComposerScopeOptions;
}

export function ComposedDashboardSurface({
  dashboard,
  workspaceId,
  editing,
  scope,
}: ComposedDashboardSurfaceProps) {
  const [composer, setComposer] = useState<ComposerState | null>(null);

  const addWidget = useAddWidget(dashboard.id, workspaceId);
  const updateWidget = useUpdateWidget(dashboard.id, workspaceId);
  const deleteWidget = useDeleteWidget(dashboard.id, workspaceId);
  const reorder = useReorderWidgets(dashboard.id, workspaceId);

  const widgets = dashboard.widgets;
  const isSaving = addWidget.isPending || updateWidget.isPending;
  const composerError = addWidget.isError
    ? problemMessage(addWidget.error)
    : updateWidget.isError
      ? problemMessage(updateWidget.error)
      : null;

  const openAdd = () => setComposer({ mode: 'new', draft: emptyWidgetDraft() });
  const openEdit = (widget: DashboardWidgetDto) =>
    setComposer({ mode: 'edit', draft: draftFromWidget(widget) });
  const closeComposer = () => {
    addWidget.reset();
    updateWidget.reset();
    setComposer(null);
  };

  const saveWidget = (draft: WidgetDraft) => {
    if (composer?.mode === 'edit' && draft.id) {
      const sortOrder = widgets.findIndex((widget) => widget.id === draft.id);
      updateWidget.mutate(
        {
          widgetId: draft.id as WidgetId,
          request: draftToComposeRequest(draft, Math.max(0, sortOrder)),
        },
        { onSuccess: () => setComposer(null) },
      );
      return;
    }
    addWidget.mutate(draftToComposeRequest(draft, widgets.length), {
      onSuccess: () => setComposer(null),
    });
  };

  const removeWidget = (widget: DashboardWidgetDto) => deleteWidget.mutate(widget.id as WidgetId);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= widgets.length) return;
    const reordered = widgets.map((widget, position) =>
      draftToComposeRequest(draftFromWidget(widget), position),
    );
    const moved = reordered[index]!;
    reordered[index] = reordered[target]!;
    reordered[target] = moved;
    reorder.mutate(reordered.map((request, position) => ({ ...request, sortOrder: position })));
  };

  return (
    <div className="dash-composed">
      {editing && (
        <div className="dash-composed__banner" role="note">
          <PencilSimple size={16} weight="regular" aria-hidden />
          <span className="dash-composed__banner-text">
            Editing layout — reorder, edit, or remove widgets, or add a new one.
          </span>
          <Button variant="secondary" compact onClick={openAdd}>
            <Plus size={16} weight="regular" aria-hidden /> Add widget
          </Button>
        </div>
      )}

      {widgets.length === 0 ? (
        <div className="dash-composed__empty">
          <span className="dash-composed__empty-text">This dashboard has no widgets yet.</span>
          <Button variant="primary" onClick={openAdd}>
            <Plus size={16} weight="regular" aria-hidden /> Add your first widget
          </Button>
        </div>
      ) : (
        <div className="dash-composed__grid">
          {widgets.map((widget, index) => (
            <div
              key={widget.id}
              className={`dash-composed__cell${
                widget.config.width === 'Full' ? ' dash-composed__cell--full' : ''
              }`}
            >
              {editing && (
                <div className="dash-composed__controls">
                  <IconButton
                    icon={ArrowUp}
                    label="Move widget up"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || reorder.isPending}
                  />
                  <IconButton
                    icon={ArrowDown}
                    label="Move widget down"
                    onClick={() => move(index, 1)}
                    disabled={index === widgets.length - 1 || reorder.isPending}
                  />
                  <IconButton
                    icon={PencilSimple}
                    label="Edit widget"
                    onClick={() => openEdit(widget)}
                  />
                  <IconButton
                    icon={Trash}
                    label="Remove widget"
                    onClick={() => removeWidget(widget)}
                    disabled={deleteWidget.isPending}
                  />
                </div>
              )}
              <span className="dash-composed__scope">
                {scopeLabel(widget.config, scope.stageLabels)}
              </span>
              <WidgetRenderer widget={widget} objectType={dashboard.objectType} />
            </div>
          ))}
        </div>
      )}

      {composer && (
        <WidgetComposerSheet
          mode={composer.mode}
          initialDraft={composer.draft}
          scope={scope}
          onSave={saveWidget}
          onClose={closeComposer}
          isPending={isSaving}
          error={composerError}
        />
      )}
    </div>
  );
}
