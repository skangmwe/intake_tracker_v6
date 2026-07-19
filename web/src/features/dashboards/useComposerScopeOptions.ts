// Sources the widget composer's scope options (slice 28): the department checkboxes come from the
// Request `deptPgClient` select field, and the stage checkboxes from the workspace's default
// lifecycle. Both reads are Viewer-gated, so a Member composing a personal dashboard can load them.
// Returns a stable, memoised view; empty lists while loading (the composer then just offers "all").

import { useMemo } from 'react';

import type { WorkspaceId } from '@shared/types';

import { useWorkspaceFields } from '@/features/fields';
import { useLifecycleConfig } from '@/features/lifecycle';

const DEPT_FIELD_KEY = 'deptPgClient';

export interface StageOption {
  key: string;
  label: string;
}

export interface ComposerScopeOptions {
  deptOptions: string[];
  stageOptions: StageOption[];
  /** Stage key → label, for rendering a widget's stored scope. */
  stageLabels: Record<string, string>;
  isLoading: boolean;
}

export function useComposerScopeOptions(
  workspaceId: WorkspaceId | undefined,
): ComposerScopeOptions {
  const fields = useWorkspaceFields(workspaceId, 'Request');
  const lifecycle = useLifecycleConfig(workspaceId);

  const deptOptions = useMemo(() => {
    const deptField = fields.data?.fields.find((field) => field.fieldKey === DEPT_FIELD_KEY);
    return deptField?.options.map((option) => option.value) ?? [];
  }, [fields.data]);

  const stageOptions = useMemo<StageOption[]>(() => {
    const lifecycles = lifecycle.data?.lifecycles ?? [];
    const active = lifecycles.find((entry) => entry.isDefault) ?? lifecycles[0];
    return active?.stages.map((stage) => ({ key: stage.key, label: stage.label })) ?? [];
  }, [lifecycle.data]);

  const stageLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const stage of stageOptions) {
      map[stage.key] = stage.label;
    }
    return map;
  }, [stageOptions]);

  return {
    deptOptions,
    stageOptions,
    stageLabels,
    isLoading: fields.isLoading || lifecycle.isLoading,
  };
}
