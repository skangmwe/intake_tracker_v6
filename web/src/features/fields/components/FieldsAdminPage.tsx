// Fields & objects admin surface (S30). A workspace admin manages the field schema (a flat catalog
// across every object type), the object registry, and the relationships between objects — one page,
// three tabs. Renders explicit loading / error / no-access states (web-component-architecture.md).

import { useState } from 'react';
import { type Icon, Graph, Stack, Textbox } from '@phosphor-icons/react';

import { useMe } from '@/features/users/useMe';
import { useActiveWorkspaceId } from '@/shared/workspace/ActiveWorkspaceContext';

import { RelationshipsAdminTab } from '@/features/relationships';
import { ObjectsAdminTab } from '@/features/objects';

import { FieldsCatalogTab } from './FieldsCatalogTab';

type S30Tab = 'fields' | 'objects' | 'relationships';

const S30_TABS: { value: S30Tab; label: string; Icon: Icon }[] = [
  { value: 'fields', label: 'Fields', Icon: Textbox },
  { value: 'objects', label: 'Objects', Icon: Stack },
  { value: 'relationships', label: 'Relationships', Icon: Graph },
];

export function FieldsAdminPage() {
  const { data: me, isLoading: isMeLoading, isError: isMeError } = useMe();
  const workspaceId = useActiveWorkspaceId();
  const isAdmin = (me?.memberships ?? []).some(
    (membership) => membership.workspaceId === workspaceId && membership.level === 'WorkspaceAdmin',
  );

  const [s30Tab, setS30Tab] = useState<S30Tab>('fields');

  if (isMeLoading && !me) {
    return (
      <p className="caption" role="status">
        Loading your workspaces…
      </p>
    );
  }

  if (isMeError && !me) {
    return (
      <p className="mws-alert mws-alert--error" role="alert">
        We couldn’t load your access. Try again in a moment.
      </p>
    );
  }

  if (!workspaceId || !isAdmin) {
    return (
      <section className="mws-empty mws-empty--zero">
        <p className="body">
          You need to be a workspace admin to manage the field schema. Ask an admin to grant access.
        </p>
      </section>
    );
  }

  // The surface title + lead render once in the shared SideNavLayout header (from the active nav
  // item); this page composes only the tab content, scoped to the active workspace.
  return (
    <section aria-label="Fields and objects">
      <div
        className="fields-tabbar"
        role="tablist"
        aria-label="Fields & objects section"
        data-ds="tab"
      >
        {S30_TABS.map((tab) => {
          const TabIcon = tab.Icon;
          const isActive = s30Tab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={
                isActive ? 'fields-tabbar__tab fields-tabbar__tab--active' : 'fields-tabbar__tab'
              }
              onClick={() => setS30Tab(tab.value)}
            >
              <TabIcon size={16} aria-hidden /> {tab.label}
            </button>
          );
        })}
      </div>

      {s30Tab === 'relationships' ? (
        <RelationshipsAdminTab workspaceId={workspaceId} />
      ) : s30Tab === 'objects' ? (
        <ObjectsAdminTab workspaceId={workspaceId} />
      ) : (
        <FieldsCatalogTab workspaceId={workspaceId} />
      )}
    </section>
  );
}
