// PlatformLayout — the settings-style frame for the platform-admin area (S34–S39). A single
// "Platform" sidebar entry lands here; the six firm-wide config surfaces are a side list (shared
// SideNavLayout), and the active surface renders in the content column. The API is the access
// boundary (403 for non-admins); this courtesy-gates the whole area so a non-admin who reaches the
// URL directly never sees the surface list. Each child page still renders its own heading + gate
// via PlatformGate.

import { SideNavLayout } from '@/shared/components/Layout/SideNavLayout';

import { usePlatformAdmin } from '../usePlatformAdmin';
import { PLATFORM_NAV } from '../platformNav';

export function PlatformLayout() {
  const { isPlatformAdmin, isLoading, isError } = usePlatformAdmin();

  if (isLoading) {
    return (
      <div className="platform-admin">
        <h1 className="h1 platform-admin__title">Platform</h1>
        <p className="caption" role="status">
          Loading…
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="platform-admin">
        <h1 className="h1 platform-admin__title">Platform</h1>
        <p className="mws-alert mws-alert--error" role="alert">
          This area could not be loaded. Try again in a moment.
        </p>
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="platform-admin">
        <h1 className="h1 platform-admin__title">Platform</h1>
        <p className="mws-alert mws-alert--warning" role="alert">
          This area is available to platform admins. Ask the AI Solutions Lead if you need access.
        </p>
      </div>
    );
  }

  return <SideNavLayout navLabel="Platform settings" items={PLATFORM_NAV} />;
}
