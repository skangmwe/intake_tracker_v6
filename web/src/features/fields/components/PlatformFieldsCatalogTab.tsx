// Platform Fields & objects — Fields tab (S34). The flat catalog table: system auto-fields on the
// Global objects, the platform-defined fields (editable), fields on a Global custom object (SP3b
// Slice 2a, Task 6 — editable), and every Global field owned by a workspace (read-only). Extracted
// from PlatformFieldsPage in B2 so the page can host three tabs; behavior is unchanged. Rendered
// only for a platform admin (the page gates access). Renders explicit loading / error / empty
// states (web-component-architecture.md).

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
import { buildFormFromCatalogRow, type FieldKeyOption } from '../fieldForm';
import { useGlobalObjectFieldEditor } from '../useGlobalObjectFieldEditor';
import { usePlatformFieldCatalog, usePlatformFields, useUpdatePlatformField } from '../useFields';
import { usePlatformObjects } from '../usePlatformSchema';
import { FieldCatalogTable } from './FieldCatalogTable';
import { FieldEditorSheet } from './FieldEditorSheet';
import { GlobalObjectFieldEditLoader } from './GlobalObjectFieldEditLoader';
import { GlobalObjectFieldPicker } from './GlobalObjectFieldPicker';
import { PlatformFieldEditorSheet } from './PlatformFieldEditorSheet';

const NO_FILTERS: CatalogFilters = {};

/** A row is a Global custom object's own field (editable here — a platform admin owns Global
 * fields directly) when it's a 'User' row that isn't read-only. Every other 'User' row on this
 * screen (a foreign workspace's Global field, step 3 of the catalog builder) is always read-only,
 * so this combination is unique to Slice 2a fields. */
function isGlobalObjectFieldRow(row: FieldCatalogRowDto): boolean {
  return row.source === 'User' && !row.isReadOnly;
}

export function PlatformFieldsCatalogTab() {
  const catalog = usePlatformFieldCatalog();
  // The full platform-field definitions carry the Select options the editor needs to seed itself.
  const platformFields = usePlatformFields();
  const updateField = useUpdatePlatformField();
  const objects = usePlatformObjects();
  const globalField = useGlobalObjectFieldEditor();

  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [filters, setFilters] = useState<CatalogFilters>(NO_FILTERS);
  const [editorKey, setEditorKey] = useState<string | null>(null);
  const [readonlyRow, setReadonlyRow] = useState<FieldCatalogRowDto | null>(null);

  const allRows = useMemo(() => catalog.data?.rows ?? [], [catalog.data]);
  const view = useMemo(() => selectCatalogView(allRows, sort, filters), [allRows, sort, filters]);
  const globalCustomObjects = useMemo(
    () => (objects.data ?? []).filter((object) => !object.isSystem),
    [objects.data],
  );
  const availableKeysByObject = useMemo(() => {
    const map: Record<string, FieldKeyOption[]> = {};
    for (const row of allRows) {
      (map[row.objectType] ??= []).push({ key: row.fieldKey, label: row.displayName });
    }
    return map;
  }, [allRows]);

  const anyFilters = (Object.values(filters) as FilterValue[]).some(isFilterActive);
  const onFilterChange = (column: CatalogColumnKey, value: FilterValue) =>
    setFilters((prev) => ({ ...prev, [column]: value }));
  const clearFilters = () => setFilters(NO_FILTERS);

  const openRow = (row: FieldCatalogRowDto) => {
    if (row.source === 'Platform' && !row.isReadOnly) {
      setReadonlyRow(null);
      setEditorKey(row.fieldKey);
    } else if (isGlobalObjectFieldRow(row)) {
      setReadonlyRow(null);
      setEditorKey(null);
      globalField.open(row.objectType, row.objectLabel, row.fieldKey);
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
        <GlobalObjectFieldPicker
          objects={globalCustomObjects}
          onCreateField={(object) => globalField.open(object.objectKey, object.name, null)}
        />
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

      {globalField.state?.fieldKey === null && (
        <FieldEditorSheet
          initialObjectType={globalField.state.objectKey}
          field={null}
          fixedObject={{ objectType: globalField.state.objectKey, label: globalField.state.objectLabel }}
          availableKeysByObject={availableKeysByObject}
          saveError={globalField.saveError}
          isSaving={globalField.isSaving}
          onSave={globalField.onSave}
          onClose={globalField.close}
        />
      )}

      {globalField.state && globalField.state.fieldKey !== null && (
        <GlobalObjectFieldEditLoader
          objectKey={globalField.state.objectKey}
          objectLabel={globalField.state.objectLabel}
          fieldKey={globalField.state.fieldKey}
          availableKeysByObject={availableKeysByObject}
          saveError={globalField.saveError}
          isSaving={globalField.isSaving}
          onSave={globalField.onSave}
          onDelete={globalField.onDelete}
          isDeleting={globalField.isDeleting}
          onClose={globalField.close}
        />
      )}
    </div>
  );
}
