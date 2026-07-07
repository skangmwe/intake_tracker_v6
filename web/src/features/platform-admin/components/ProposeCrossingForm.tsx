// S35 propose-mapping form (slice 24). Two pickers — a PG/Dept field and an AI Solutions field, drawn
// from the candidate read (unmapped, non-derived, non-platform Request fields). Submitting proposes the
// mapping; the API validates type-compatibility, direction, and one-to-one and surfaces a plain-language
// message on failure. The R1 form proposes same-valued select mappings (no per-option UI); the option-set
// check runs server-side if an option map is supplied by another client.

import { useMemo, useState, type FormEvent } from 'react';

import type { CrossingCandidateDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Select, type SelectOption } from '@/shared/components/Form';
import { problemMessage } from '@/shared/http/problemMessage';

import { useCrossingCandidates, useProposeCrossingMap } from '../useCrossingMap';

function toOptions(fields: CrossingCandidateDto[] | undefined): SelectOption[] {
  return (fields ?? []).map((field) => ({
    value: field.fieldDefinitionId,
    label: `${field.displayName} (${field.fieldType})`,
  }));
}

export function ProposeCrossingForm() {
  const { data: candidates, isLoading } = useCrossingCandidates(true);
  const propose = useProposeCrossingMap();
  const [pgId, setPgId] = useState('');
  const [aiId, setAiId] = useState('');

  const pgOptions = useMemo(() => toOptions(candidates?.pgFields), [candidates]);
  const aiOptions = useMemo(() => toOptions(candidates?.aiFields), [candidates]);

  const canSubmit = pgId !== '' && aiId !== '' && !propose.isPending;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    propose.mutate(
      { pgFieldDefinitionId: pgId, aiFieldDefinitionId: aiId },
      {
        onSuccess: () => {
          setPgId('');
          setAiId('');
        },
      },
    );
  };

  const noCandidates =
    !isLoading && pgOptions.length === 0 && aiOptions.length === 0;

  return (
    <form className="platform-admin__add cm-propose" onSubmit={onSubmit} aria-label="Propose a crossing mapping">
      <div className="platform-admin__add-fields cm-propose__fields">
        <Select
          label="PG / Dept field"
          value={pgId}
          onChange={setPgId}
          options={pgOptions}
          placeholder={isLoading ? 'Loading…' : 'Select a field'}
          disabled={isLoading || pgOptions.length === 0}
        />
        <Select
          label="AI Solutions field"
          value={aiId}
          onChange={setAiId}
          options={aiOptions}
          placeholder={isLoading ? 'Loading…' : 'Select a field'}
          disabled={isLoading || aiOptions.length === 0}
        />
      </div>
      <div className="platform-admin__add-actions">
        <Button type="submit" disabled={!canSubmit}>
          {propose.isPending ? 'Proposing…' : 'Propose mapping'}
        </Button>
      </div>
      {noCandidates && (
        <p className="platform-admin__empty">No unmapped fields are available to map.</p>
      )}
      {propose.isError && (
        <p className="mws-alert mws-alert--error platform-admin__add-error" role="alert">
          {problemMessage(propose.error)}
        </p>
      )}
    </form>
  );
}
