// Read-only field sheet (Fields tab reconciliation). Opened when a locked catalog row is clicked —
// a synthesised system auto-field, or a Global field owned by another workspace. Mirrors the
// prototype's locked field sheet: a lock banner explaining why it can't be edited, then the field's
// attributes as read-only label/value pairs. Non-blocking side sheet (disclosure-surfaces.md);
// Escape closes.

import { useEffect, useRef } from 'react';
import { LockSimple, X } from '@phosphor-icons/react';

import type { FieldCatalogRowDto } from '@shared/types';

import { IconButton } from '@/shared/components/Button';

import { fieldLocationLabel, fieldTypeLabel, objectLabel } from '../constants';

interface FieldReadOnlySheetProps {
  row: FieldCatalogRowDto;
  onClose: () => void;
}

export function FieldReadOnlySheet({ row, onClose }: FieldReadOnlySheetProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const lockMessage =
    row.source === 'System'
      ? 'This is a system field, provisioned automatically on every object. It can’t be edited, archived, or deleted.'
      : row.source === 'Platform'
        ? 'This is a platform-defined field managed centrally. It can’t be edited here.'
        : 'This is a global field owned by a workspace. It can only be changed from the workspace that created it.';

  const rows: { label: string; value: string }[] = [
    { label: 'Field', value: row.displayName },
    { label: 'Key', value: row.fieldKey },
    { label: 'Type', value: fieldTypeLabel(row.fieldType) },
    { label: 'Object', value: objectLabel(row.objectType) },
    { label: 'Location', value: fieldLocationLabel(row.location) },
    { label: 'Required', value: row.isRequired ? 'Required' : 'Optional' },
    { label: 'Source', value: row.source },
    { label: 'Status', value: row.status },
  ];

  return (
    <div
      className="fields-sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby="field-readonly-heading"
      data-ds="sheet"
    >
      <header className="fields-sheet__header">
        <h2 id="field-readonly-heading" tabIndex={-1} ref={headingRef} className="h3">
          {row.displayName}
        </h2>
        <IconButton icon={X} label="Close" onClick={onClose} />
      </header>

      <div className="fields-sheet__body">
        <p className="mws-alert mws-alert--warning fields-sheet__lock" role="note">
          <LockSimple size={16} aria-hidden /> {lockMessage}
        </p>

        <dl className="fields-readonly">
          {rows.map((entry) => (
            <div key={entry.label} className="fields-readonly__row">
              <dt className="caption">{entry.label}</dt>
              <dd className="body">{entry.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
