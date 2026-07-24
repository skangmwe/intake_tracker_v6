// Create / edit a platform broadcast inside a modal. Mirrors the workspace AnnouncementEditor — Title,
// Body, Status (Active / Scheduled + publish date-time), Auto-archive toggle, Pin — but drops "Posted by"
// (the poster is the acting platform admin) and adds a target picker: All workspaces or specific ones.
// Targets are fixed at creation, so the target section shows only in create mode. Validates on submit
// (forms-and-input.md) and surfaces the API's plain-language error.

import { useState } from 'react';
import type {
  AnnouncementWriteStatus,
  PlatformAnnouncementRow,
  PlatformAnnouncementTarget,
  PlatformWorkspaceDto,
  WorkspaceId,
} from '@shared/types';

import { Modal } from '@/shared/components/Disclosure';
import { Button } from '@/shared/components/Button';
import { DateTimeField, Select, TextArea, TextField } from '@/shared/components/Form';

import { AUTO_ARCHIVE_DAYS, STATUS_WRITE_SELECT } from '../constants';
import { formatArchiveDate, isoToLocalInput, localInputToIso } from '../editorDates';

export interface PlatformEditorValue {
  title: string;
  body: string;
  status: AnnouncementWriteStatus;
  scheduledPublishAt: string | undefined;
  autoArchive: boolean;
  pinned: boolean;
  /** Only meaningful in create mode; edit keeps the original targets. */
  target: PlatformAnnouncementTarget;
}

interface PlatformBroadcastEditorProps {
  mode: 'create' | 'edit';
  initial?: PlatformAnnouncementRow;
  /** The workspaces offered in the "Specific workspaces" list (create mode). */
  workspaces: PlatformWorkspaceDto[];
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (value: PlatformEditorValue) => void;
  onClose: () => void;
  /** Retire-now (edit mode only). Omitted when retiring isn't offered. */
  onRetire?: (() => void) | undefined;
}

function initialStatus(initial: PlatformAnnouncementRow | undefined): AnnouncementWriteStatus {
  return initial?.status === 'Scheduled' ? 'Scheduled' : 'Active';
}

export function PlatformBroadcastEditor({
  mode,
  initial,
  workspaces,
  submitting,
  errorMessage,
  onSubmit,
  onClose,
  onRetire,
}: PlatformBroadcastEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [status, setStatus] = useState<AnnouncementWriteStatus>(initialStatus(initial));
  const [publishAt, setPublishAt] = useState(isoToLocalInput(initial?.scheduledPublishAt));
  const [autoArchive, setAutoArchive] = useState(initial?.autoArchive ?? true);
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [targetKind, setTargetKind] = useState<'all' | 'specific'>('all');
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<WorkspaceId[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isScheduled = status === 'Scheduled';
  const isCreate = mode === 'create';

  const scheduledBaseMs = isScheduled && publishAt ? new Date(publishAt).getTime() : Date.now();
  const archiveBaseMs = Number.isNaN(scheduledBaseMs) ? Date.now() : scheduledBaseMs;
  const archiveNote = autoArchive
    ? `Automatically moves to Archived on ${formatArchiveDate(archiveBaseMs)} (${AUTO_ARCHIVE_DAYS} days after publish).`
    : 'Stays visible until archived manually.';

  const toggleWorkspace = (workspaceId: WorkspaceId) => {
    setSelectedWorkspaces((current) =>
      current.includes(workspaceId)
        ? current.filter((id) => id !== workspaceId)
        : [...current, workspaceId],
    );
  };

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
    if (isCreate && targetKind === 'specific' && selectedWorkspaces.length === 0) {
      nextErrors.target = 'Select at least one workspace to post to.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const target: PlatformAnnouncementTarget =
      targetKind === 'specific' ? { kind: 'specific', workspaceIds: selectedWorkspaces } : { kind: 'all' };

    onSubmit({
      title: title.trim(),
      body,
      status,
      scheduledPublishAt: isScheduled ? localInputToIso(publishAt) : undefined,
      autoArchive,
      pinned,
      target,
    });
  };

  const heading = isCreate ? 'New broadcast' : 'Edit broadcast';
  const submitLabel = isCreate ? 'Post' : 'Save changes';
  const canRetire = mode === 'edit' && Boolean(onRetire) && initial?.status !== 'Archived';

  return (
    <Modal
      title={heading}
      onClose={onClose}
      footer={
        <>
          {canRetire && (
            <span className="ann-editor__archive">
              <Button variant="destructive" onClick={onRetire} disabled={submitting}>
                Retire now
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

        {isCreate && (
          <fieldset className="ann-target" data-ds="radio-group">
            <legend className="caption">Post to</legend>
            <label className="ann-check">
              <input
                type="radio"
                name="broadcast-target"
                checked={targetKind === 'all'}
                onChange={() => setTargetKind('all')}
              />
              <span>All workspaces</span>
            </label>
            <label className="ann-check">
              <input
                type="radio"
                name="broadcast-target"
                checked={targetKind === 'specific'}
                onChange={() => setTargetKind('specific')}
              />
              <span>Specific workspaces</span>
            </label>
            {targetKind === 'specific' && (
              <div className="ann-target__list">
                {workspaces.map((workspace) => (
                  <label key={workspace.id} className="ann-check">
                    <input
                      type="checkbox"
                      checked={selectedWorkspaces.includes(workspace.id)}
                      onChange={() => toggleWorkspace(workspace.id)}
                    />
                    <span>{workspace.name}</span>
                  </label>
                ))}
              </div>
            )}
            {errors.target && (
              <p className="mws-field__error" role="alert">
                {errors.target}
              </p>
            )}
          </fieldset>
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
