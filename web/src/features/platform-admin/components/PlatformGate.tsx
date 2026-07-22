// Shared frame for the platform-admin surfaces (S35–S39). Renders the three gate outcomes — loading,
// load-error, and not-a-Platform-admin — so each page composes only its own content
// (web-component-architecture.md: the three non-data states rendered explicitly). The API is the
// access boundary; this gate is a UI courtesy that avoids a guaranteed-403 fetch. The surface title +
// lead are rendered once by the shared SideNavLayout header (from the active nav item), so this gate
// no longer renders a heading of its own.

import type { ReactNode } from 'react';

import { usePlatformAdmin } from '../usePlatformAdmin';

interface PlatformGateProps {
  children: ReactNode;
}

export function PlatformGate({ children }: PlatformGateProps) {
  const { isPlatformAdmin, isLoading, isError } = usePlatformAdmin();

  if (isLoading) {
    return (
      <div className="platform-admin">
        <p className="caption" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="platform-admin">
        <p className="mws-alert mws-alert--error" role="alert">
          This page could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="platform-admin">
        <p className="mws-alert mws-alert--warning" role="alert">
          This page is available to platform admins. Ask the AI Solutions Lead if you need access.
        </p>
      </div>
    );
  }

  return <div className="platform-admin">{children}</div>;
}
