// S36 grant-access form — grant the additive firm-wide Platform-admin grant to a colleague by email
// (BS §4.2/§4.3). The email resolves server-side against active platform users (unresolved / ambiguous
// → 400), so the form surfaces the API's plain-language message. On success the field clears; the
// directory refreshes via the mutation's cache invalidation.

import { useState, type FormEvent } from 'react';

import { Button } from '@/shared/components/Button';
import { TextField } from '@/shared/components/Form';
import { problemMessage } from '@/shared/http/problemMessage';

import { useGrantAccess } from '../useAccessGrants';

export function GrantAccessForm() {
  const [email, setEmail] = useState('');
  const grant = useGrantAccess();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (trimmed.length === 0) return;
    grant.mutate({ email: trimmed }, { onSuccess: () => setEmail('') });
  };

  return (
    <form className="platform-admin__add" onSubmit={onSubmit} aria-label="Grant platform admin">
      <div className="platform-admin__add-fields">
        <TextField
          label="Colleague email"
          value={email}
          onChange={setEmail}
          placeholder="colleague@mwe.com"
          autoComplete="email"
          hint="They must have signed in to the platform at least once."
        />
      </div>
      <div className="platform-admin__add-actions">
        <Button type="submit" disabled={grant.isPending || email.trim().length === 0}>
          {grant.isPending ? 'Granting…' : 'Grant platform admin'}
        </Button>
      </div>
      {grant.isError && (
        <p className="mws-alert mws-alert--error platform-admin__add-error" role="alert">
          {problemMessage(grant.error)}
        </p>
      )}
    </form>
  );
}
