// S30 Objects tab — the workspace's object types (five built-ins + custom). Owns the list-surface
// view state (sort, per-column filters, page) so the shared TableShell + TableFooter render like the
// other list screens, plus the create/edit/delete flow via the object editor sheet. Renders the three
// non-data states explicitly (web-component-architecture.md).

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';

import type { ObjectDefinitionDto, WorkspaceId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import {
  type FilterOption,
  type FilterValue,
  type SortState,
  TableFooter,
} from '@/shared/components/Table';
import { problemMessage } from '@/shared/http/problemMessage';

import { OBJECTS_PAGE_SIZE } from '@/shared/constants';

import { LOCATION_OPTIONS } from '../constants';
import {
  type ObjectColumnKey,
  type ObjectsFilters,
  isFilterActive,
  selectObjectsView,
} from '../objectsView';
import {
  type SaveObjectInput,
  useDeleteObject,
  useSaveObject,
  useWorkspaceObjects,
} from '../useObjects';
import { ObjectEditorSheet, type ObjectFormValue } from './ObjectEditorSheet';
import { ObjectsTable } from './ObjectsTable';

const NO_FILTERS: ObjectsFilters = {};

/** Editor state: null = closed; { object: null } = create; { object: dto } = edit/view. */
type EditorState = { object: ObjectDefinitionDto | null } | null;

export function ObjectsAdminTab({ workspaceId }: { workspaceId: WorkspaceId }) {
  const navigate = useNavigate();
  const objects = useWorkspaceObjects(workspaceId);
  const saveObject = useSaveObject(workspaceId);
  const deleteObject = useDeleteObject(workspaceId);

  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [filters, setFilters] = useState<ObjectsFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EditorState>(null);

  const allObjects = useMemo(() => objects.data ?? [], [objects.data]);
  const view = useMemo(
    () => selectObjectsView(allObjects, sort, filters, page, OBJECTS_PAGE_SIZE),
    [allObjects, sort, filters, page],
  );
  const locationOptions: FilterOption[] = useMemo(
    () =>
      LOCATION_OPTIONS.map((option) => ({
        ...option,
        count: allObjects.filter((object) => object.location === option.value).length,
      })),
    [allObjects],
  );
  const existingCategories = useMemo(
    () =>
      Array.from(
        new Set(
          allObjects
            .filter((object) => object.id !== editor?.object?.id && object.sidebarCategory)
            .map((object) => object.sidebarCategory as string),
        ),
      ),
    [allObjects, editor],
  );

  const anyFilters = (Object.values(filters) as FilterValue[]).some(isFilterActive);

  const onSortChange = (next: SortState | undefined) => {
    setSort(next);
    setPage(1);
  };
  const onFilterChange = (column: ObjectColumnKey, value: FilterValue) => {
    setFilters((prev) => ({ ...prev, [column]: value }));
    setPage(1);
  };
  const clearFilters = () => {
    setFilters(NO_FILTERS);
    setPage(1);
  };

  const closeEditor = () => {
    saveObject.reset();
    deleteObject.reset();
    setEditor(null);
  };

  const onSave = (value: ObjectFormValue) => {
    const request = {
      name: value.name,
      pluralLabel: value.pluralLabel.trim() || null,
      location: value.location,
      description: value.description.trim() || null,
      showInSidebar: value.showInSidebar,
      sidebarCategory: value.showInSidebar ? value.sidebarCategory : null,
    };
    const input: SaveObjectInput =
      editor?.object == null
        ? { isCreate: true, objectId: null, request }
        : { isCreate: false, objectId: editor.object.id, request };
    saveObject.mutate(input, { onSuccess: closeEditor });
  };

  const onDelete = (objectId: string) => {
    deleteObject.mutate(objectId, { onSuccess: closeEditor });
  };

  const saveError = saveObject.isError
    ? problemMessage(saveObject.error)
    : deleteObject.isError
      ? problemMessage(deleteObject.error)
      : null;

  return (
    <div className="objects-tab">
      <div className="objects-tab__toolbar">
        {anyFilters && (
          <button type="button" className="objects-tab__clear" onClick={clearFilters}>
            Clear all filters
          </button>
        )}
        <span className="objects-tab__spacer" />
        <Button onClick={() => setEditor({ object: null })}>
          <Plus size={16} aria-hidden /> New object
        </Button>
      </div>

      {objects.isLoading && (
        <p className="caption" role="status">
          Loading objects…
        </p>
      )}

      {objects.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          The object list could not be loaded. Try again in a moment.
        </p>
      )}

      {objects.data && allObjects.length > 0 && view.total === 0 && (
        <div className="objects-tab__no-matches">
          <p className="objects-tab__no-matches-title">No objects match these filters</p>
          <Button variant="secondary" compact onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {objects.data && view.total > 0 && (
        <>
          <ObjectsTable
            rows={view.rows}
            sort={sort}
            onSortChange={onSortChange}
            filters={filters}
            onFilterChange={onFilterChange}
            locationOptions={locationOptions}
            onOpen={(object) => setEditor({ object })}
            onViewRecords={(object) => navigate(`/objects/${object.objectKey}`)}
          />
          <TableFooter
            page={Math.min(page, view.totalPages)}
            totalPages={view.totalPages}
            total={view.total}
            start={view.start}
            end={view.end}
            noun="objects"
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(view.totalPages, prev + 1))}
          />
        </>
      )}

      {editor && (
        <ObjectEditorSheet
          object={editor.object}
          existingCategories={existingCategories}
          saveError={saveError}
          isSaving={saveObject.isPending}
          isDeleting={deleteObject.isPending}
          onSave={onSave}
          onDelete={onDelete}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}
