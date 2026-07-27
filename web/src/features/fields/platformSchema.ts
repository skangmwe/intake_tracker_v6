// Platform Fields & objects — Objects / Relationships tab data (S34, B2; Global custom objects, SP3b).
// Behind the platform schema screen: the Global object types (built-ins + Global custom objects a
// platform admin manages), fields on a Global custom object (SP3b Slice 2a, Task 6), and the
// canonical system-seeded relationships every workspace inherits (de-duplicated across workspaces).
// Every endpoint is Platform-admin gated server-side (403 for a non-admin) — the page renders these
// tabs only for a platform admin.

import type {
  FieldDefinitionDto,
  FieldDefinitionUpsertRequest,
  ObjectDefinitionCreateRequest,
  ObjectDefinitionDto,
  ObjectDefinitionPatchRequest,
  RelationshipDto,
} from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

/** Every Global object type — the built-ins (Request, Task) and Global custom objects (S34 / SP3b). */
export function fetchPlatformObjects(signal?: AbortSignal): Promise<ObjectDefinitionDto[]> {
  return apiFetch<ObjectDefinitionDto[]>('/v1/platform/objects', signal ? { signal } : {});
}

/** Create a Global custom object. Location is forced to Global server-side. */
export function createPlatformObject(
  request: ObjectDefinitionCreateRequest,
): Promise<ObjectDefinitionDto> {
  return apiFetch<ObjectDefinitionDto>('/v1/platform/objects', { method: 'POST', body: request });
}

/** Patch a Global custom object. */
export function updatePlatformObject(
  objectId: string,
  request: ObjectDefinitionPatchRequest,
): Promise<ObjectDefinitionDto> {
  return apiFetch<ObjectDefinitionDto>(`/v1/platform/objects/${objectId}`, {
    method: 'PATCH',
    body: request,
  });
}

/** Soft-delete a Global custom object. */
export function deletePlatformObject(objectId: string): Promise<void> {
  return apiFetch<void>(`/v1/platform/objects/${objectId}`, { method: 'DELETE' });
}

/**
 * The full stored field definitions (options/rules included) on a Global custom object (SP3b
 * Slice 2a, Task 6). Used to seed the admin editor before an edit — the flat platform catalog row
 * omits options/rules, and the upsert replaces both wholesale, so editing from the catalog row
 * alone would silently clear them.
 */
export function fetchPlatformObjectFields(
  objectKey: string,
  signal?: AbortSignal,
): Promise<FieldDefinitionDto[]> {
  return apiFetch<FieldDefinitionDto[]>(
    `/v1/platform/objects/${objectKey}/fields`,
    signal ? { signal } : {},
  );
}

/** Create a field on a Global custom object. Object and Location are forced server-side. */
export function createPlatformObjectField(
  objectKey: string,
  request: FieldDefinitionUpsertRequest,
): Promise<FieldDefinitionDto> {
  return apiFetch<FieldDefinitionDto>(`/v1/platform/objects/${objectKey}/fields`, {
    method: 'POST',
    body: request,
  });
}

/** Patch a field on a Global custom object. */
export function updatePlatformObjectField(
  objectKey: string,
  fieldKey: string,
  request: FieldDefinitionUpsertRequest,
): Promise<FieldDefinitionDto> {
  return apiFetch<FieldDefinitionDto>(`/v1/platform/objects/${objectKey}/fields/${fieldKey}`, {
    method: 'PATCH',
    body: request,
  });
}

/** Retire (soft-delete) a field on a Global custom object. */
export function deletePlatformObjectField(objectKey: string, fieldKey: string): Promise<void> {
  return apiFetch<void>(`/v1/platform/objects/${objectKey}/fields/${fieldKey}`, {
    method: 'DELETE',
  });
}

/** The canonical system-seeded relationships, read-only, de-duplicated across workspaces (S34). */
export function fetchPlatformRelationships(signal?: AbortSignal): Promise<RelationshipDto[]> {
  return apiFetch<RelationshipDto[]>('/v1/platform/relationships', signal ? { signal } : {});
}
