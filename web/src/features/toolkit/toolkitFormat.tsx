// Presentation maps for the Toolkit surface (S43). Mirrors the prototype's TOOLKIT_ICONS /
// TOOLKIT_TYPE_BG / TOOLKIT_STATUS_BADGE constants: each kind gets a Phosphor icon + a pale type-pill
// class; each status gets a badge tone. Enumerable option lists live as typed module-level constants
// (web-component-architecture.md), never inline JSX.

import type { ComponentType } from 'react';
import { BookOpen, ChatText, Plug, type IconProps } from '@phosphor-icons/react';

import type { ToolkitItemKind, ToolkitItemStatus } from '@shared/types';

export const TOOLKIT_KINDS: ToolkitItemKind[] = ['Playbook', 'Plugin', 'Prompt'];
export const TOOLKIT_STATUSES: ToolkitItemStatus[] = ['Active', 'Draft', 'Archived'];

const KIND_ICONS: Record<ToolkitItemKind, ComponentType<IconProps>> = {
  Playbook: BookOpen,
  Plugin: Plug,
  Prompt: ChatText,
};

const KIND_PILL_CLASS: Record<ToolkitItemKind, string> = {
  Playbook: 'tk-pill--playbook',
  Plugin: 'tk-pill--plugin',
  Prompt: 'tk-pill--prompt',
};

const STATUS_BADGE_CLASS: Record<ToolkitItemStatus, string> = {
  Active: 'tk-badge--live',
  Draft: 'tk-badge--pending',
  Archived: 'tk-badge--archived',
};

export function kindIcon(kind: ToolkitItemKind): ComponentType<IconProps> {
  return KIND_ICONS[kind] ?? BookOpen;
}

export function kindPillClass(kind: ToolkitItemKind): string {
  return KIND_PILL_CLASS[kind] ?? 'tk-pill--playbook';
}

export function statusBadgeClass(status: ToolkitItemStatus): string {
  return STATUS_BADGE_CLASS[status] ?? 'tk-badge--pending';
}
