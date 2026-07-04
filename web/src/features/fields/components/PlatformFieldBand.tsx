// The platform-defined field read-only band on S30 (BS §4.3). These fields are governed centrally
// (S34); a workspace admin sees them but cannot edit them here. A Platform admin gets a link to S34.

import { Link } from 'react-router-dom';
import type { PlatformFieldDto } from '@shared/types';

interface PlatformFieldBandProps {
  platformFields: PlatformFieldDto[];
  canManage: boolean;
}

export function PlatformFieldBand({ platformFields, canManage }: PlatformFieldBandProps) {
  if (platformFields.length === 0) {
    return null;
  }

  return (
    <section className="mws-card fields-platform-band" aria-labelledby="platform-band-heading">
      <div className="fields-platform-band__header">
        <h3 id="platform-band-heading" className="h3">
          Platform-defined fields
        </h3>
        {canManage && (
          <Link to="/platform/fields" className="mws-link mws-link--cta">
            Manage in platform schema
          </Link>
        )}
      </div>
      <p className="caption">Defined centrally and read-only here. Only a Platform admin can change these.</p>
      <ul className="fields-platform-list">
        {platformFields.map((field) => (
          <li key={field.id} className="fields-platform-item">
            <span className="body">{field.displayName}</span>
            <code className="mws-ident">{field.fieldKey}</code>
            {field.isSystemImmutable && <span className="mws-badge mws-badge--draft">System</span>}
            {!field.hasManualWritePath && <span className="mws-badge mws-badge--info">No manual writes</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
