// The reconciled S30 Fields tab — a flat, all-object-types field catalog on the shared list-surface.
// Owns the view state (sort, per-column funnels) and the create / edit / read-only editor flow.
// The prototype has no pager, so the footer is a count only. Renders the three non-data states
// explicitly (web-component-architecture.md).

import { useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';

import type { FieldCatalogRowDto, FieldObjectType, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { type FilterValue, type SortState } from '@/shared/components/Table';

import { lockMessageForSource } from '../constants';
import { problemMessage } from '../errorMessage';
import {
  type CatalogColumnKey,
  type CatalogFilters,
  isFilterActive,
  selectCatalogView,
} from '../fieldCatalogView';
import { buildFormFromCatalogRow } from '../fieldForm';
import { useFieldCatalog, useRetireField, useSaveField } from '../useFields';
import { FieldCatalogTable } from './FieldCatalogTable';
import { FieldEditLoader } from './FieldEditLoader';
import { FieldEditorSheet } from './FieldEditorSheet';

const NO_FILTERS: CatalogFilters = {};

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; row: FieldCatalogRowDto }
  | { mode: 'readonly'; row: FieldCatalogRowDto }
  | null;

export function FieldsCatalogTab({ workspaceId }: { workspaceId: WorkspaceId }) {
  const catalog = useFieldCatalog(workspaceId);
  const saveField = useSaveField(workspaceId);
  const retireField = useRetireField(workspaceId);

  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [filters, setFilters] = useState<CatalogFilters>(NO_FILTERS);
  const [editor, setEditor] = useState<EditorState>(null);

  const allRows = useMemo(() => catalog.data?.rows ?? [], [catalog.data]);
  const view = useMemo(() => selectCatalogView(allRows, sort, filters), [allRows, sort, filters]);

  const availableKeysByObject = useMemo(() => {
    const map: Partial<Record<FieldObjectType, string[]>> = {};
    for (const row of allRows) {
      (map[row.objectType] ??= []).push(row.fieldKey);
    }
    return map;
  }, [allRows]);

  const anyFilters = (Object.values(filters) as FilterValue[]).some(isFilterActive);

  const onFilterChange = (column: CatalogColumnKey, value: FilterValue) =>
    setFilters((prev) => ({ ...prev, [column]: value }));
  const clearFilters = () => setFilters(NO_FILTERS);

  const openRow = (row: FieldCatalogRowDto) =>
    setEditor(row.isReadOnly ? { mode: 'readonly', row } : { mode: 'edit', row });

  const closeEditor = () => {
    saveField.reset();
    retireField.reset();
    setEditor(null);
  };

  const onSave = (
    fieldKey: string,
    request: Parameters<typeof saveField.mutate>[0]['request'],
    isCreate: boolean,
  ) => saveField.mutate({ fieldKey, request, isCreate }, { onSuccess: closeEditor });

  const onArchive = (row: FieldCatalogRowDto) =>
    retireField.mutate(
      { fieldKey: row.fieldKey, objectType: row.objectType },
      { onSuccess: closeEditor },
    );

  const saveError = saveField.isError
    ? problemMessage(saveField.error)
    : retireField.isError
      ? problemMessage(retireField.error)
      : null;

  const countLabel = `${view.total} field ${view.total === 1 ? 'definition' : 'definitions'}`;

  return (
    <div className="fields-catalog">
      <div className="fields-catalog__toolbar">
        {anyFilters && (
          <button type="button" className="fields-catalog__clear" onClick={clearFilters}>
            Clear all filters
          </button>
        )}
        <span className="fields-catalog__spacer" />
        <Button onClick={() => setEditor({ mode: 'create' })}>
          <Plus size={16} aria-hidden /> New field
        </Button>
      </div>

      {catalog.isLoading && (
        <p className="caption" role="status">
          Loading the field catalog…
        </p>
      )}

      {catalog.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The field catalog could not be loaded. Try again in a moment.
        </p>
      )}

      {catalog.data && allRows.length > 0 && view.total === 0 && (
        <div className="fields-catalog__no-matches">
          <p className="fields-catalog__no-matches-title">No fields match these filters</p>
          <Button variant="secondary" compact onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {catalog.data && view.total > 0 && (
        <>
          <FieldCatalogTable
            rows={view.rows}
            allRows={allRows}
            sort={sort}
            onSortChange={setSort}
            filters={filters}
            onFilterChange={onFilterChange}
            onOpen={openRow}
          />
          <div className="table-footer" data-ds="table-footer">
            <span className="table-footer__summary">{countLabel}</span>
          </div>
        </>
      )}

      {editor?.mode === 'create' && (
        <FieldEditorSheet
          initialObjectType="Request"
          field={null}
          availableKeysByObject={availableKeysByObject}
          saveError={saveError}
          isSaving={saveField.isPending}
          onSave={onSave}
          onClose={closeEditor}
        />
      )}

      {editor?.mode === 'edit' && (
        <FieldEditLoader
          workspaceId={workspaceId}
          objectType={editor.row.objectType}
          fieldKey={editor.row.fieldKey}
          availableKeysByObject={availableKeysByObject}
          saveError={saveError}
          isSaving={saveField.isPending}
          onSave={onSave}
          onArchive={() => onArchive(editor.row)}
          isArchiving={retireField.isPending}
          onClose={closeEditor}
        />
      )}

      {editor?.mode === 'readonly' && (
        <FieldEditorSheet
          initialObjectType={editor.row.objectType}
          field={null}
          readOnly
          readOnlyForm={buildFormFromCatalogRow(editor.row)}
          lockMessage={lockMessageForSource(editor.row.source)}
          availableKeysByObject={availableKeysByObject}
          saveError={null}
          isSaving={false}
          onSave={onSave}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}
