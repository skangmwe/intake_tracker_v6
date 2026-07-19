// The widget composer side sheet (S6, slice 28): title, widget type, the type-specific control
// (metric / group-by / rows shown), half/full width, and dept + stage scope checkboxes. Binds a
// WidgetDraft locally and hands the finished draft back on save. Scope options are supplied by the
// caller (useComposerScopeOptions).

import { useState } from 'react';

import type { ComposedWidgetDimension, ComposedWidgetMetric, WidgetType } from '@shared/types';

import { Button } from '@/shared/components/Button';
import { NumberField, Select, TextField, type SelectOption } from '@/shared/components/Form';
import {
  COMPOSER_DIMENSIONS,
  COMPOSER_METRICS,
  COMPOSER_WIDGET_TYPES,
  widgetNeedsDimension,
  widgetNeedsMetric,
  widgetNeedsRowLimit,
} from '@/shared/dashboards/widgetTypeCatalog';

import type { ComposerScopeOptions } from '../useComposerScopeOptions';
import { isWidgetDraftValid, toggleScopeValue, type WidgetDraft } from '../composerModel';
import { ComposerSheet } from './ComposerSheet';
import { SegmentedToggle } from './SegmentedToggle';

const WIDTH_OPTIONS = [
  { value: 'Half', label: 'Half' },
  { value: 'Full', label: 'Full' },
] as const;

const TYPE_OPTIONS: SelectOption[] = COMPOSER_WIDGET_TYPES.map((entry) => ({ ...entry }));
const METRIC_OPTIONS: SelectOption[] = COMPOSER_METRICS.map((entry) => ({ ...entry }));
const DIMENSION_OPTIONS: SelectOption[] = COMPOSER_DIMENSIONS.map((entry) => ({ ...entry }));

interface WidgetComposerSheetProps {
  mode: 'new' | 'edit';
  initialDraft: WidgetDraft;
  scope: ComposerScopeOptions;
  onSave: (draft: WidgetDraft) => void;
  onClose: () => void;
  isPending: boolean;
  error?: string | null;
}

export function WidgetComposerSheet({
  mode,
  initialDraft,
  scope,
  onSave,
  onClose,
  isPending,
  error,
}: WidgetComposerSheetProps) {
  const [draft, setDraft] = useState<WidgetDraft>(initialDraft);
  const [showTitleError, setShowTitleError] = useState(false);

  const patch = (change: Partial<WidgetDraft>) => setDraft((prev) => ({ ...prev, ...change }));

  const submit = () => {
    if (!isWidgetDraftValid(draft)) {
      setShowTitleError(true);
      return;
    }
    onSave(draft);
  };

  const footer = (
    <>
      <Button variant="primary" onClick={submit} disabled={isPending}>
        {isPending ? 'Saving…' : mode === 'edit' ? 'Save widget' : 'Add widget'}
      </Button>
      <Button variant="secondary" onClick={onClose} disabled={isPending}>
        Cancel
      </Button>
    </>
  );

  return (
    <ComposerSheet
      title={mode === 'edit' ? 'Edit widget' : 'Add widget'}
      onClose={onClose}
      footer={footer}
    >
      <TextField
        label="Widget title"
        value={draft.title}
        onChange={(title) => {
          patch({ title });
          setShowTitleError(false);
        }}
        placeholder="e.g. Open by department"
      />
      {showTitleError && !draft.title.trim() && (
        <p className="dash-sheet__error" role="alert">
          Enter a title for this widget.
        </p>
      )}

      <div className="dash-sheet__row">
        <Select
          label="Widget type"
          value={draft.type}
          options={TYPE_OPTIONS}
          onChange={(value) => patch({ type: value as WidgetType })}
        />

        {widgetNeedsMetric(draft.type) && (
          <Select
            label="Metric"
            value={draft.metric}
            options={METRIC_OPTIONS}
            onChange={(value) => patch({ metric: value as ComposedWidgetMetric })}
          />
        )}
        {widgetNeedsDimension(draft.type) && (
          <Select
            label="Group by"
            value={draft.groupByDimension}
            options={DIMENSION_OPTIONS}
            onChange={(value) => patch({ groupByDimension: value as ComposedWidgetDimension })}
          />
        )}
        {widgetNeedsRowLimit(draft.type) && (
          <NumberField
            label="Rows shown"
            value={String(draft.rowLimit)}
            onChange={(value) => patch({ rowLimit: clampRowLimit(value) })}
          />
        )}
      </div>

      <SegmentedToggle
        label="Width"
        value={draft.width}
        options={WIDTH_OPTIONS}
        onChange={(width) => patch({ width })}
      />

      <fieldset className="dash-scope">
        <legend className="dash-field__label">Scope — departments</legend>
        <span className="dash-scope__hint">Leave all unchecked to include every department.</span>
        {scope.deptOptions.length === 0 ? (
          <span className="dash-scope__hint">No departments defined.</span>
        ) : (
          <div className="dash-scope__chips">
            {scope.deptOptions.map((dept) => (
              <label key={dept} className="dash-scope__chip">
                <input
                  type="checkbox"
                  checked={draft.depts.includes(dept)}
                  onChange={() => patch({ depts: toggleScopeValue(draft.depts, dept) })}
                />
                {dept}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="dash-scope">
        <legend className="dash-field__label">Scope — stages</legend>
        {scope.stageOptions.length === 0 ? (
          <span className="dash-scope__hint">No stages defined.</span>
        ) : (
          <div className="dash-scope__chips">
            {scope.stageOptions.map((stage) => (
              <label key={stage.key} className="dash-scope__chip">
                <input
                  type="checkbox"
                  checked={draft.stages.includes(stage.key)}
                  onChange={() => patch({ stages: toggleScopeValue(draft.stages, stage.key) })}
                />
                {stage.label}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {error && (
        <p className="mws-alert mws-alert--error" role="alert">
          {error}
        </p>
      )}
    </ComposerSheet>
  );
}

const MIN_ROW_LIMIT = 1;
const MAX_ROW_LIMIT = 20;

function clampRowLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return MIN_ROW_LIMIT;
  return Math.min(MAX_ROW_LIMIT, Math.max(MIN_ROW_LIMIT, parsed));
}
