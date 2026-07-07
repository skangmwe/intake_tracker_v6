// S38 Workspace provisioning — the R1 Phase 2 self-serve wizard (BS §1.1, §15). A Platform admin stands
// up a new PG/Dept workspace by cloning the template: name, a globally-unique prefix, and the initial
// admin (by email, resolved server-side — R1 has no user-directory endpoint). Three steps with a review
// before the irreversible clone; on success the provisioned workspace summary is shown. The API is the
// access boundary (403 for non-admins); PlatformGate is the UI courtesy.

import { useState, type FormEvent } from 'react';

import type { WorkspaceProvisionResult } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { TextField } from '@/shared/components/Form';
import { Stepper } from '@/shared/components/Feedback';
import { problemMessage } from '@/shared/http/problemMessage';

import { PlatformGate } from './PlatformGate';
import { usePlatformAdmin } from '../usePlatformAdmin';
import { useProvisionWorkspace } from '../useWorkspaceProvisioning';

const STEPS = [{ label: 'Details' }, { label: 'Initial admin' }, { label: 'Review' }];
const PREFIX_PATTERN = /^[A-Za-z0-9]{2,16}$/;

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="wp-review__row">
      <dt className="wp-review__label">{label}</dt>
      <dd className="wp-review__value">{value}</dd>
    </div>
  );
}

function ProvisionSurface() {
  const provision = useProvisionWorkspace();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<WorkspaceProvisionResult | null>(null);

  const trimmedName = name.trim();
  const upperPrefix = prefix.trim().toUpperCase();
  const trimmedEmail = email.trim();

  const detailsValid = trimmedName.length > 0 && PREFIX_PATTERN.test(prefix.trim());
  const adminValid = trimmedEmail.length > 0;

  if (result) {
    return (
      <section className="wp-result" aria-label="Provisioned workspace">
        <Stepper steps={STEPS} currentIndex={STEPS.length} />
        <div className="mws-alert mws-alert--success wp-result__banner" role="status">
          Workspace “{result.name}” is ready. Its first record will be {result.prefix}-00000001.
        </div>
        <dl className="wp-review">
          <ReviewRow label="Name" value={result.name} />
          <ReviewRow label="Prefix" value={result.prefix} />
          <ReviewRow label="Kind" value={result.kind} />
        </dl>
        <div className="wp-actions">
          <Button
            variant="secondary"
            onClick={() => {
              provision.reset();
              setResult(null);
              setName('');
              setPrefix('');
              setEmail('');
              setStep(0);
            }}
          >
            Provision another workspace
          </Button>
        </div>
      </section>
    );
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step === 0) {
      if (detailsValid) setStep(1);
      return;
    }
    if (step === 1) {
      if (adminValid) setStep(2);
      return;
    }
    provision.mutate(
      { name: trimmedName, prefix: upperPrefix, initialAdminEmail: trimmedEmail },
      { onSuccess: (provisioned) => setResult(provisioned) },
    );
  };

  return (
    <form className="wp-wizard" onSubmit={onSubmit} aria-label="Provision workspace">
      <Stepper steps={STEPS} currentIndex={step} />

      {step === 0 && (
        <div className="wp-step">
          <TextField
            label="Workspace name"
            value={name}
            onChange={setName}
            placeholder="Litigation"
            hint="The practice group or department this workspace serves."
          />
          <TextField
            label="Prefix"
            value={prefix}
            onChange={setPrefix}
            placeholder="LIT"
            hint="2–16 letters or digits, globally unique. Used for every record id (e.g. LIT-00000001)."
            error={prefix.trim().length > 0 && !PREFIX_PATTERN.test(prefix.trim()) ? 'Prefix must be 2–16 letters or digits.' : undefined}
          />
        </div>
      )}

      {step === 1 && (
        <div className="wp-step">
          <TextField
            label="Initial admin email"
            value={email}
            onChange={setEmail}
            placeholder="admin@mwe.com"
            autoComplete="email"
            hint="They become the first workspace admin. Must have signed in to the platform at least once."
          />
        </div>
      )}

      {step === 2 && (
        <div className="wp-step">
          <dl className="wp-review">
            <ReviewRow label="Name" value={trimmedName} />
            <ReviewRow label="Prefix" value={upperPrefix} />
            <ReviewRow label="Initial admin" value={trimmedEmail} />
          </dl>
          <p className="wp-review__note">
            Provisioning clones the PG/Dept template and cannot be undone. The first record will be{' '}
            {upperPrefix}-00000001.
          </p>
        </div>
      )}

      {provision.isError && (
        <p className="mws-alert mws-alert--error" role="alert">
          {problemMessage(provision.error)}
        </p>
      )}

      <div className="wp-actions">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={() => setStep((prev) => prev - 1)}>
            Back
          </Button>
        )}
        {step < 2 && (
          <Button type="submit" disabled={step === 0 ? !detailsValid : !adminValid}>
            Continue
          </Button>
        )}
        {step === 2 && (
          <Button type="submit" disabled={provision.isPending}>
            {provision.isPending ? 'Provisioning…' : 'Provision workspace'}
          </Button>
        )}
      </div>
    </form>
  );
}

export function WorkspaceProvisioningPage() {
  const { isPlatformAdmin } = usePlatformAdmin();

  return (
    <PlatformGate
      title="Workspace provisioning"
      lead="Stand up a new PG/Dept workspace by cloning the template — name, prefix, and initial admin."
    >
      {isPlatformAdmin && <ProvisionSurface />}
    </PlatformGate>
  );
}
