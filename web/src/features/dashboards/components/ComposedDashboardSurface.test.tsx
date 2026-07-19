// Tests for the composed-dashboard canvas (slice 28): widget rendering, the empty canvas, edit-mode
// controls, opening the composer, and a11y. The api boundary is mocked (no widget mutation is fired —
// these assert the canvas + composer wiring, not the network round-trip).

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type {
  DashboardWidgetDto,
  SavedDashboardDto,
  SavedDashboardId,
  WorkspaceId,
} from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import type { ComposerScopeOptions } from '../useComposerScopeOptions';
import { ComposedDashboardSurface } from './ComposedDashboardSurface';

expect.extend(toHaveNoViolations);
jest.mock('../api');

const WS = 'ws-1' as WorkspaceId;

const SCOPE: ComposerScopeOptions = {
  deptOptions: ['Dept'],
  stageOptions: [{ key: 'build', label: 'Build' }],
  stageLabels: { build: 'Build' },
  isLoading: false,
};

function kpiWidget(id = 'w1', title = 'Open requests'): DashboardWidgetDto {
  return {
    id,
    type: 'kpi-tile',
    title,
    config: { composedMetric: 'count', width: 'Half', sortOrder: 0, depts: [], stages: [] },
    data: { value: 3, caption: null, breakdown: null },
  };
}

function composed(widgets: DashboardWidgetDto[]): SavedDashboardDto {
  return {
    id: 'd1' as SavedDashboardId,
    workspaceId: WS,
    slug: null,
    name: 'My triage',
    audience: { kind: 'everyone' },
    isDefault: false,
    objectType: 'Request',
    supportsDrillThrough: false,
    widgets,
    isSeeded: false,
    visibility: 'Personal',
    layoutMode: 'Composed',
  };
}

it('ComposedDashboardSurface — renders composed widgets', () => {
  // Act
  renderWithProviders(
    <ComposedDashboardSurface
      dashboard={composed([kpiWidget()])}
      workspaceId={WS}
      editing={false}
      scope={SCOPE}
    />,
  );

  // Assert
  expect(screen.getByText('Open requests')).toBeInTheDocument();
  expect(screen.getByText('3')).toBeInTheDocument();
});

it('ComposedDashboardSurface — empty canvas — offers the first widget', () => {
  // Act
  renderWithProviders(
    <ComposedDashboardSurface dashboard={composed([])} workspaceId={WS} editing scope={SCOPE} />,
  );

  // Assert
  expect(screen.getByText('This dashboard has no widgets yet.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Add your first widget/ })).toBeInTheDocument();
});

it('ComposedDashboardSurface — editing — shows reorder / edit / remove controls per widget', () => {
  // Act
  renderWithProviders(
    <ComposedDashboardSurface
      dashboard={composed([kpiWidget(), kpiWidget('w2', 'Second')])}
      workspaceId={WS}
      editing
      scope={SCOPE}
    />,
  );

  // Assert
  expect(screen.getAllByRole('button', { name: 'Edit widget' })).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Remove widget' })).toHaveLength(2);
  // First widget can't move up; last can't move down.
  expect(screen.getAllByRole('button', { name: 'Move widget up' })[0]).toBeDisabled();
  const downButtons = screen.getAllByRole('button', { name: 'Move widget down' });
  expect(downButtons[downButtons.length - 1]).toBeDisabled();
});

it('ComposedDashboardSurface — Add widget — opens the composer sheet', async () => {
  // Arrange
  renderWithProviders(
    <ComposedDashboardSurface
      dashboard={composed([kpiWidget()])}
      workspaceId={WS}
      editing
      scope={SCOPE}
    />,
  );

  // Act
  await userEvent.click(screen.getByRole('button', { name: /Add widget/ }));

  // Assert
  expect(screen.getByRole('dialog', { name: 'Add widget' })).toBeInTheDocument();
});

it('ComposedDashboardSurface — accessible in editing state', async () => {
  // Act
  const { container } = renderWithProviders(
    <ComposedDashboardSurface
      dashboard={composed([kpiWidget()])}
      workspaceId={WS}
      editing
      scope={SCOPE}
    />,
  );

  // Assert
  expect(await axe(container)).toHaveNoViolations();
});
