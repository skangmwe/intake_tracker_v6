// Attachments API calls (S4/S5 Attachments tab — api-contracts.md §8). One thin apiFetch wrapper per
// endpoint; the /api prefix is added inside apiFetch. Uploads post multipart form data (the browser
// sets the boundary); downloads go through apiFetchBlob so the bearer token rides along (a plain
// <a href> can't authenticate).

import type { AttachmentDto, AttachmentId, AttachmentLinkRequest, RecordId } from '@shared/types';

import { apiFetch, apiFetchBlob } from '@/shared/http/apiClient';

/** A record's attachments (access-respecting). */
export function fetchRecordAttachments(recordId: RecordId, signal?: AbortSignal): Promise<AttachmentDto[]> {
  return apiFetch<AttachmentDto[]>(`/v1/records/${recordId}/attachments`, signal ? { signal } : {});
}

/** Stream one file up to Blob (multipart). The controller binds the "file" form field. */
export function uploadAttachment(recordId: RecordId, file: File): Promise<AttachmentDto> {
  const form = new FormData();
  form.append('file', file, file.name);
  return apiFetch<AttachmentDto>(`/v1/records/${recordId}/attachments`, { method: 'POST', body: form });
}

/** Attach an external URL to a record (no upload). */
export function attachExternalLink(recordId: RecordId, request: AttachmentLinkRequest): Promise<AttachmentDto> {
  return apiFetch<AttachmentDto>(`/v1/records/${recordId}/attachments/link`, { method: 'POST', body: request });
}

/** Soft-delete an attachment. */
export function removeAttachment(attachmentId: AttachmentId): Promise<void> {
  return apiFetch<void>(`/v1/attachments/${attachmentId}`, { method: 'DELETE' });
}

/** Fetch a native attachment's bytes (authenticated). Links are opened directly, never fetched. */
export function fetchAttachmentContent(attachmentId: AttachmentId, signal?: AbortSignal): Promise<Blob> {
  return apiFetchBlob(`/v1/attachments/${attachmentId}/content`, signal);
}
