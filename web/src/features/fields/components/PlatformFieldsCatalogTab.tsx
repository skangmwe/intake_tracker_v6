// Platform Fields & objects — Fields tab (S34). The flat catalog table: system auto-fields on the
// Global objects, the platform-defined fields (editable), and every Global field across all
// workspaces (read-only). Extracted from PlatformFieldsPage in B2 so the page can host three tabs;
// behavior is unchanged. Rendered only for a platform admin (the page gates access). Renders explicit
// loading / error / empty states (web-component-architecture.md).

import { useMemo, useState } from 'react';

import type { FieldCatalogRowDto } from '@shared/types';

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
import { usePlatformFieldCatalog, usePlatformFields, useUpdatePlatformField } from '../useFields';
import { FieldCatalogTable } from './FieldCatalogTable';
import { FieldEditorSheet } from './FieldEditorSheet';
import { PlatformFieldEditorSheet } from './PlatformFieldEditorSheet';

const NO_FILTERS: CatalogFilters = {};

export function PlatformFieldsCatalogTab() {
  const catalog = usePlatformFieldCatalog();
  // The full platform-field definitions carry the Select options the editor needs to seed itself.
  const platformFields = usePlatformFields();
  const updateField = useUpdatePlatformField();

  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [filters, setFilters] = useState<CatalogFilters>(NO_FILTERS);
  const [editorKey, setEditorKey] = useState<string | null>(null);
  const [readonlyRow, setReadonlyRow] = useState<FieldCatalogRowDto | null>(null);

  const allRows = useMemo(() => catalog.data?.rows ?? [], [catalog.data]);
  const view = useMemo(() => selectCatalogView(allRows, sort, filters), [allRows, sort, filters]);

  const anyFilters = (Object.values(filters) as FilterValue[]).some(isFilterActive);
  const onFilterChange = (column: CatalogColumnKey, value: FilterValue) =>
    setFilters((prev) => ({ ...prev, [column]: value }));
  const clearFilters = () => setFilters(NO_FILTERS);

  const openRow = (row: FieldCatalogRowDto) => {
    if (row.source === 'Platform' && !row.isReadOnly) {
      setReadonlyRow(null);
      setEditorKey(row.fieldKey);
    } else {
      setEditorKey(null);
      setReadonlyRow(row);
    }
  };

  const closeEditor = () => {
    updateField.reset();
    setEditorKey(null);
  };

  const editingField = editorKey
    ? (platformFields.data?.find((field) => field.fieldKey === editorKey) ?? null)
    : null;

  const onSave = (fieldKey: string, displayName: string, selectOptions: string[] | null) =>
    updateField.mutate(
      { fieldKey, request: { displayName, selectOptions } },
      { onSuccess: closeEditor },
    );

  const saveError = updateField.isError ? problemMessage(updateField.error) : null;
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
      </div>

      {catalog.isLoading && (
        <p className="caption" role="status">
          Loading the platform field catalog…
        </p>
      )}

      {catalog.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The platform field catalog could not be loaded. Try again in a moment.
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

      {catalog.data && allRows.length === 0 && (
        <div className="fields-catalog__no-matches">
          <p className="fields-catalog__no-matches-title">No platform fields are defined yet</p>
        </div>
      )}

      {catalog.data && view.total > 0 && (
        <>
          <FieldCatalogTable
            caption="Platform field definitions"
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

      {editingField && (
        <PlatformFieldEditorSheet
          field={editingField}
          isSaving={updateField.isPending}
          saveError={saveError}
          onSave={onSave}
          onClose={closeEditor}
        />
      )}

      {readonlyRow && (
        <FieldEditorSheet
          initialObjectType={readonlyRow.objectType}
          field={null}
          readOnly
          readOnlyForm={buildFormFromCatalogRow(readonlyRow)}
          lockMessage={lockMessageForSource(readonlyRow.source)}
          availableKeysByObject={{}}
          saveError={null}
          isSaving={false}
          onSave={() => {}}
          onClose={() => setReadonlyRow(null)}
        />
      )}
    </div>
  );
}
