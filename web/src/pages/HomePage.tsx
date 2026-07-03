// Landing surface for slice 2. The real Home (S1 — viewer-scoped panels) is prototyped and
// lands in slice 22; here it is a welcome that also proves the authenticated /users/me round
// trip by listing the caller's workspace memberships (empty until slice 17 assigns them).

import { useMe } from '@/features/users/useMe';

export function HomePage() {
  const { data: me, isLoading, isError } = useMe();

  return (
    <section aria-labelledby="home-heading">
      <h1 id="home-heading" className="h2">
        Welcome to the AI Solutions Tracker
      </h1>
      <p className="body">
        This is your home base. Workspace surfaces — requests, dashboards, and reference — arrive
        as the product is built out.
      </p>

      {isLoading && (
        <p className="caption" role="status">
          Loading your workspaces…
        </p>
      )}
      {isError && (
        <p className="caption" role="alert">
          We couldn&rsquo;t load your workspaces. Try again in a moment.
        </p>
      )}
      {me &&
        (me.memberships.length > 0 ? (
          <ul>
            {me.memberships.map((membership) => (
              <li key={membership.workspaceId} className="body">
                {membership.workspaceName}
              </li>
            ))}
          </ul>
        ) : (
          <p className="caption">
            You are not a member of any workspace yet. An admin will add you.
          </p>
        ))}
    </section>
  );
}
