import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { DashboardListItemDto, SavedDashboardId, WorkspaceId } from '@shared/types';

import { RetireDashboardDialog } from './RetireDashboardDialog';

expect.extend(toHaveNoViolations);

const dashboard: DashboardListItemDto = {
  id: 'd1' as SavedDashboardId,
  workspaceId: 'ws-1' as WorkspaceId,
  slug: 'ai-default',
  name: 'AI default',
  audience: { kind: 'everyone' },
  isDefault: true,
  objectType: 'Request',
  widgetCount: 6,
  updatedAt: '2026-07-01T00:00:00Z',
};

it('RetireDashboardDialog — names the dashboard, confirms, and is accessible', async () => {
  // Arrange
  const onConfirm = jest.fn();
  const { container } = render(
    <RetireDashboardDialog
      dashboard={dashboard}
      onConfirm={onConfirm}
      onCancel={jest.fn()}
      isPending={false}
      error={null}
    />,
  );
  expect(await axe(container)).toHaveNoViolations();

  // Act
  await userEvent.click(screen.getByRole('button', { name: 'Retire AI default' }));

  // Assert
  expect(onConfirm).toHaveBeenCalled();
});
