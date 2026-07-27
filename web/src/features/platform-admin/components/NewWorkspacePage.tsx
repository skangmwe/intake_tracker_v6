// New workspace — full-screen wizard (S38). Template → Review → Details. Renders outside the app
// shell and platform side nav (a standalone flow owns the whole surface; steppers-and-wizards.md).
// Reuses the existing provisioning endpoint unchanged. Platform-admin is enforced server-side; a
// non-admin who reaches the URL sees the gate message and no form.

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/shared/components/Button';
import { TextField } from '@/shared/components/Form';
import { Stepper } from '@/shared/components/Feedback';
import { problemMessage } from '@/shared/http/problemMessage';

import { usePlatformAdmin } from '../usePlatformAdmin';
import { useProvisionWorkspace } from '../useWorkspaceProvisioning';
import { WORKSPACES_LIST_QUERY_KEY } from '../useWorkspacesList';
import { PGDEPT_TEMPLATE } from '../newWorkspaceTemplate';
import '../newWorkspace.css';

const STEPS = [{ label: 'Template' }, { label: 'Review' }, { label: 'Details' }];
const PREFIX_PATTERN = /^[A-Za-z0-9]{2,16}$/;
const LIST_ROUTE = '/platform/workspaces';

function TemplateStep() {
  return (
    <>
      <h2 className="nww__step-title">Choose a base template</h2>
      <p className="nww__step-lead">
        Every template provisions its own objects, fields, relationships, lifecycle, views,
        dashboards, and access levels. The workspace owner can change any of it afterward — templates
        are a starting point, not a lock-in.
      </p>
      <div
        role="radio"
        aria-checked="true"
        tabIndex={0}
        className="nww-card"
        data-ds="card"
      >
        <strong>{PGDEPT_TEMPLATE.name}</strong>
        <div>
          <span className="nww-card__badge">Recommended</span>
        </div>
        <p className="nww-review__muted">{PGDEPT_TEMPLATE.tagline}</p>
        <div className="nww-card__meta">{PGDEPT_TEMPLATE.metaLine}</div>
      </div>
    </>
  );
}

function ReviewStep() {
  const template = PGDEPT_TEMPLATE;
  return (
    <>
      <h2 className="nww__step-title">{template.name}</h2>
      <p className="nww__step-lead">{template.blurb}</p>
      <div className="nww-review">
        <section className="nww-review__card" aria-label="Objects">
          <p className="nww-review__eyebrow">Objects</p>
          {template.objects.map((object) => (
            <div className="nww-review__row" key={object.name}>
              <span>
                <strong>{object.name}</strong>
                <br />
                <span className="nww-review__muted">{object.description}</span>
              </span>
              <span className="nww-review__muted">{object.fieldCount} fields</span>
            </div>
          ))}
        </section>

        <section className="nww-review__card" aria-label="Notable fields">
          <p className="nww-review__eyebrow">Notable fields</p>
          {template.notableFields.map((field) => (
            <div className="nww-review__row" key={`${field.object}-${field.name}`}>
              <span>{field.name}</span>
              <span className="nww-review__muted">
                {field.type} · {field.object}
              </span>
            </div>
          ))}
          <p className="nww-review__muted">+{template.moreFieldsCount} more across these objects</p>
        </section>

        <section className="nww-review__card" aria-label="Lifecycle and gates">
          <p className="nww-review__eyebrow">Lifecycle &amp; gates</p>
          <strong>{template.lifecycleName}</strong>
          <div>
            {template.stages.map((stage) => (
              <span className="nww-chip" key={stage}>
                {stage}
              </span>
            ))}
          </div>
          {template.gates.map((gate) => (
            <div className="nww-review__row" key={gate.name}>
              <span>
                <strong>{gate.name}</strong>
                <br />
                <span className="nww-review__muted">{gate.transition}</span>
                <br />
                {gate.approvers.map((approver) => (
                  <span className="nww-chip" key={approver}>
                    {approver}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </section>

        <section className="nww-review__card" aria-label="Relationships">
          <p className="nww-review__eyebrow">Relationships</p>
          {template.relationships.map((relationship) => (
            <div className="nww-review__row" key={relationship.label}>
              <span>{relationship.label}</span>
              <span className="nww-chip">{relationship.cardinality}</span>
            </div>
          ))}
        </section>

        <section className="nww-review__card" aria-label="Saved views">
          <p className="nww-review__eyebrow">Saved views</p>
          {template.savedViews.map((view) => (
            <span className="nww-chip" key={view}>
              {view}
            </span>
          ))}
        </section>

        <section className="nww-review__card" aria-label="Dashboards">
          <p className="nww-review__eyebrow">Dashboards</p>
          {template.dashboards.map((dashboard) => (
            <div className="nww-review__row" key={dashboard.name}>
              <span>{dashboard.name}</span>
              <span className="nww-review__muted">{dashboard.widgetCount} widgets</span>
            </div>
          ))}
        </section>

        <section className="nww-review__card" aria-label="Access levels">
          <p className="nww-review__eyebrow">Access levels</p>
          {template.accessLevels.map((level) => (
            <div className="nww-review__row" key={level.name}>
              <span>
                <strong>{level.name}</strong>
              </span>
              <span className="nww-review__muted">{level.description}</span>
            </div>
          ))}
        </section>

        <section className="nww-review__card" aria-label="Sample records">
          <p className="nww-review__eyebrow">Sample records</p>
          {template.sampleRecords.map((record) => (
            <div className="nww-review__row" key={record.id}>
              <span>
                <span className="mono">{record.id}</span> {record.title}
              </span>
              <span className="nww-review__muted">{record.stage}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function WizardBody() {
  const provision = useProvisionWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [prefix, setPrefix] = useState('');

  const trimmedName = name.trim();
  const trimmedEmail = ownerEmail.trim();
  const upperPrefix = prefix.trim().toUpperCase();
  const prefixValid = PREFIX_PATTERN.test(prefix.trim());
  const detailsValid = trimmedName.length > 0 && trimmedEmail.length > 0 && prefixValid;

  const close = () => navigate(LIST_ROUTE);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step < 2) {
      setStep((prev) => prev + 1);
      return;
    }
    if (!detailsValid) return;
    provision.mutate(
      { name: trimmedName, prefix: upperPrefix, initialAdminEmail: trimmedEmail },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: WORKSPACES_LIST_QUERY_KEY });
          navigate(LIST_ROUTE);
        },
      },
    );
  };

  return (
    <form className="nww" onSubmit={onSubmit} aria-label="New workspace">
      <header className="nww__header">
        <div>
          <p className="nww__eyebrow">Platform settings</p>
          <h1 className="nww__title">New workspace</h1>
        </div>
        <div className="nww__stepper">
          <Stepper steps={STEPS} currentIndex={step} />
        </div>
        <button type="button" className="nww__close" aria-label="Close" onClick={close}>
          <X size={20} weight="regular" aria-hidden />
        </button>
      </header>

      <div className="nww__body">
        {step === 0 && <TemplateStep />}
        {step === 1 && <ReviewStep />}
        {step === 2 && (
          <div className="nww-form">
            <h2 className="nww__step-title">Name the workspace</h2>
            <p className="nww__step-lead">
              Provisioning from the {PGDEPT_TEMPLATE.name} template. You can rename it or change any
              configuration once it’s created.
            </p>
            <TextField label="Workspace name" value={name} onChange={setName} placeholder="Employment" />
            <TextField
              label="Workspace owner"
              value={ownerEmail}
              onChange={setOwnerEmail}
              placeholder="owner@mwe.com"
              autoComplete="email"
              hint="The owner gets the first Workspace admin access level. Enter their firm email."
            />
            <TextField
              label="Record ID prefix"
              value={prefix}
              onChange={setPrefix}
              placeholder="EMP"
              hint="Prepended to every record ID — records will look like EMP-00001024."
              error={
                prefix.trim().length > 0 && !prefixValid
                  ? 'Prefix must be 2–16 letters or digits.'
                  : undefined
              }
            />
            {provision.isError && (
              <p className="mws-alert mws-alert--error" role="alert">
                {problemMessage(provision.error)}
              </p>
            )}
          </div>
        )}
      </div>

      <footer className="nww__footer">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={() => setStep((prev) => prev - 1)}>
            Back
          </Button>
        )}
        <span className="nww__footer-spacer" />
        <Button type="button" variant="secondary" onClick={close}>
          Cancel
        </Button>
        {step < 2 && <Button type="submit">Continue</Button>}
        {step === 2 && (
          <Button type="submit" disabled={!detailsValid || provision.isPending}>
            {provision.isPending ? 'Creating…' : 'Create workspace'}
          </Button>
        )}
      </footer>
    </form>
  );
}

export function NewWorkspacePage() {
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

  return <WizardBody />;
}
