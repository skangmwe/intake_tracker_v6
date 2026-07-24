// Object-schema DTOs (S30 Fields & objects → Objects tab). Shared by web/ and api/. Shapes align
// with the api/ ObjectDtos.cs records; property names are camelCase (ASP.NET Core web-default
// serialization). An "object" here is a record TYPE in the workspace (Request, Task, a custom
// object …) — not a runtime record. The five built-ins are composed server-side as constants with
// live counts; custom objects are persisted in dbo.ObjectDefinition.

/** Where an object type is scoped. 'Global' is shared firm-wide; 'LocalWorkspace' is this workspace only. */
export type ObjectLocation = 'Global' | 'LocalWorkspace';

/** One object type on the Objects tab. `recordsCount`/`fieldsCount` are derived (read-only). */
export interface ObjectDefinitionDto {
  id: string;
  workspaceId: string;
  /** Immutable per-workspace slug (e.g. "vendor"); the built-in analogue is the canonical type key
   *  ("Request", "Task", "ToolkitItem", …). Used as FieldDefinition.objectType for the object's fields. */
  objectKey: string;
  name: string;
  pluralLabel: string | null;
  location: ObjectLocation;
  description: string | null;
  showInSidebar: boolean;
  sidebarCategory: string | null;
  /** Live count of records of this type in the workspace (0 for a freshly-registered custom object). */
  recordsCount: number;
  /** Live count of active field definitions for this type (0 for objects with no field schema). */
  fieldsCount: number;
  /** True for the five built-in objects — read-only in the editor, cannot be deleted. */
  isSystem: boolean;
}

/** Create a custom object. */
export interface ObjectDefinitionCreateRequest {
  name: string;
  pluralLabel?: string | null;
  location: ObjectLocation;
  description?: string | null;
  showInSidebar: boolean;
  sidebarCategory?: string | null;
}

/** Patch a custom object. Every field is optional (sparse update); omitted fields are unchanged. */
export interface ObjectDefinitionPatchRequest {
  name?: string | null;
  pluralLabel?: string | null;
  location?: ObjectLocation | null;
  description?: string | null;
  showInSidebar?: boolean | null;
  sidebarCategory?: string | null;
}
