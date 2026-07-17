// S30 Relationships tab (Slice 25) — workspace admin surface for object-level Relationships.
// Lists workspace Relationships (system-seeded rows locked; workspace-authored rows editable
// or retirable), opens a New-relationship modal (cardinality + side labels + Show-as-tab
// toggle), and handles the retire-with-links 409 → force-confirm flow. Restore returns a
// soft-retired row.
//
// Access: this component assumes the caller has already gated on WorkspaceAdmin membership
// (the parent — FieldsAdminPage-adjacent — surfaces it inside the S30 admin route). Server-
// side gating in RelationshipsController is the source of truth; a non-admin gets 403.

import { useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';

import type {
  FieldObjectType,
  RelationshipCardinality,
  RelationshipCreateRequest,
  RelationshipDto,
  RelationshipId,
  WorkspaceId,
} from '@shared/types';

import { Button } from '@/shared/components/Button';
import { Modal } from '@/shared/components/Disclosure';

import {
  useCreateRelationship,
  useRestoreRelationship,
  useRetireRelationship,
  useWorkspaceRelationships,
} from './useRelationships';

interface RelationshipsAdminTabProps {
  workspaceId: WorkspaceId;
}

/** Object types the admin picks from in the create modal — mirrors the current schema engine set. */
const OBJECT_TYPES: FieldObjectType[] = ['Request', 'Task', 'Feature', 'Announcement', 'ToolkitItem'];

const CARDINALITY_OPTIONS: { value: RelationshipCardinality; label: string; help: string }[] = [
  { value: 'OneToOne', label: 'One to one', help: 'Each From-side record links to at most one To-side record.' },
  { value: 'OneToMany', label: 'One to many', help: 'A From-side record has many To-side records.' },
  { value: 'ManyToMany', label: 'Many to many', help: 'Both sides can link to multiple counterparts.' },
];

interface RetireDialogState {
  relationship: RelationshipDto;
  linkCount: number | null;
}

export function RelationshipsAdminTab({ workspaceId }: RelationshipsAdminTabProps) {
  const { data: relationships, isLoading, isError } = useWorkspaceRelationships(workspaceId);
  const createMutation = useCreateRelationship(workspaceId);
  const retireMutation = useRetireRelationship(workspaceId);
  const restoreMutation = useRestoreRelationship(workspaceId);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [retireTarget, setRetireTarget] = useState<RetireDialogState | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const sortedRelationships = useMemo(() => {
    return (relationships ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  }, [relationships]);

  const handleRetire = (relationship: RelationshipDto) => {
    setRetireTarget({ relationship, linkCount: null });
  };

  const performRetire = (force: boolean) => {
    if (!retireTarget) return;
    retireMutation.mutate(
      { relationshipId: retireTarget.relationship.id, force },
      {
        onSuccess: (response) => {
          if (response.retired) {
            setRetireTarget(null);
          } else {
            // 409 with a live-link count — surface for a force-confirm retry.
            setRetireTarget({ relationship: retireTarget.relationship, linkCount: response.linkCount });
          }
        },
      },
    );
  };

  const handleRestore = (relationshipId: RelationshipId) => {
    setRestoreError(null);
    restoreMutation.mutate(relationshipId, {
      onError: (error) => {
        setRestoreError(error instanceof Error ? error.message : 'Restore failed.');
      },
    });
  };

  return (
    <section aria-labelledby="relationships-admin-heading" data-ds="card">
      <header className="fields-header">
        <div>
          <h2 id="relationships-admin-heading" className="h3">Relationships</h2>
          <p className="body">
            Define how objects in this workspace relate. Creating a Relationship auto-provisions the
            paired Link-to-record fields on both sides.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus size={16} aria-hidden /> New relationship
        </Button>
      </header>

      {isLoading && <p className="caption" role="status">Loading relationships…</p>}
      {isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          We couldn’t load relationships. Try again in a moment.
        </p>
      )}
      {restoreError && (
        <p className="mws-alert mws-alert--error" role="alert">{restoreError}</p>
      )}

      {!isLoading && sortedRelationships.length === 0 && (
        <div className="mws-empty mws-empty--filtered">
          <p className="body">No relationships defined yet.</p>
          <Button variant="secondary" onClick={() => setIsCreateOpen(true)}>
            Create the first relationship
          </Button>
        </div>
      )}

      {sortedRelationships.length > 0 && (
        <div className="mws-table-shell">
          <table className="mws-table" data-ds="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">From → To</th>
                <th scope="col">Cardinality</th>
                <th scope="col">Show as tab</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {sortedRelationships.map((relationship) => (
                <RelationshipRow
                  key={relationship.id}
                  relationship={relationship}
                  onRetire={handleRetire}
                  onRestore={handleRestore}
                  isRestoring={restoreMutation.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isCreateOpen && (
        <NewRelationshipModal
          onClose={() => {
            createMutation.reset();
            setIsCreateOpen(false);
          }}
          onSubmit={(request) => {
            createMutation.mutate(request, {
              onSuccess: () => {
                createMutation.reset();
                setIsCreateOpen(false);
              },
            });
          }}
          isSubmitting={createMutation.isPending}
          submitError={createMutation.isError ? createMutation.error?.message ?? 'Create failed.' : null}
        />
      )}

      {retireTarget && (
        <RetireConfirmDialog
          relationship={retireTarget.relationship}
          liveLinkCount={retireTarget.linkCount}
          isRetiring={retireMutation.isPending}
          onCancel={() => {
            retireMutation.reset();
            setRetireTarget(null);
          }}
          onConfirm={() => performRetire(retireTarget.linkCount !== null && retireTarget.linkCount > 0)}
        />
      )}
    </section>
  );
}

interface RelationshipRowProps {
  relationship: RelationshipDto;
  onRetire: (relationship: RelationshipDto) => void;
  onRestore: (relationshipId: RelationshipId) => void;
  isRestoring: boolean;
}

function RelationshipRow({ relationship, onRetire, onRestore, isRestoring }: RelationshipRowProps) {
  const cardinalityLabel = CARDINALITY_OPTIONS.find((option) => option.value === relationship.cardinality)?.label
    ?? relationship.cardinality;

  return (
    <tr>
      <td>
        <span className="body">{relationship.name}</span>
        {relationship.isSystem && (
          <>
            {' '}
            <span className="mws-badge mws-badge--draft" data-ds="badge" aria-label="System relationship">System</span>
          </>
        )}
      </td>
      <td>
        <span className="mws-badge" data-ds="badge">{relationship.fromObjectType}</span>
        <span aria-hidden> → </span>
        <span className="mws-badge" data-ds="badge">{relationship.toObjectType}</span>
      </td>
      <td>{cardinalityLabel}</td>
      <td>{relationship.showOnFromAsTab ? 'Yes' : '—'}</td>
      <td>
        {relationship.isRetired ? (
          <span className="mws-badge mws-badge--archived" data-ds="badge">Retired</span>
        ) : (
          <span className="mws-badge mws-badge--live" data-ds="badge">Active</span>
        )}
      </td>
      <td className="fields-row-actions">
        {relationship.isSystem ? (
          <span className="caption" aria-label="Locked — system relationship">Locked</span>
        ) : relationship.isRetired ? (
          <Button
            variant="secondary"
            compact
            disabled={isRestoring}
            onClick={() => onRestore(relationship.id)}
          >
            Restore
          </Button>
        ) : (
          <Button variant="secondary" compact onClick={() => onRetire(relationship)}>
            Retire
          </Button>
        )}
      </td>
    </tr>
  );
}

interface NewRelationshipModalProps {
  onClose: () => void;
  onSubmit: (request: RelationshipCreateRequest) => void;
  isSubmitting: boolean;
  submitError: string | null;
}

function NewRelationshipModal({ onClose, onSubmit, isSubmitting, submitError }: NewRelationshipModalProps) {
  const [name, setName] = useState('');
  const [fromObjectType, setFromObjectType] = useState<FieldObjectType>('Request');
  const [toObjectType, setToObjectType] = useState<FieldObjectType>('Task');
  const [cardinality, setCardinality] = useState<RelationshipCardinality>('OneToMany');
  const [fromSideLabel, setFromSideLabel] = useState('');
  const [toSideLabel, setToSideLabel] = useState('');
  const [showOnFromAsTab, setShowOnFromAsTab] = useState(false);
  const [tabLabel, setTabLabel] = useState('');

  const canSubmit =
    name.trim().length > 0 &&
    fromSideLabel.trim().length > 0 &&
    toSideLabel.trim().length > 0 &&
    (!showOnFromAsTab || tabLabel.trim().length > 0) &&
    !isSubmitting;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      fromObjectType,
      toObjectType,
      cardinality,
      fromSideLabel: fromSideLabel.trim(),
      toSideLabel: toSideLabel.trim(),
      showOnFromAsTab,
      tabLabel: showOnFromAsTab ? tabLabel.trim() : undefined,
      sortOrder: 0,
    });
  };

  return (
    <Modal
      title="New relationship"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>Create relationship</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="mws-form">
        <label className="mws-field">
          <span className="caption">Name</span>
          <input
            className="mws-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>

        <div className="fields-two-column">
          <label className="mws-field">
            <span className="caption">From object</span>
            <select
              className="mws-select"
              value={fromObjectType}
              onChange={(event) => setFromObjectType(event.target.value as FieldObjectType)}
            >
              {OBJECT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>

          <label className="mws-field">
            <span className="caption">To object</span>
            <select
              className="mws-select"
              value={toObjectType}
              onChange={(event) => setToObjectType(event.target.value as FieldObjectType)}
            >
              {OBJECT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="mws-field">
          <legend className="caption">Cardinality</legend>
          {CARDINALITY_OPTIONS.map((option) => (
            <label key={option.value} className="mws-radio">
              <input
                type="radio"
                name="cardinality"
                value={option.value}
                checked={cardinality === option.value}
                onChange={() => setCardinality(option.value)}
              />
              <span className="body">
                {option.label} <span className="caption">— {option.help}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="fields-two-column">
          <label className="mws-field">
            <span className="caption">From-side label</span>
            <input
              className="mws-input"
              type="text"
              value={fromSideLabel}
              onChange={(event) => setFromSideLabel(event.target.value)}
              placeholder="e.g. Tasks"
              required
            />
          </label>
          <label className="mws-field">
            <span className="caption">To-side label</span>
            <input
              className="mws-input"
              type="text"
              value={toSideLabel}
              onChange={(event) => setToSideLabel(event.target.value)}
              placeholder="e.g. Request"
              required
            />
          </label>
        </div>

        <label className="mws-checkbox">
          <input
            type="checkbox"
            checked={showOnFromAsTab}
            onChange={(event) => setShowOnFromAsTab(event.target.checked)}
          />
          <span className="body">Show as a tab on the From-side record detail</span>
        </label>

        {showOnFromAsTab && (
          <label className="mws-field">
            <span className="caption">Tab label</span>
            <input
              className="mws-input"
              type="text"
              value={tabLabel}
              onChange={(event) => setTabLabel(event.target.value)}
              required
            />
          </label>
        )}

        {submitError && (
          <p role="alert" className="mws-alert mws-alert--error">{submitError}</p>
        )}
      </form>
    </Modal>
  );
}

interface RetireConfirmDialogProps {
  relationship: RelationshipDto;
  liveLinkCount: number | null;
  isRetiring: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function RetireConfirmDialog({
  relationship,
  liveLinkCount,
  isRetiring,
  onCancel,
  onConfirm,
}: RetireConfirmDialogProps) {
  const hasLinks = liveLinkCount !== null && liveLinkCount > 0;
  return (
    <Modal
      title={hasLinks ? 'Retire with live links?' : 'Retire this relationship?'}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isRetiring}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isRetiring}>
            {hasLinks ? 'Retire anyway' : 'Retire relationship'}
          </Button>
        </>
      }
    >
      <p className="body">
        <strong>{relationship.name}</strong>
      </p>
      {hasLinks ? (
        <p className="body">
          {liveLinkCount} linked record{liveLinkCount === 1 ? '' : 's'} still reference this relationship.
          Retiring will hide them from the affected surfaces but leave the history intact. Confirm to proceed.
        </p>
      ) : (
        <p className="body">
          The relationship — and its auto-provisioned Link-to-record fields — will be hidden from the schema.
          You can restore it later from the Retired section.
        </p>
      )}
    </Modal>
  );
}
