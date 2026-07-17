// Public barrel for the relationships feature (Slice 25). Consumers outside the feature
// import through this file only (see .claude/rules/dev/web-file-structure.md).

export * from './api';
export * from './useRelationshipTabs';
export * from './useRelationships';
export { GenericRelatedRecordsTab } from './GenericRelatedRecordsTab';
export { RelationshipsAdminTab } from './RelationshipsAdminTab';
export { RelationshipsSidePanel } from './RelationshipsSidePanel';
