// Re-export of the shared problem-message helper. The implementation moved to
// `@/shared/http/problemMessage` when the comments feature became a second consumer (shared
// discipline). Kept here so existing requests-feature imports resolve unchanged.

export { problemMessage } from '@/shared/http/problemMessage';
