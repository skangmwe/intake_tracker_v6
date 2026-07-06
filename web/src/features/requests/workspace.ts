// Re-export: the active-workspace resolver moved to shared/ once a third feature (Search) needed it
// (web-file-structure.md — utils used by 2+ features live in shared/, not inside a feature). Existing
// requests-feature imports of `./workspace` keep working unchanged.

export { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';
