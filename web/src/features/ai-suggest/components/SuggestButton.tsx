// The per-field "Suggest" affordance (Phase 4, §14 drafting). A sparkle trigger that proposes one field's value
// from the record's allowlisted sibling values, then shows an AI-labelled result the user must explicitly Accept
// (human-in-the-loop — nothing is auto-applied; ai-trust-and-provenance.md). Self-hides when AI assist is off for
// the workspace, so the shared FieldControl can mount it unconditionally. Only allowlist-eligible sibling values
// are ever sent, and the server re-projects them (the data floor is enforced server-side).

import { useEffect, useRef } from 'react';
import { Sparkle, WarningCircle } from '@phosphor-icons/react';
import type { FieldDefinitionDto } from '@shared/types';

import { useAiConfig } from '@/features/ai-config';

import type { FieldSuggestContext } from '../types';
import { useFieldSuggestion } from '../useFieldSuggestion';

import '../ai-suggest.css';

interface SuggestButtonProps {
  field: FieldDefinitionDto;
  context: FieldSuggestContext;
  onAccept: (value: unknown) => void;
}

/** Project sibling values to the allowlist-eligible, non-empty primitives — excluding the target field itself. */
function buildEligibleFields(
  siblingValues: Record<string, unknown>,
  allowlist: string[],
  targetKey: string,
): Record<string, string> {
  const allowed = new Set(allowlist.map((name) => name.toLowerCase()));
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(siblingValues)) {
    if (key === targetKey || !allowed.has(key.toLowerCase())) continue;
    if (value === null || value === undefined || typeof value === 'object') continue;
    const text = String(value).trim();
    if (text.length > 0) fields[key] = text;
  }
  return fields;
}

export function SuggestButton({ field, context, onAccept }: SuggestButtonProps) {
  const configQuery = useAiConfig(context.workspaceId);
  const suggestion = useFieldSuggestion(context.workspaceId);
  const controllerRef = useRef<AbortController | null>(null);

  // Cancel any in-flight suggestion when the field unmounts.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const config = configQuery.data;
  if (!config?.enabled) return null;

  const selectOptions =
    field.fieldType === 'SingleSelect' ? field.options.map((option) => option.value) : undefined;

  const displayValue = (value: string): string => {
    if (field.fieldType === 'SingleSelect') {
      return field.options.find((option) => option.value === value)?.label ?? value;
    }
    return value;
  };

  const onSuggest = () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    suggestion.mutate({
      body: {
        objectType: context.objectType,
        recordId: context.recordId ?? null,
        targetFieldKey: field.fieldKey,
        fields: buildEligibleFields(
          context.siblingValues,
          config.contentFieldAllowlist,
          field.fieldKey,
        ),
        selectOptions: selectOptions ?? null,
        provider: null,
      },
      signal: controller.signal,
    });
  };

  const result = suggestion.data;

  return (
    <div className="ai-suggest">
      <button
        type="button"
        className="ai-suggest__trigger"
        data-ds="btn"
        onClick={onSuggest}
        disabled={suggestion.isPending}
        aria-label={`Suggest a value for ${field.displayName}`}
      >
        <Sparkle size={16} weight="regular" aria-hidden />
        <span>Suggest</span>
      </button>

      {suggestion.isPending && (
        <span className="ai-suggest__status" role="status" aria-live="polite">
          <span className="ai-suggest__dots" aria-hidden />
          Suggesting…
        </span>
      )}

      {suggestion.isError && (
        <p className="ai-suggest__error" role="alert">
          <WarningCircle size={16} weight="regular" aria-hidden /> Couldn&rsquo;t suggest a value.
          Try again.
        </p>
      )}

      {!suggestion.isPending && result?.value == null && result !== undefined && (
        <p className="ai-suggest__empty">No confident suggestion.</p>
      )}

      {!suggestion.isPending && result?.value != null && (
        <div className="ai-suggest__panel" data-ds="ai">
          <span className="ai-suggest__eyebrow">
            <Sparkle size={14} weight="regular" aria-hidden /> Suggested
          </span>
          <p className="ai-suggest__value">{displayValue(result.value)}</p>
          <p className="ai-suggest__rationale">{result.rationale}</p>
          <div className="ai-suggest__actions">
            <button
              type="button"
              className="mws-btn mws-btn--primary"
              data-ds="btn"
              onClick={() => {
                onAccept(result.value);
                suggestion.reset();
              }}
            >
              Accept
            </button>
            <button
              type="button"
              className="mws-btn mws-btn--secondary"
              data-ds="btn"
              onClick={() => suggestion.reset()}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
