// "Check for duplicates" action (Phase 4, §14). Self-hides when AI assist is off for the workspace, so the record
// detail can mount it unconditionally. Clicking opens the ranked-matches panel on demand — nothing runs, and no
// content reaches a provider, until the user asks.

import { useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import type { RecordId, WorkspaceId } from '@shared/types';

import { useAiConfig } from '@/features/ai-config';

import { DuplicateMatchesPanel } from './DuplicateMatchesPanel';
import '../ai-duplicates.css';

interface DuplicateCheckActionProps {
  workspaceId: WorkspaceId;
  recordId: RecordId;
  recordName: string;
}

export function DuplicateCheckAction({
  workspaceId,
  recordId,
  recordName,
}: DuplicateCheckActionProps) {
  const configQuery = useAiConfig(workspaceId);
  const [open, setOpen] = useState(false);

  if (!configQuery.data?.enabled) return null;

  return (
    <section className="record-card ai-duplicates" aria-label="Check for duplicates">
      <span className="record-chip">Duplicate check</span>
      {open ? (
        <DuplicateMatchesPanel
          workspaceId={workspaceId}
          recordId={recordId}
          recordName={recordName}
          onClose={() => setOpen(false)}
        />
      ) : (
        <>
          <p className="caption">
            Check this record against others you can see and, if it duplicates one, close it as a
            duplicate.
          </p>
          <button
            type="button"
            className="mws-btn mws-btn--secondary"
            data-ds="btn"
            onClick={() => setOpen(true)}
          >
            <MagnifyingGlass size={16} weight="regular" aria-hidden /> Check for duplicates
          </button>
        </>
      )}
    </section>
  );
}
