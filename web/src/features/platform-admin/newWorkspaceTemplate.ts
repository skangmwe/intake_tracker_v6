// Static description of the one base template (PG/Dept) shown on the New workspace wizard's Review
// step. There is exactly one template today; this is presentational copy, not a live query of the
// template workspace's schema. Enumerable lists are module-level constants (web-component-architecture.md).

export interface TemplateObjectSummary {
  name: string;
  description: string;
  fieldCount: number;
}

export interface TemplateNotableField {
  name: string;
  type: string;
  object: string;
}

export interface TemplateGate {
  name: string;
  transition: string;
  approvers: string[];
}

export interface TemplateRelationship {
  label: string;
  cardinality: string;
}

export interface TemplateAccessLevel {
  name: string;
  description: string;
}

export interface TemplateSampleRecord {
  id: string;
  title: string;
  stage: string;
}

export interface WorkspaceTemplate {
  key: string;
  name: string;
  recommended: boolean;
  tagline: string;
  metaLine: string;
  blurb: string;
  objects: TemplateObjectSummary[];
  notableFields: TemplateNotableField[];
  moreFieldsCount: number;
  lifecycleName: string;
  stages: string[];
  gates: TemplateGate[];
  relationships: TemplateRelationship[];
  savedViews: string[];
  dashboards: { name: string; widgetCount: number }[];
  accessLevels: TemplateAccessLevel[];
  sampleRecords: TemplateSampleRecord[];
}

export const PGDEPT_TEMPLATE: WorkspaceTemplate = {
  key: 'pg-dept',
  name: 'PG/Dept Template',
  recommended: true,
  tagline: 'The standard AI-solutions delivery workspace.',
  metaLine: '3 objects · 7-stage lifecycle · 5 views',
  blurb:
    'Mirrors how Litigation and M&A run today — requests come in, break into delivery tasks, and move through a gated build lifecycle. The best starting point for a practice group adopting the platform.',
  objects: [
    { name: 'Requests', description: 'Core intake record', fieldCount: 12 },
    { name: 'Tasks', description: 'Delivery work, grouped by build phase', fieldCount: 6 },
    { name: 'Attachments', description: 'Files linked to a request or task', fieldCount: 2 },
  ],
  notableFields: [
    { name: 'Stage', type: 'Single-select', object: 'Request' },
    { name: 'Priority score', type: 'Number', object: 'Request' },
    { name: 'Analyst', type: 'Link to record', object: 'Request' },
    { name: 'Due date', type: 'Date', object: 'Request' },
    { name: 'Hold / Blocked', type: 'Boolean', object: 'Request' },
    { name: 'Repo URL', type: 'URL', object: 'Task' },
  ],
  moreFieldsCount: 14,
  lifecycleName: 'Standard delivery',
  stages: ['Intake', 'Triage', 'Execution', 'Validation', 'Delivery', 'Stabilization', 'Closure'],
  gates: [
    {
      name: 'Validation readiness gate',
      transition: 'Execution → Validation',
      approvers: ['InfoSec', 'AI Solutions Manager', 'PG/Dept Lead'],
    },
    {
      name: 'Stabilization readiness gate',
      transition: 'Delivery → Stabilization',
      approvers: ['AI Solutions Manager', 'GCO'],
    },
  ],
  relationships: [
    { label: 'Request has Tasks', cardinality: '1:many' },
    { label: 'Request has Attachments', cardinality: '1:many' },
  ],
  savedViews: ['All requests', 'My queue', 'Inflight build', 'Blocked', 'Awaiting gate'],
  dashboards: [
    { name: 'Delivery overview', widgetCount: 5 },
    { name: 'Intake health', widgetCount: 4 },
  ],
  accessLevels: [
    { name: 'Viewer', description: 'Read-only across the workspace' },
    { name: 'Member', description: 'Create and work requests and tasks' },
    { name: 'Workspace admin', description: 'Configure fields, lifecycle, and access' },
  ],
  sampleRecords: [
    { id: 'REQ-00000001', title: 'Contract clause extractor', stage: 'Execution' },
    { id: 'REQ-00000002', title: 'Intake triage assistant', stage: 'Triage' },
    { id: 'REQ-00000003', title: 'Weekly status digest', stage: 'Intake' },
  ],
};
