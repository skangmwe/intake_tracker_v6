// Public API of the saved-views feature (S24). Exports the editor + hooks other list surfaces (S2,
// S9) compose, plus a mapper from the wire SavedViewDto to the SavedViewPicker's row shape.

import type { SavedViewDto } from '@shared/types';
import type { SavedView } from '@/shared/components/Table';

export { ViewsDashboardsPage } from './components/ViewsDashboardsPage';
export { SavedViewEditor } from './components/SavedViewEditor';
export type { SavedViewEditorProps } from './components/SavedViewEditor';
export type { ColumnOption } from './components/SavedViewEditorTabs';
export {
  useSavedViews,
  useCreateSavedView,
  useUpdateSavedView,
  useDeleteSavedView,
  savedViewsKey,
} from './useSavedViews';

/** Map a wire SavedViewDto onto the SavedViewPicker's row shape (id/name/scope/tag). */
export function toPickerView(view: SavedViewDto): SavedView {
  return {
    id: view.id,
    name: view.name,
    scope: view.scope,
    isDefault: view.isDefault,
    ...(view.isDefault ? { tag: 'Default' } : {}),
  };
}
