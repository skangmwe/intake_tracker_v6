// The "Add to catalog" entry affordance on a Request's detail (S4 → S13). Self-contained: it renders
// only for AI Solutions workspace members (features are hub-local), calls the add-to-catalog endpoint
// to prefill a Feature draft, then opens the S13 form on that draft. Errors surface inline.

import { useNavigate } from 'react-router-dom';
import { BookmarkSimple } from '@phosphor-icons/react';

import type { RecordId } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { useMe } from '@/features/users/useMe';

import { useAddToCatalog } from '../useFeatures';

export function AddToCatalogButton({ sourceRecordId }: { sourceRecordId: RecordId }) {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const addToCatalog = useAddToCatalog();

  const isAiMember = (me?.memberships ?? []).some(
    (membership) => membership.workspaceKind === 'ai-solutions',
  );
  if (!isAiMember) return null;

  const harvest = () => {
    addToCatalog.mutate(sourceRecordId, {
      onSuccess: (result) => navigate(`/feature-catalog/new?draft=${result.draftId}`),
    });
  };

  return (
    <span className="record-header__action">
      <Button variant="secondary" compact onClick={harvest} disabled={addToCatalog.isPending}>
        <BookmarkSimple size={16} weight="regular" aria-hidden />{' '}
        {addToCatalog.isPending ? 'Preparing…' : 'Add to catalog'}
      </Button>
      {addToCatalog.isError && (
        <span className="visually-hidden" role="alert">
          Couldn&apos;t start an Add to catalog draft.
        </span>
      )}
    </span>
  );
}
