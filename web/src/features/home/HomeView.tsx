// The Home surface (S1 — prototyped, BS §10.7). The per-user landing: a heading with the Pin-as-home
// affordance, the pinned-announcement strip, then four viewer-scoped panels (Needs your decision · Your
// work today · Since you were last here · New to triage). Scoped to the caller's active workspace. Renders
// explicit loading / error / no-workspace states (web-component-architecture.md); each panel owns its own
// empty note.

import { useMe } from '@/features/users/useMe';
import { resolveActiveWorkspaceId } from '@/shared/workspace/activeWorkspace';

import { useHome } from './useHome';
import { ActivityPanel } from './components/ActivityPanel';
import { DecisionsPanel } from './components/DecisionsPanel';
import { PinAsHomeButton } from './components/PinAsHomeButton';
import { PinnedStrip } from './components/PinnedStrip';
import { TriagePanel } from './components/TriagePanel';
import { WorkPanel } from './components/WorkPanel';

export function HomeView() {
  const me = useMe();
  const workspaceId = resolveActiveWorkspaceId(me.data?.memberships);
  const home = useHome(workspaceId);

  return (
    <section className="home" data-layout="wide" aria-labelledby="home-heading">
      <div className="home__heading">
        <h1 id="home-heading" className="home__title">
          Home
        </h1>
        <PinAsHomeButton />
      </div>

      {(me.isLoading || (Boolean(workspaceId) && home.isLoading)) && (
        <p className="caption" role="status">
          Loading your home…
        </p>
      )}

      {me.data && !workspaceId && (
        <p className="caption">You are not a member of any workspace yet. An admin will add you.</p>
      )}

      {home.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          We couldn&rsquo;t load your home. Try again in a moment.
        </p>
      )}

      {home.data && (
        <>
          <PinnedStrip announcements={home.data.pinnedAnnouncements} />
          <div className="home__grid">
            <DecisionsPanel items={home.data.decisions} count={home.data.decisionCount} />
            <WorkPanel items={home.data.work} count={home.data.workCount} />
            <ActivityPanel items={home.data.activity} sinceLastSeenAt={home.data.sinceLastSeenAt} />
            <TriagePanel items={home.data.triage} count={home.data.triageCount} />
          </div>
        </>
      )}
    </section>
  );
}
