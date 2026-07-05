// Create / edit an announcement inside a modal (S23). One form for both: title, body, a two-layer
// audience (everyone / role-scoped roles / named-users ids), a pin flag, and an optional expiry.
// A people/role picker arrives with Users & access (slice 17); until then role labels and user ids
// are entered as comma-separated lists, per the slice-13 decision. Validates on submit
// (forms-and-input.md) and surfaces the API's plain-language error.

import { useState } from 'react';
import type { AnnouncementAudience, AnnouncementDto, UserId } from '@shared/types';

import { Modal } from '@/shared/components/Disclosure';
import { Button } from '@/shared/components/Button';
import { DateField, Select, TextArea, TextField } from '@/shared/components/Form';

import { AUDIENCE_OPTIONS } from '../constants';

interface EditorValue {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  pinned: boolean;
  expiresOn?: string;
}

interface AnnouncementEditorProps {
  mode: 'create' | 'edit';
  initial?: AnnouncementDto;
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (value: EditorValue) => void;
  onClose: () => void;
}

const splitList = (text: string): string[] =>
  text.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);

export function AnnouncementEditor({ mode, initial, submitting, errorMessage, onSubmit, onClose }: AnnouncementEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [kind, setKind] = useState<string>(initial?.audience.kind ?? 'everyone');
  const [roleLabels, setRoleLabels] = useState((initial?.audience.roleLabels ?? []).join(', '));
  const [userIds, setUserIds] = useState((initial?.audience.userIds ?? []).join(', '));
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [expiresOn, setExpiresOn] = useState(initial?.expiresOn ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (title.trim().length === 0) nextErrors.title = 'Add a title so people know what this is about.';
    if (body.trim().length === 0) nextErrors.body = 'Add the announcement text.';

    let audience: AnnouncementAudience = { kind: 'everyone' };
    if (kind === 'role-scoped') {
      const roles = splitList(roleLabels);
      if (roles.length === 0) nextErrors.audience = 'List at least one role for a role-scoped audience.';
      audience = { kind: 'role-scoped', roleLabels: roles };
    } else if (kind === 'named-users') {
      const ids = splitList(userIds) as UserId[];
      if (ids.length === 0) nextErrors.audience = 'Add at least one person for a named-users audience.';
      audience = { kind: 'named-users', userIds: ids };
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({ title: title.trim(), body, audience, pinned, ...(expiresOn ? { expiresOn } : {}) });
  };

  const heading = mode === 'create' ? 'New announcement' : 'Edit announcement';
  const submitLabel = mode === 'create' ? 'Save draft' : 'Save changes';

  return (
    <Modal
      title={heading}
      onClose={onClose}
      footer={
        <>
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
        <TextArea label="Body" value={body} onChange={setBody} rows={5} error={errors.body} hint="Links and light formatting are allowed." />
        <Select label="Audience" value={kind} onChange={setKind} options={AUDIENCE_OPTIONS} error={errors.audience} />
        {kind === 'role-scoped' && (
          <TextField
            label="Roles"
            value={roleLabels}
            onChange={setRoleLabels}
            hint="Comma-separated role labels (e.g. Manager, PG Lead)."
          />
        )}
        {kind === 'named-users' && (
          <TextField
            label="People"
            value={userIds}
            onChange={setUserIds}
            hint="Comma-separated user IDs. A people picker arrives with Users & access."
          />
        )}
        <DateField
          label="Expires on"
          value={expiresOn}
          onChange={setExpiresOn}
          optional
          hint="On this date the announcement stops surfacing."
        />
        <label className="ann-check">
          <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} data-ds="checkbox" />
          <span>Pin to the top of Home until it expires or is unpinned</span>
        </label>
      </div>
    </Modal>
  );
}
