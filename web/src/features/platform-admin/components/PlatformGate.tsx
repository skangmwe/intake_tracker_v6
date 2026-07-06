// Shared frame for the platform-admin surfaces (S35–S39). Renders the page heading in every state and
// the three gate outcomes — loading, load-error, and not-a-Platform-admin — so each page composes only
// its own content (web-component-architecture.md: the three non-data states rendered explicitly). The
// API is the access boundary; this gate is a UI courtesy that avoids a guaranteed-403 fetch.

import type { ReactNode } from 'react';

import { usePlatformAdmin } from '../usePlatformAdmin';

interface PlatformGateProps {
  title: string;
  /** One-line surface description shown under the heading when the caller is a Platform admin. */
  lead?: string;
  children: ReactNode;
}

export function PlatformGate({ title, lead, children }: PlatformGateProps) {
  const { isPlatformAdmin, isLoading, isError } = usePlatformAdmin();

  const heading = <h1 className="h1 platform-admin__title">{title}</h1>;

  if (isLoading) {
    return (
      <div className="platform-admin">
        {heading}
        <p className="caption" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="platform-admin">
        {heading}
        <p className="mws-alert mws-alert--error" role="alert">
          This page could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="platform-admin">
        {heading}
        <p className="mws-alert mws-alert--warning" role="alert">
          This page is available to platform admins. Ask the AI Solutions Lead if you need access.
        </p>
      </div>
    );
  }

  return (
    <div className="platform-admin">
      {heading}
      {lead != null && <p className="platform-admin__lead">{lead}</p>}
      {children}
    </div>
  );
}
