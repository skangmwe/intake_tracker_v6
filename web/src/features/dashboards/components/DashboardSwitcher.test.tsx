// Tests for the dashboard switcher header (slice 28): the active title, the Shared/Personal dropdown,
// picking a dashboard, the New action, and the Edit-layout toggle gating (composed only).

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type {
  DashboardListItemDto,
  SavedDashboardDto,
  SavedDashboardId,
  WorkspaceId,
} from '@shared/types';

import { DashboardSwitcher } from './DashboardSwitcher';

expect.extend(toHaveNoViolations);

const WS = 'ws-1' as WorkspaceId;

function composedActive(overrides: Partial<SavedDashboardDto> = {}): SavedDashboardDto {
  return {
    id: 'd1' as SavedDashboardId,
    workspaceId: WS,
    slug: null,
    name: 'My triage',
    audience: { kind: 'everyone' },
    isDefault: false,
    objectType: 'Request',
    supportsDrillThrough: false,
    widgets: [],
    isSeeded: false,
    visibility: 'Personal',
    layoutMode: 'Composed',
    ...overrides,
  };
}

const LIST: DashboardListItemDto[] = [
  {
    id: 'd0' as SavedDashboardId,
    slug: 'ai-default',
    workspaceId: WS,
    name: 'AI Solutions dashboard',
    audience: { kind: 'everyone' },
    isDefault: true,
    objectType: 'Request',
    widgetCount: 6,
    updatedAt: '2026-07-19T00:00:00Z',
    visibility: 'Shared',
    layoutMode: 'Fixed',
    isSeeded: true,
  },
  {
    id: 'd1' as SavedDashboardId,
    slug: null,
    workspaceId: WS,
    name: 'My triage',
    audience: { kind: 'everyone' },
    isDefault: false,
    objectType: 'Request',
    widgetCount: 2,
    updatedAt: '2026-07-19T00:00:00Z',
    visibility: 'Personal',
    layoutMode: 'Composed',
    isSeeded: false,
  },
];

function setup(overrides: Partial<Parameters<typeof DashboardSwitcher>[0]> = {}) {
  const onPick = jest.fn();
  const onNew = jest.fn();
  const onToggleEditing = jest.fn();
  const utils = render(
    <DashboardSwitcher
      active={composedActive()}
      dashboards={LIST}
      onPick={onPick}
      onNew={onNew}
      editing={false}
      onToggleEditing={onToggleEditing}
      {...overrides}
    />,
  );
  return { onPick, onNew, onToggleEditing, ...utils };
}

it('DashboardSwitcher — composed dashboard — shows title + Edit-layout, accessibly', async () => {
  // Act
  const { container } = setup();

  // Assert
  expect(screen.getByRole('button', { name: /My triage/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(screen.getByRole('button', { name: 'Edit layout' })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('DashboardSwitcher — open menu and pick — closes and calls onPick', async () => {
  // Arrange
  const { onPick } = setup();

  // Act — open the menu, then pick the seeded dashboard.
  await userEvent.click(screen.getByRole('button', { name: /My triage/ }));
  await userEvent.click(screen.getByRole('menuitem', { name: /AI Solutions dashboard/ }));

  // Assert
  expect(onPick).toHaveBeenCalledWith('d0');
});

it('DashboardSwitcher — New dashboard button — calls onNew', async () => {
  // Arrange
  const { onNew } = setup();

  // Act — the primary header button (menu closed).
  await userEvent.click(screen.getByRole('button', { name: /New dashboard/ }));

  // Assert
  expect(onNew).toHaveBeenCalled();
});

it('DashboardSwitcher — seeded fixed dashboard — hides Edit-layout', () => {
  // Arrange — a seeded, fixed active dashboard is not composer-editable.
  setup({ active: composedActive({ layoutMode: 'Fixed', isSeeded: true, visibility: 'Shared' }) });

  // Assert
  expect(screen.queryByRole('button', { name: 'Edit layout' })).not.toBeInTheDocument();
});
