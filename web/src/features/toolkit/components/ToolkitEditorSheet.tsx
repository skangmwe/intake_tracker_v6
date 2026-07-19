// S43 New item / Edit item side sheet — paste-or-upload. Name is required; Type + Status are
// selects; the asset can be a pasted body and/or an uploaded file (.md/.markdown/.txt/.docx/.pdf,
// matching the API allowlist). On save it calls create (new) or patch (edit); the edit form prefills
// from the loaded item and carries its ETag for optimistic concurrency.

import { useEffect, useMemo, useState } from 'react';
import { FileText, Sparkle, UploadSimple, X } from '@phosphor-icons/react';

import type {
  ToolkitItemCreateRequest,
  ToolkitItemDto,
  ToolkitItemId,
  ToolkitItemKind,
  ToolkitItemPatchRequest,
  ToolkitItemStatus,
  WorkspaceId,
} from '@shared/types';

import { Button } from '@/shared/components/Button';
import { SideSheet } from '@/shared/components/Disclosure/SideSheet';

import { TOOLKIT_KINDS, TOOLKIT_STATUSES } from '../toolkitFormat';
import { useCreateToolkitItem, useToolkitItem, useUpdateToolkitItem } from '../useToolkit';

const UPLOAD_ACCEPT = '.md,.markdown,.txt,.docx,.pdf';

interface ToolkitEditorSheetProps {
  workspaceId: WorkspaceId;
  /** The item being edited, or null to create a new one. */
  editItemId: ToolkitItemId | null;
  onClose: () => void;
  onSaved: (item: ToolkitItemDto) => void;
}

interface FormState {
  name: string;
  oneLiner: string;
  kind: ToolkitItemKind;
  status: ToolkitItemStatus;
  maintainer: string;
  description: string;
  howTo: string;
  bodyMarkdown: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  oneLiner: '',
  kind: 'Playbook',
  status: 'Draft',
  maintainer: '',
  description: '',
  howTo: '',
  bodyMarkdown: '',
};

function toForm(item: ToolkitItemDto): FormState {
  return {
    name: item.name,
    oneLiner: item.oneLiner ?? '',
    kind: item.kind,
    status: item.status,
    maintainer: item.maintainer ?? '',
    description: item.description ?? '',
    howTo: item.howTo ?? '',
    bodyMarkdown: item.bodyMarkdown ?? '',
  };
}

export function ToolkitEditorSheet({ workspaceId, editItemId, onClose, onSaved }: ToolkitEditorSheetProps) {
  const isEdit = editItemId !== null;
  const { data: existing } = useToolkitItem(editItemId);
  const createMutation = useCreateToolkitItem(workspaceId);
  // Hooks can't be conditional; on the create path editItemId is null and this mutation is never
  // fired. The empty-string placeholder is cast to the branded id purely to satisfy the signature.
  const updateMutation = useUpdateToolkitItem((editItemId ?? '') as ToolkitItemId);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [showNameError, setShowNameError] = useState(false);

  useEffect(() => {
    if (existing) setForm(toForm(existing));
  }, [existing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const existingFileName = !removeExisting && !file ? existing?.attachment?.fileName : undefined;
  const pending = createMutation.isPending || updateMutation.isPending;
  const failed = createMutation.isError || updateMutation.isError;

  const handleSave = () => {
    if (!form.name.trim()) {
      setShowNameError(true);
      return;
    }

    // Build the request with only the optional fields that carry a value — the project's
    // exactOptionalPropertyTypes forbids assigning `undefined` to an optional property.
    const base: ToolkitItemCreateRequest = {
      kind: form.kind,
      status: form.status,
      name: form.name.trim(),
      bodyMarkdown: form.bodyMarkdown,
    };
    const oneLiner = form.oneLiner.trim();
    const description = form.description.trim();
    const maintainer = form.maintainer.trim();
    const howTo = form.howTo.trim();
    if (oneLiner) base.oneLiner = oneLiner;
    if (description) base.description = description;
    if (maintainer) base.maintainer = maintainer;
    if (howTo) base.howTo = howTo;

    if (isEdit) {
      const patch: ToolkitItemPatchRequest = { ...base, removeAttachment: removeExisting };
      if (existing?.eTag) patch.ifMatch = existing.eTag;
      updateMutation.mutate({ request: patch, file }, { onSuccess: onSaved });
    } else {
      createMutation.mutate({ request: base, file }, { onSuccess: onSaved });
    }
  };

  const title = isEdit ? 'Edit item' : 'New toolkit item';
  const intro = useMemo(
    () =>
      isEdit
        ? 'Update the item and save your changes.'
        : 'Add a playbook, plugin, or prompt for the team to reuse.',
    [isEdit],
  );

  return (
    <SideSheet title={title} onClose={onClose}>
      <div className="tk-form">
        <p className="tk-form__intro">{intro}</p>

        <label className="tk-field">
          <span className="tk-field__label">Name</span>
          <input
            type="text"
            className="tk-input"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            aria-invalid={showNameError && !form.name.trim()}
            placeholder="e.g. Clause extraction prompt"
          />
          {showNameError && !form.name.trim() && (
            <span className="tk-field__error" role="alert">
              Enter a name for this item.
            </span>
          )}
        </label>

        <label className="tk-field">
          <span className="tk-field__label">
            One-liner <span className="tk-field__optional">Optional</span>
          </span>
          <input
            type="text"
            className="tk-input"
            value={form.oneLiner}
            onChange={(event) => set('oneLiner', event.target.value)}
            placeholder="A one-sentence summary of what this does"
          />
          <span className="tk-field__hint">
            <Sparkle size={13} weight="regular" aria-hidden /> Leave blank to have this drafted
            automatically once AI features are enabled.
          </span>
        </label>

        <div className="tk-field-row">
          <label className="tk-field">
            <span className="tk-field__label">Type</span>
            <select className="tk-input" value={form.kind} onChange={(event) => set('kind', event.target.value as ToolkitItemKind)}>
              {TOOLKIT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          <label className="tk-field">
            <span className="tk-field__label">Status</span>
            <select className="tk-input" value={form.status} onChange={(event) => set('status', event.target.value as ToolkitItemStatus)}>
              {TOOLKIT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="tk-field">
          <span className="tk-field__label">Maintainer</span>
          <input
            type="text"
            className="tk-input"
            value={form.maintainer}
            onChange={(event) => set('maintainer', event.target.value)}
            placeholder="Who maintains this"
          />
        </label>

        <label className="tk-field">
          <span className="tk-field__label">Description</span>
          <textarea
            className="tk-input tk-textarea"
            rows={2}
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="What this asset is for"
          />
        </label>

        <label className="tk-field">
          <span className="tk-field__label">How to use</span>
          <textarea
            className="tk-input tk-textarea"
            rows={2}
            value={form.howTo}
            onChange={(event) => set('howTo', event.target.value)}
            placeholder="How another person picks this up and applies it"
          />
        </label>

        <div className="tk-field">
          <span className="tk-field__label">Asset content</span>
          <span className="tk-field__hint">Paste the prompt language or asset content, or upload a file below.</span>
          <textarea
            className="tk-input tk-textarea tk-textarea--mono"
            rows={5}
            value={form.bodyMarkdown}
            onChange={(event) => set('bodyMarkdown', event.target.value)}
            placeholder="Paste the language here…"
            aria-label="Asset content"
          />
          <label className="tk-upload">
            <UploadSimple size={16} weight="regular" aria-hidden /> Upload file
            <input
              type="file"
              accept={UPLOAD_ACCEPT}
              className="tk-upload__input"
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                setFile(chosen);
                if (chosen) setRemoveExisting(false);
              }}
            />
          </label>
          {(file || existingFileName) && (
            <div className="tk-file-chip">
              <FileText size={16} weight="regular" aria-hidden />
              <span className="tk-file-chip__name">{file?.name ?? existingFileName}</span>
              <button
                type="button"
                className="tk-file-chip__remove"
                aria-label="Remove file"
                onClick={() => {
                  setFile(null);
                  if (existingFileName) setRemoveExisting(true);
                }}
              >
                <X size={12} weight="regular" aria-hidden />
              </button>
            </div>
          )}
        </div>

        {failed && (
          <p className="mws-alert mws-alert--error" role="alert">
            The item couldn&rsquo;t be saved. Try again in a moment.
          </p>
        )}

        <div className="tk-form__actions">
          <Button variant="primary" onClick={handleSave} disabled={pending}>
            {isEdit ? 'Save changes' : 'Create item'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
      </div>
    </SideSheet>
  );
}
