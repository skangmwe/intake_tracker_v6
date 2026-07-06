// S40 No-access page — the uniform read-blocked response. Rendered whenever a read returns 403,
// which the API returns identically for both forbidden and non-existent records so this surface
// NEVER reveals whether the record exists (no ID, no title, no "not found" copy — BS §22.6).
// Pale-fill surface with navy text (theme-stable rule) and a single "Go to Home" CTA → S1.

import { useNavigate } from 'react-router-dom';
import { LockKey } from '@phosphor-icons/react';

import { Button } from '@/shared/components/Button';

interface NoAccessPageProps {
  /** What the caller tried to open, e.g. "record" (default), "feature", "announcement". Names the
   *  object type only — never the specific instance — so existence is never disclosed. */
  resourceNoun?: string;
  /** Where "Go to Home" navigates. Defaults to the Home route. */
  homeTo?: string;
  /** Optional override for the CTA (e.g. a list route instead of Home). Falls back to navigating home. */
  onGoHome?: () => void;
}

export function NoAccessPage({ resourceNoun = 'record', homeTo = '/', onGoHome }: NoAccessPageProps) {
  const navigate = useNavigate();
  const goHome = onGoHome ?? (() => navigate(homeTo));

  return (
    <main className="mws-noaccess" data-ds="no-access">
      <section className="mws-empty mws-empty--zero" role="alert" aria-labelledby="noaccess-title">
        <LockKey className="mws-empty__icon" size={48} weight="regular" aria-hidden="true" />
        <h1 id="noaccess-title" className="mws-empty__title">
          You don’t have access to this {resourceNoun}.
        </h1>
        <p className="mws-empty__body">
          Ask your workspace admin if you think you should be able to see it.
        </p>
        <div className="mws-empty__actions">
          <Button variant="primary" onClick={goHome}>
            Go to Home
          </Button>
        </div>
      </section>
    </main>
  );
}
