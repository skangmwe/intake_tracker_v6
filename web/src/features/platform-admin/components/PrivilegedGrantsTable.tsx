// S36 privileged-grants directory table (data-visualization.md): scoped headers, 1px row rules, no
// vertical dividers, scrolls within its own shell. Each row is a privileged grant. The kind is a
// StatusPill paired with its label (never colour alone). Only PlatformAdmin rows can be revoked here;
// WorkspaceAdmin rows are read-only (managed in Users & access, module-boundaries §1/§21).

import type { PrivilegedGrantDto } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { StatusPill } from '@/shared/components/Feedback';

const EM_DASH = '—';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? EM_DASH
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface PrivilegedGrantsTableProps {
  grants: PrivilegedGrantDto[];
  onRevoke: (grant: PrivilegedGrantDto) => void;
}

export function PrivilegedGrantsTable({ grants, onRevoke }: PrivilegedGrantsTableProps) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a horizontally-scrollable region must be keyboard-focusable (axe scrollable-region-focusable).
    <div className="platform-table-shell" tabIndex={0} role="region" aria-label="Privileged grants">
      <table className="platform-table" data-ds="table">
        <caption className="mws-sr-only">Privileged access grants across the firm</caption>
        <thead>
          <tr>
            <th scope="col">Access</th>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Scope</th>
            <th scope="col">Granted</th>
            <th scope="col">
              <span className="mws-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {grants.map((grant) => {
            const isPlatform = grant.grantKind === 'PlatformAdmin';
            return (
              <tr key={`${grant.grantKind}:${grant.userId}:${grant.workspaceId ?? 'firm'}`}>
                <td>
                  <StatusPill
                    status={isPlatform ? 'info' : 'neutral'}
                    label={isPlatform ? 'Platform admin' : 'Workspace admin'}
                  />
                </td>
                <td>{grant.displayName}</td>
                <td className="platform-table__key">{grant.email}</td>
                <td>{isPlatform ? 'Firm-wide' : (grant.workspaceName ?? EM_DASH)}</td>
                <td>{formatWhen(grant.grantedAt)}</td>
                <td className="platform-table__actions">
                  {isPlatform ? (
                    <Button variant="secondary" compact onClick={() => onRevoke(grant)}>
                      Revoke
                    </Button>
                  ) : (
                    EM_DASH
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
