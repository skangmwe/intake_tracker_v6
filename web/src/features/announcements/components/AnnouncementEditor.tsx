// Create / edit an announcement inside a modal (S23), reconciled to the prototype. Fields: Title, Body,
// Posted by (any workspace member), Status (Active / Scheduled — Scheduled reveals a publish date-time),
// an Auto-archive-after-30-days toggle with a computed "moves to Archived on {date}" helper, and Pin.
// Validates on submit (forms-and-input.md) and surfaces the API's plain-language error. Footer: Cancel /
// Add (create) · Cancel / Save changes (edit).

import { useState } from 'react';
import type { AnnouncementDto, AnnouncementWriteStatus, UserId } from '@shared/types';

import { Modal } from '@/shared/components/Disclosure';
import { Button } from '@/shared/components/Button';
import {
  DateTimeField,
  Select,
  type SelectOption,
  TextArea,
  TextField,
} from '@/shared/components/Form';

import { AUTO_ARCHIVE_DAYS, STATUS_WRITE_SELECT } from '../constants';

export interface EditorValue {
  title: string;
  body: string;
  author: UserId | undefined;
  status: AnnouncementWriteStatus;
  scheduledPublishAt: string | undefined;
  autoArchive: boolean;
  pinned: boolean;
}

interface AnnouncementEditorProps {
  mode: 'create' | 'edit';
  initial?: AnnouncementDto;
  /** Workspace members offered in the "Posted by" dropdown. */
  authorOptions: SelectOption[];
  /** The acting admin — the default poster when creating. */
  defaultAuthor: UserId | undefined;
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (value: EditorValue) => void;
  onClose: () => void;
  /** Archive-now (edit mode only) — reuses the retire path. Omitted when archiving isn't offered. */
  onArchive?: (() => void) | undefined;
}

const MS_PER_DAY = 86_400_000;

/** An ISO instant → the `YYYY-MM-DDTHH:mm` local wall-clock value a datetime-local input expects. */
function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** The local wall-clock value from a datetime-local input → an ISO instant, or '' when unparseable. */
function localInputToIso(local: string): string {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function formatArchiveDate(baseMs: number): string {
  return new Date(baseMs + AUTO_ARCHIVE_DAYS * MS_PER_DAY).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function initialStatus(initial: AnnouncementDto | undefined): AnnouncementWriteStatus {
  return initial?.status === 'Scheduled' ? 'Scheduled' : 'Active';
}

export function AnnouncementEditor({
  mode,
  initial,
  authorOptions,
  defaultAuthor,
  submitting,
  errorMessage,
  onSubmit,
  onClose,
  onArchive,
}: AnnouncementEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [author, setAuthor] = useState<string>(initial?.author ?? defaultAuthor ?? '');
  const [status, setStatus] = useState<AnnouncementWriteStatus>(initialStatus(initial));
  const [publishAt, setPublishAt] = useState(isoToLocalInput(initial?.scheduledPublishAt));
  const [autoArchive, setAutoArchive] = useState(initial?.autoArchive ?? true);
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isScheduled = status === 'Scheduled';

  const scheduledBaseMs =
    isScheduled && publishAt
      ? new Date(publishAt).getTime()
      : Date.parse(initial?.publishedAt ?? '');
  const archiveBaseMs = Number.isNaN(scheduledBaseMs) ? Date.now() : scheduledBaseMs;
  const archiveNote = autoArchive
    ? `Automatically moves to Archived on ${formatArchiveDate(archiveBaseMs)} (${AUTO_ARCHIVE_DAYS} days after publish).`
    : 'Stays visible until archived manually.';

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (title.trim().length === 0)
      nextErrors.title = 'Add a title so people know what this is about.';
    if (body.trim().length === 0) nextErrors.body = 'Add the announcement text.';
    if (isScheduled) {
      if (!publishAt) {
        nextErrors.publishAt = 'Choose when this announcement should publish.';
      } else if (new Date(publishAt).getTime() <= Date.now()) {
        nextErrors.publishAt = 'Pick a date and time in the future.';
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({
      title: title.trim(),
      body,
      author: (author || undefined) as UserId | undefined,
      status,
      scheduledPublishAt: isScheduled ? localInputToIso(publishAt) : undefined,
      autoArchive,
      pinned,
    });
  };

  const heading = mode === 'create' ? 'New announcement' : 'Edit announcement';
  const submitLabel = mode === 'create' ? 'Add' : 'Save changes';
  // Archive-now is offered only when editing a live announcement (Active / Scheduled) — an already
  // Archived (or legacy Retired) row is terminal and immutable.
  const canArchive =
    mode === 'edit' &&
    Boolean(onArchive) &&
    initial?.status !== 'Archived' &&
    initial?.status !== 'Retired';

  return (
    <Modal
      title={heading}
      onClose={onClose}
      footer={
        <>
          {canArchive && (
            <span className="ann-editor__archive">
              <Button variant="destructive" onClick={onArchive} disabled={submitting}>
                Archive now
              </Button>
            </span>
          )}
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : submitLabel}
          </Button>
        </>
      }
    >
      <div className="ann-editor">
        {errorMessage && (
          <p className="mws-alert mws-alert--error" role="alert">
            {errorMessage}
          </p>
        )}
        <TextField label="Title" value={title} onChange={setTitle} error={errors.title} />
        <TextArea
          label="Body"
          value={body}
          onChange={setBody}
          rows={5}
          error={errors.body}
          hint="Links and light formatting are allowed."
        />
        <Select
          label="Posted by"
          value={author}
          onChange={setAuthor}
          options={authorOptions}
          placeholder="Choose a member"
        />
        <Select
          label="Status"
          value={status}
          onChange={(value) => setStatus(value as AnnouncementWriteStatus)}
          options={STATUS_WRITE_SELECT}
        />
        {isScheduled && (
          <DateTimeField
            label="Publish date & time"
            value={publishAt}
            onChange={setPublishAt}
            error={errors.publishAt}
            hint="The announcement goes live at this time."
          />
        )}
        <div className="ann-switch" data-ds="toggle">
          <span className="ann-switch__text">
            <span className="ann-switch__title">Auto-archive after {AUTO_ARCHIVE_DAYS} days</span>
            <span className="caption">{archiveNote}</span>
          </span>
          <label className="mws-switch">
            <input
              type="checkbox"
              aria-label={`Auto-archive after ${AUTO_ARCHIVE_DAYS} days`}
              checked={autoArchive}
              onChange={(event) => setAutoArchive(event.target.checked)}
            />
            <span className="mws-switch__track">
              <span className="mws-switch__thumb" />
            </span>
          </label>
        </div>
        <label className="ann-check">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
            data-ds="checkbox"
          />
          <span>Pin to the top of Home until it is unpinned</span>
        </label>
      </div>
    </Modal>
  );
}
