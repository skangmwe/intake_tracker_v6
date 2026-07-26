// Workspace AI-assist config panel (Phase 4, §14). A workspace admin turns the Ask surface on/off and
// chooses which non-PII content fields the AI layer may read. The field choices are the fixed closed set
// (AI_CONTENT_FIELDS) — client/matter/identity fields are never offered, enforcing the data-sensitivity
// floor at the UI. Renders loading / error / loaded states explicitly (web-component-architecture.md).

import { useState } from 'react';
import type { WorkspaceId } from '@shared/types';

import { ApiError } from '@/shared/http/apiClient';

import { AI_CONTENT_FIELDS } from '../constants';
import { useAiConfig, useSaveAiConfig } from '../aiConfigModel';
import type { AiConfig } from '../types';

import '../ai-config.css';

interface AiConfigPanelProps {
  workspaceId: WorkspaceId;
}

export function AiConfigPanel({ workspaceId }: AiConfigPanelProps) {
  const { data, isLoading, isError, refetch } = useAiConfig(workspaceId);

  if (isLoading && !data) {
    return (
      <p className="caption" role="status">
        Loading AI settings…
      </p>
    );
  }

  if (isError && !data) {
    return (
      <div className="mws-alert mws-alert--error" role="alert">
        <p className="body">We couldn’t load the AI settings. Try again in a moment.</p>
        <button type="button" className="mws-btn mws-btn--secondary mws-btn--sm" data-ds="btn" onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return <AiConfigForm key={workspaceId} workspaceId={workspaceId} config={data} />;
}

function AiConfigForm({ workspaceId, config }: { workspaceId: WorkspaceId; config: AiConfig }) {
  const save = useSaveAiConfig(workspaceId);
  const [enabled, setEnabled] = useState(config.enabled);
  const [selected, setSelected] = useState<string[]>(config.contentFieldAllowlist);

  const allowlist = AI_CONTENT_FIELDS.filter((field) => selected.includes(field.key)).map((field) => field.key);
  const canSave = allowlist.length > 0 && !save.isPending;

  const toggleField = (key: string) =>
    setSelected((previous) =>
      previous.includes(key) ? previous.filter((entry) => entry !== key) : [...previous, key],
    );

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    save.mutate({ enabled, contentFieldAllowlist: allowlist });
  };

  const saveErrorDetail =
    save.error instanceof ApiError ? save.error.problem.detail : 'We couldn’t save. Try again in a moment.';

  return (
    <form className="ai-config" onSubmit={onSubmit} aria-label="AI assist settings">
      <div className="ai-config__toggle" data-ds="toggle">
        <span className="ai-config__toggle-text">
          <span className="body">AI assist</span>
          <span className="caption">
            When on, members can open the Ask surface to search this workspace’s requests. Off by default.
          </span>
        </span>
        <label className="mws-switch">
          <input
            type="checkbox"
            aria-label="Enable AI assist"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span className="mws-switch__track">
            <span className="mws-switch__thumb" />
          </span>
        </label>
      </div>

      <fieldset className="ai-config__fields">
        <legend className="caption">Content the AI may read</legend>
        <p className="caption ai-config__hint">
          Only these non-client, non-matter fields are ever sent to the model. Choose at least one.
        </p>
        {AI_CONTENT_FIELDS.map((field) => (
          <label className="ai-config__check" key={field.key}>
            <input
              type="checkbox"
              data-ds="checkbox"
              className="mws-checkbox"
              checked={selected.includes(field.key)}
              onChange={() => toggleField(field.key)}
            />
            <span className="body">{field.label}</span>
          </label>
        ))}
        {allowlist.length === 0 && (
          <p className="ai-config__field-error" role="alert">
            Choose at least one field for the AI to read.
          </p>
        )}
      </fieldset>

      <div className="ai-config__footer">
        <button type="submit" className="mws-btn mws-btn--primary" data-ds="btn" disabled={!canSave}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </button>
        {save.isSuccess && !save.isPending && (
          <span className="caption" role="status">
            Saved.
          </span>
        )}
        {save.isError && (
          <span className="ai-config__field-error" role="alert">
            {saveErrorDetail}
          </span>
        )}
      </div>
    </form>
  );
}
