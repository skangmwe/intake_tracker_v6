// Public API of the fields feature. Only exports intended for other features / routing go here.
export { FieldsAdminPage } from './components/FieldsAdminPage';
export { PlatformFieldsPage } from './components/PlatformFieldsPage';
// Read the workspace field schema — the dashboard composer (slice 28) sources its dept scope options
// from the deptPgClient select field.
export { useWorkspaceFields } from './useFields';
