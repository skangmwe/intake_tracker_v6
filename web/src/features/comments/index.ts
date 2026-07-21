// Public API of the comments feature. Only exports intended for other features / routing go here.
export { ActivityTab } from './ActivityTab';
// The activity thread hook — consumed by the S4 Status-history trail (record-detail reconciliation).
export { useThread } from './useComments';
