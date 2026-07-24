// Public API for the Objects feature (S30 Fields & objects → Objects tab).
export { ObjectsAdminTab } from './components/ObjectsAdminTab';
// Read the workspace's object types — the custom-records surfaces (SP2) resolve a route's objectKey
// slug to its ObjectDefinition through this hook.
export { useWorkspaceObjects, objectsQueryKey } from './useObjects';
