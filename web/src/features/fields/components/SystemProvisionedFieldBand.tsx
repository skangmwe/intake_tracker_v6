// System-provisioned field read-only band on S30 (Slice 25). These are workspace-scoped
// FieldDefinition rows marked isSystemProvisioned = 1 by migration 057 — they render as a
// locked band alongside PlatformFieldBand (§4.3), so a workspace admin sees them but
// cannot edit or retire them from the Fields editor. The two bands sit side by side
// (system-provisioned first — they're the object's identity fields), each covering a
// disjoint set of rows.

import type { FieldDefinitionDto } from '@shared/types';

import { fieldTypeLabel } from '../constants';

interface SystemProvisionedFieldBandProps {
  fields: FieldDefinitionDto[];
}

export function SystemProvisionedFieldBand({ fields }: SystemProvisionedFieldBandProps) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <section
      className="mws-card fields-platform-band"
      aria-labelledby="system-provisioned-band-heading"
    >
      <div className="fields-platform-band__header">
        <h3 id="system-provisioned-band-heading" className="h3">
          System-provisioned fields
        </h3>
      </div>
      <p className="caption">
        These fields are provisioned by the platform for every record of this object type. They
        can’t be edited or removed from here.
      </p>
      <ul className="fields-platform-list">
        {fields.map((field) => (
          <li key={field.id} className="fields-platform-item">
            <span className="body">{field.displayName}</span>
            <code className="mws-ident">{field.fieldKey}</code>
            <span className="mws-badge mws-badge--info">{fieldTypeLabel(field.fieldType)}</span>
            <span className="mws-badge mws-badge--draft">System</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
