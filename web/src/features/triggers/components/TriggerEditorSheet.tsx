// The trigger configuration side sheet (slice: triggers-request-authoring, Task 2.3) — create or edit
// one Authored Request trigger: name, enabled, notification category, cadence, recipients, the
// notification copy, and the embedded conditions editor. Uses the shared SideSheet for the sheet
// chrome (scrim, focus, Escape). Validation is server-authoritative; the returned reasons surface in
// the inline error slot.

import { useState } from 'react';

import { SideSheet } from '@/shared/components/Disclosure/SideSheet';
import { Button } from '@/shared/components/Button';

import { CADENCE_OPTIONS, CATEGORY_OPTIONS, RECIPIENT_OPTIONS } from '../constants';
import { buildInitialForm, formToRequest, type TriggerForm } from '../triggerForm';
import type { TriggerDto, TriggerUpsertRequest } from '../types';
import { TriggerConditionsEditor } from './TriggerConditionsEditor';

interface TriggerEditorSheetProps {
  /** The trigger being edited, or null to create a new one. */
  trigger: TriggerDto | null;
  /** Request field keys offered as condition targets. */
  fieldKeys: string[];
  saveError: string | null;
  isSaving: boolean;
  onSave: (request: TriggerUpsertRequest) => void;
  /** Delete the trigger. Absent for the create flow. */
  onDelete?: (() => void) | undefined;
  isDeleting?: boolean | undefined;
  onClose: () => void;
}

export function TriggerEditorSheet({
  trigger,
  fieldKeys,
  saveError,
  isSaving,
  onSave,
  onDelete,
  isDeleting = false,
  onClose,
}: TriggerEditorSheetProps) {
  const isCreate = trigger === null;
  const [form, setForm] = useState<TriggerForm>(() =>
    buildInitialForm(trigger, fieldKeys[0] ?? ''),
  );

  const patch = (next: Partial<TriggerForm>) => setForm((current) => ({ ...current, ...next }));

  const toggleRecipient = (key: string, checked: boolean) =>
    patch({
      recipients: checked
        ? [...form.recipients, key]
        : form.recipients.filter((entry) => entry !== key),
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave(formToRequest(form));
  };

  return (
    <SideSheet title={isCreate ? 'Add trigger' : `Edit ${trigger.name}`} onClose={onClose}>
      <form className="triggers-form" onSubmit={submit}>
        {saveError && (
          <p className="mws-alert mws-alert--error" role="alert">
            {saveError}
          </p>
        )}

        <label className="mws-field">
          <span className="caption">Name</span>
          <input
            className="mws-input"
            value={form.name}
            required
            onChange={(event) => patch({ name: event.target.value })}
          />
        </label>

        <div className="triggers-toggle" data-ds="toggle">
          <label className="mws-switch">
            <input
              type="checkbox"
              aria-label="Enabled"
              checked={form.isEnabled}
              onChange={(event) => patch({ isEnabled: event.target.checked })}
            />
            <span className="mws-switch__track">
              <span className="mws-switch__thumb" />
            </span>
          </label>
          <span className="caption">{form.isEnabled ? 'Enabled' : 'Disabled'}</span>
        </div>

        <label className="mws-field">
          <span className="caption">Notification category</span>
          <select
            className="mws-select"
            value={form.notificationCategory}
            onChange={(event) =>
              patch({ notificationCategory: event.target.value as TriggerForm['notificationCategory'] })
            }
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="triggers-interval">
          <label className="mws-field">
            <span className="caption">Cadence</span>
            <select
              className="mws-select"
              value={form.cadence}
              onChange={(event) => patch({ cadence: event.target.value as TriggerForm['cadence'] })}
            >
              {CADENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {form.cadence === 'RepeatEveryNDays' && (
            <label className="mws-field triggers-interval__days">
              <span className="caption">Every N days</span>
              <input
                className="mws-input"
                inputMode="numeric"
                pattern="[0-9]*"
                value={String(form.repeatIntervalDays)}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  patch({ repeatIntervalDays: Number.isNaN(parsed) ? 1 : parsed });
                }}
              />
            </label>
          )}
        </div>

        <fieldset className="mws-field">
          <legend className="caption">Recipients</legend>
          <div className="triggers-recipients">
            {RECIPIENT_OPTIONS.map((option) => (
              <label key={option.value} className="mws-check">
                <input
                  type="checkbox"
                  checked={form.recipients.includes(option.value)}
                  onChange={(event) => toggleRecipient(option.value, event.target.checked)}
                />
                <span className="mws-check__box" aria-hidden="true" />
                <span className="caption">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mws-field">
          <span className="caption">Notification title</span>
          <input
            className="mws-input"
            value={form.notificationTitle}
            required
            onChange={(event) => patch({ notificationTitle: event.target.value })}
          />
        </label>

        <label className="mws-field">
          <span className="caption">Notification body</span>
          <textarea
            className="mws-textarea"
            rows={3}
            value={form.notificationBody}
            onChange={(event) => patch({ notificationBody: event.target.value })}
          />
        </label>

        <TriggerConditionsEditor
          rows={form.conditions}
          fieldKeys={fieldKeys}
          onChange={(conditions) => patch({ conditions })}
        />

        <footer className="triggers-form__footer">
          {trigger && onDelete && (
            <Button variant="destructive" onClick={onDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete trigger'}
            </Button>
          )}
          <span className="triggers-form__footer-spacer" />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save trigger'}
          </Button>
        </footer>
      </form>
    </SideSheet>
  );
}
