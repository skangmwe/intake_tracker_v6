// Custom-object record DTOs (SP2). Shared by web/ and api/ — property names are camelCase to match
// the api/ CustomRecordDtos.cs records (ASP.NET Core web-default serialization). A "custom record" is
// a runtime row of a custom ObjectDefinition; its schema is a set of FieldDefinitions keyed by the
// object's ObjectKey slug, and its values live in the free-form FieldValues JSON bag.

import type { IsoDateTime } from './common';

/** A full custom record (Create / Get / Patch response). `fields` is the FieldValues bag. */
export interface CustomRecordDto {
  id: string;
  objectDefinitionId: string;
  name: string;
  fields: Record<string, unknown>;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  createdBy: string;
  /** Concurrency token (row version, base64) — carried for future last-write-wins edits. */
  eTag: string;
}

/** One row of the paginated records list — the scannable subset of a full record. */
export interface CustomRecordListRow {
  id: string;
  name: string;
  fields: Record<string, unknown>;
  eTag: string;
}

/** Create / replace body for a custom record. `fields` is the full FieldValues bag. */
export interface CustomRecordWriteRequest {
  name: string;
  fields: Record<string, unknown>;
}
