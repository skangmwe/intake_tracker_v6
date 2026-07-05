// TanStack Query hooks + a concurrency-limited uploader for attachments (S4/S5 Attachments tab —
// web-state-management.md). The list / link / delete hooks follow the standard invalidate pattern;
// the uploader tracks per-file progress (uploading / stored / failed) and runs at most
// MAX_CONCURRENT_UPLOADS at a time, queueing the rest (web-blob-attachments.md). Query keys are
// exported so pages and tests can target / invalidate precisely.

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AttachmentDto, AttachmentId, AttachmentLinkRequest, RecordId } from '@shared/types';

import { attachExternalLink, fetchAttachmentContent, fetchRecordAttachments, removeAttachment, uploadAttachment } from './api';

/** Upload concurrency ceiling — a network-efficiency cap, not a grouping concept (web-blob-attachments.md). */
export const MAX_CONCURRENT_UPLOADS = 5;

export const recordAttachmentsKey = (recordId: RecordId) => ['record-attachments', recordId] as const;

/** A record's attachments (Attachments tab). */
export function useRecordAttachments(recordId: RecordId | undefined) {
  return useQuery<AttachmentDto[]>({
    queryKey: recordId ? recordAttachmentsKey(recordId) : ['record-attachments', 'disabled'],
    queryFn: ({ signal }) => fetchRecordAttachments(recordId as RecordId, signal),
    enabled: Boolean(recordId),
  });
}

/** Attach an external URL. Invalidates the attachments list. */
export function useAttachLink(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<AttachmentDto, unknown, AttachmentLinkRequest>({
    mutationFn: (request) => attachExternalLink(recordId, request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordAttachmentsKey(recordId) });
    },
  });
}

/** Remove an attachment. Invalidates the attachments list. */
export function useRemoveAttachment(recordId: RecordId) {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, AttachmentId>({
    mutationFn: (attachmentId) => removeAttachment(attachmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recordAttachmentsKey(recordId) });
    },
  });
}

/** Save an attachment locally — open the URL for a link, or fetch + download the bytes for a file. */
export async function saveAttachment(attachment: AttachmentDto): Promise<void> {
  if (attachment.isLink) {
    if (attachment.externalUrl) window.open(attachment.externalUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  const blob = await fetchAttachmentContent(attachment.id);
  const url = URL.createObjectURL(blob);
  try {
    // A transient <a download> is the only way to save a Blob — not rendered React DOM.
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = attachment.fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Uploader ───────────────────────────────────────────────────────────────

export type UploadStatus = 'uploading' | 'failed';

export interface UploadItem {
  id: string;
  fileName: string;
  status: UploadStatus;
}

type UploaderAction =
  | { type: 'add'; items: UploadItem[] }
  | { type: 'setStatus'; id: string; status: UploadStatus }
  | { type: 'remove'; id: string };

function uploaderReducer(state: UploadItem[], action: UploaderAction): UploadItem[] {
  switch (action.type) {
    case 'add':
      return [...state, ...action.items];
    case 'setStatus':
      return state.map((item) => (item.id === action.id ? { ...item, status: action.status } : item));
    case 'remove':
      return state.filter((item) => item.id !== action.id);
  }
}

export interface AttachmentUploader {
  items: UploadItem[];
  enqueue: (files: File[]) => void;
  retry: (id: string) => void;
  dismiss: (id: string) => void;
}

/**
 * Manages the per-file upload lifecycle with a concurrency cap. A stored file drops out of the
 * tracker (it reappears in the invalidated list); a failed file stays with a Retry affordance.
 */
export function useAttachmentUploader(recordId: RecordId): AttachmentUploader {
  const queryClient = useQueryClient();
  const [items, dispatch] = useReducer(uploaderReducer, []);
  const filesRef = useRef<Map<string, File>>(new Map());
  const queueRef = useRef<string[]>([]);
  const activeRef = useRef(0);
  const pumpRef = useRef<() => void>(() => {});

  const run = useCallback(
    async (id: string) => {
      const file = filesRef.current.get(id);
      if (!file) return;
      activeRef.current += 1;
      try {
        await uploadAttachment(recordId, file);
        filesRef.current.delete(id);
        dispatch({ type: 'remove', id });
        void queryClient.invalidateQueries({ queryKey: recordAttachmentsKey(recordId) });
      } catch {
        dispatch({ type: 'setStatus', id, status: 'failed' });
      } finally {
        activeRef.current -= 1;
        pumpRef.current();
      }
    },
    [recordId, queryClient],
  );

  const pump = useCallback(() => {
    while (activeRef.current < MAX_CONCURRENT_UPLOADS && queueRef.current.length > 0) {
      const id = queueRef.current.shift();
      if (id) void run(id);
    }
  }, [run]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const enqueue = useCallback((files: File[]) => {
    const added: UploadItem[] = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      filesRef.current.set(id, file);
      queueRef.current.push(id);
      added.push({ id, fileName: file.name, status: 'uploading' });
    }
    if (added.length > 0) {
      dispatch({ type: 'add', items: added });
      pumpRef.current();
    }
  }, []);

  const retry = useCallback((id: string) => {
    if (!filesRef.current.has(id)) return;
    dispatch({ type: 'setStatus', id, status: 'uploading' });
    queueRef.current.push(id);
    pumpRef.current();
  }, []);

  const dismiss = useCallback((id: string) => {
    filesRef.current.delete(id);
    dispatch({ type: 'remove', id });
  }, []);

  return { items, enqueue, retry, dismiss };
}
