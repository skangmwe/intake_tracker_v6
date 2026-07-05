// Attachments card — the S4/S5 Attachments tab (BS §2.3). Drag-and-drop / choose-file upload with
// per-file progress, an external-link attach form, and the stored list with download + remove.
// Renders explicit loading / error / empty states (web-component-architecture.md). Files follow the
// record; the API is the authority on visibility (a forbidden record is a 403, surfaced as a no-
// access record page upstream — this card only renders for records the caller can already see).

import { useRef, useState } from 'react';
import { CircleNotch, FileText, LinkSimple, Paperclip, UploadSimple, WarningCircle, X } from '@phosphor-icons/react';

import type { AttachmentDto, RecordId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { TextField } from '@/shared/components/Form';
import { problemMessage } from '@/shared/http/problemMessage';

import {
  saveAttachment,
  useAttachLink,
  useAttachmentUploader,
  useRecordAttachments,
  useRemoveAttachment,
} from './useAttachments';
import './attachments.css';

/** Human-readable file size — integers show whole, others to one decimal (e.g. "2 KB", "1.5 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${units[exponent]}`;
}

function AttachmentRow({ attachment, onRemove, removing }: { attachment: AttachmentDto; onRemove: () => void; removing: boolean }) {
  const [downloadError, setDownloadError] = useState(false);
  const open = () => {
    setDownloadError(false);
    saveAttachment(attachment).catch(() => setDownloadError(true));
  };

  return (
    <li className="attachments__item">
      <span className="attachments__icon" aria-hidden>
        {attachment.isLink ? <LinkSimple size={18} /> : <FileText size={18} />}
      </span>
      <button type="button" className="attachments__open" onClick={open}>
        <span className="attachments__name">{attachment.fileName}</span>
      </button>
      {!attachment.isLink && <span className="attachments__meta">{formatBytes(attachment.sizeBytes)}</span>}
      {downloadError && (
        <span className="attachments__meta" role="status">
          Couldn’t open
        </span>
      )}
      <button
        type="button"
        className="attachments__remove"
        aria-label={`Remove ${attachment.fileName}`}
        onClick={onRemove}
        disabled={removing}
      >
        <X size={14} aria-hidden />
      </button>
    </li>
  );
}

function LinkForm({ recordId, onDone }: { recordId: RecordId; onDone: () => void }) {
  const attach = useAttachLink(recordId);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [touched, setTouched] = useState(false);

  const urlError = touched && url.trim() === '' ? 'Enter a link.' : undefined;
  const titleError = touched && title.trim() === '' ? 'Give the link a title.' : undefined;

  const submit = () => {
    setTouched(true);
    if (url.trim() === '' || title.trim() === '') return;
    attach.mutate(
      { url: url.trim(), title: title.trim() },
      {
        onSuccess: () => {
          setUrl('');
          setTitle('');
          setTouched(false);
          onDone();
        },
      },
    );
  };

  return (
    <div className="attachments__link-form">
      <TextField label="Link URL" value={url} onChange={setUrl} placeholder="https://…" error={urlError} />
      <TextField label="Title" value={title} onChange={setTitle} error={titleError} />
      {attach.isError && (
        <p className="mws-alert mws-alert--warning" role="status">
          {problemMessage(attach.error, 'The link couldn’t be attached. Try again in a moment.')}
        </p>
      )}
      <div className="attachments__actions">
        <Button variant="primary" onClick={submit} disabled={attach.isPending}>
          Attach link
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function AttachmentsCard({ recordId }: { recordId: RecordId }) {
  const { data, isLoading, isError, error } = useRecordAttachments(recordId);
  const uploader = useAttachmentUploader(recordId);
  const remove = useRemoveAttachment(recordId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const addFiles = (files: FileList | null) => {
    if (files && files.length > 0) uploader.enqueue(Array.from(files));
  };

  const attachments = data ?? [];
  const nothingYet = !isLoading && !isError && attachments.length === 0 && uploader.items.length === 0;

  return (
    <section className="record-card" aria-label="Attachments">
      <span className="record-chip">Attachments</span>

      <div
        className={`attachments__dropzone${dragging ? ' attachments__dropzone--active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        <span className="attachments__icon" aria-hidden>
          <UploadSimple size={24} />
        </span>
        <p className="attachments__dropzone-hint">Drag files here, or</p>
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          <Paperclip size={16} aria-hidden />
          Choose files
        </Button>
        <input
          ref={inputRef}
          className="attachments__file-input"
          type="file"
          multiple
          aria-label="Choose files to upload"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {uploader.items.length > 0 && (
        <ul className="attachments__list" aria-live="polite">
          {uploader.items.map((item) => (
            <li key={item.id} className={`attachments__upload${item.status === 'failed' ? ' attachments__upload--failed' : ''}`}>
              <span className="attachments__icon" aria-hidden>
                {item.status === 'uploading' ? (
                  <span className="attachments__spinner">
                    <CircleNotch size={16} />
                  </span>
                ) : (
                  <WarningCircle size={16} />
                )}
              </span>
              <span className="attachments__name">{item.fileName}</span>
              {item.status === 'uploading' ? (
                <span className="attachments__meta">Uploading…</span>
              ) : (
                <>
                  <span className="attachments__meta">Upload failed</span>
                  <Button variant="secondary" onClick={() => uploader.retry(item.id)}>
                    Retry
                  </Button>
                  <button
                    type="button"
                    className="attachments__remove"
                    aria-label={`Dismiss ${item.fileName}`}
                    onClick={() => uploader.dismiss(item.id)}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {isLoading && (
        <p className="caption" role="status">
          Loading attachments…
        </p>
      )}

      {isError && (
        <p className="mws-alert mws-alert--warning" role="status">
          {problemMessage(error, 'Attachments couldn’t be loaded. Try again in a moment.')}
        </p>
      )}

      {nothingYet && <p className="caption">No attachments yet.</p>}

      {attachments.length > 0 && (
        <ul className="attachments__list">
          {attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.id}
              attachment={attachment}
              onRemove={() => remove.mutate(attachment.id)}
              removing={remove.isPending}
            />
          ))}
        </ul>
      )}

      {remove.isError && (
        <p className="mws-alert mws-alert--warning" role="status">
          {problemMessage(remove.error, 'The attachment couldn’t be removed. Try again in a moment.')}
        </p>
      )}

      {linkOpen ? (
        <LinkForm recordId={recordId} onDone={() => setLinkOpen(false)} />
      ) : (
        <div className="attachments__actions">
          <Button variant="secondary" onClick={() => setLinkOpen(true)}>
            <LinkSimple size={16} aria-hidden />
            Attach a link
          </Button>
        </div>
      )}
    </section>
  );
}
