// Platform Fields & objects (S34) — the platform analogue of the workspace S30 schema editor, scoped
// to global data. Three tabs mirror S30: Fields (the flat catalog — system auto-fields + platform-
// defined + Global fields), Objects (the Global built-in objects, read-only), and Relationships (a
// workspace-scoped read-only reference). Platform admins only — a non-admin gets a no-access message
// that never leaks the data. Renders explicit loading / no-access states (web-component-architecture.md).

import { useState } from 'react';
import { type Icon, Graph, Stack, Textbox } from '@phosphor-icons/react';

import { useMe } from '@/features/users/useMe';

import { PlatformFieldsCatalogTab } from './PlatformFieldsCatalogTab';
import { PlatformObjectsTab } from './PlatformObjectsTab';
import { PlatformRelationshipsTab } from './PlatformRelationshipsTab';

type S34Tab = 'fields' | 'objects' | 'relationships';

const S34_TABS: { value: S34Tab; label: string; Icon: Icon }[] = [
  { value: 'fields', label: 'Fields', Icon: Textbox },
  { value: 'objects', label: 'Objects', Icon: Stack },
  { value: 'relationships', label: 'Relationships', Icon: Graph },
];

export function PlatformFieldsPage() {
  const { data: me, isLoading: isMeLoading } = useMe();
  const isPlatformAdmin = me?.isPlatformAdmin ?? false;

  const [tab, setTab] = useState<S34Tab>('fields');

  if (isMeLoading && !me) {
    return (
      <p className="caption" role="status">
        Loading…
      </p>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <section className="mws-empty mws-empty--zero" aria-labelledby="platform-no-access">
        <h1 id="platform-no-access" className="h2">
          Fields &amp; objects
        </h1>
        <p className="body">
          You don’t have access to this. Ask a Platform admin if you need a change to the central
          field schema.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="platform-fields-heading">
      <header className="fields-header">
        <div>
          <p className="eyebrow fields-eyebrow">Platform settings</p>
          <h1 id="platform-fields-heading" className="h2">
            Fields &amp; objects
          </h1>
          <p className="body">Platform-level field definitions inherited by every workspace.</p>
        </div>
      </header>

      <div
        className="fields-tabbar"
        role="tablist"
        aria-label="Fields & objects section"
        data-ds="tab"
      >
        {S34_TABS.map((entry) => {
          const TabIcon = entry.Icon;
          const isActive = tab === entry.value;
          return (
            <button
              key={entry.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={
                isActive ? 'fields-tabbar__tab fields-tabbar__tab--active' : 'fields-tabbar__tab'
              }
              onClick={() => setTab(entry.value)}
            >
              <TabIcon size={16} aria-hidden /> {entry.label}
            </button>
          );
        })}
      </div>

      {tab === 'relationships' ? (
        <PlatformRelationshipsTab />
      ) : tab === 'objects' ? (
        <PlatformObjectsTab />
      ) : (
        <PlatformFieldsCatalogTab />
      )}
    </section>
  );
}
