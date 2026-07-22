// Platform Fields & objects — Fields tab (S34). The platform analogue of the workspace S30 Fields
// catalog: the same flat catalog table (system auto-fields on the Global objects, the platform-defined
// fields, and every Global field across all workspaces). Platform-defined fields (Legacy ID, AI
// Solutions Status) open an editor that applies firm-wide; everything else opens read-only. Platform
// admins only — a non-admin gets a no-access message that never leaks the data. Renders explicit
// loading / error / empty states (web-component-architecture.md). (Objects + Relationships tabs: B2.)

import { useMemo, useState } from 'react';

import type { FieldCatalogRowDto } from '@shared/types';

import { useMe } from '@/features/users/useMe';
import { Button } from '@/shared/components/Button';
import { type FilterValue, type SortState } from '@/shared/components/Table';

import { problemMessage } from '../errorMessage';
import {
  type CatalogColumnKey,
  type CatalogFilters,
  isFilterActive,
  selectCatalogView,
} from '../fieldCatalogView';
import { usePlatformFieldCatalog, usePlatformFields, useUpdatePlatformField } from '../useFields';
import { FieldCatalogTable } from './FieldCatalogTable';
import { FieldReadOnlySheet } from './FieldReadOnlySheet';
import { PlatformFieldEditorSheet } from './PlatformFieldEditorSheet';

const NO_FILTERS: CatalogFilters = {};

export function PlatformFieldsPage() {
  const { data: me, isLoading: isMeLoading } = useMe();
  const isPlatformAdmin = me?.isPlatformAdmin ?? false;

  const catalog = usePlatformFieldCatalog(isPlatformAdmin);
  // The full platform-field definitions carry the Select options the editor needs to seed itself.
  const platformFields = usePlatformFields(isPlatformAdmin);
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

  if (isMeLoading && !me) {
    return (
      <p className="caption" role="status">
        Loading…
      </p>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <section className="mws-empty mws-empty--zero" aria-labelledby="platform-no-access">
        <h1 id="platform-no-access" className="h2">
          Fields &amp; objects
        </h1>
        <p className="body">
          You don’t have access to this. Ask a Platform admin if you need a change to the central
          field schema.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="platform-fields-heading">
      <header className="fields-header">
        <div>
          <p className="eyebrow fields-eyebrow">Platform settings</p>
          <h1 id="platform-fields-heading" className="h2">
            Fields &amp; objects
          </h1>
          <p className="body">Platform-level field definitions inherited by every workspace.</p>
        </div>
      </header>

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
      </div>

      {editingField && (
        <PlatformFieldEditorSheet
          field={editingField}
          isSaving={updateField.isPending}
          saveError={saveError}
          onSave={onSave}
          onClose={closeEditor}
        />
      )}

      {readonlyRow && <FieldReadOnlySheet row={readonlyRow} onClose={() => setReadonlyRow(null)} />}
    </section>
  );
}
