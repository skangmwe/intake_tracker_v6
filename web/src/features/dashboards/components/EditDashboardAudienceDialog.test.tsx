import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { DashboardListItemDto, SavedDashboardId, WorkspaceId } from '@shared/types';

import { EditDashboardAudienceDialog } from './EditDashboardAudienceDialog';

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

it('EditDashboardAudienceDialog — role-scoped — reveals the role-labels field and saves it, accessibly', async () => {
  // Arrange
  const onSave = jest.fn();
  const { container } = render(
    <EditDashboardAudienceDialog
      dashboard={dashboard}
      onSave={onSave}
      onCancel={jest.fn()}
      isPending={false}
      error={null}
    />,
  );
  expect(await axe(container)).toHaveNoViolations();

  // Act — switch to role-scoped and enter labels.
  await userEvent.selectOptions(screen.getByLabelText('Audience'), 'role-scoped');
  await userEvent.type(screen.getByLabelText('Role labels'), 'Analyst, Reviewer');
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  // Assert
  expect(onSave).toHaveBeenCalledWith({
    name: 'AI default',
    audience: { kind: 'role-scoped', roleLabels: ['Analyst', 'Reviewer'] },
  });
});

it('EditDashboardAudienceDialog — cancel — invokes onCancel', async () => {
  // Arrange
  const onCancel = jest.fn();
  render(
    <EditDashboardAudienceDialog
      dashboard={dashboard}
      onSave={jest.fn()}
      onCancel={onCancel}
      isPending={false}
      error={null}
    />,
  );

  // Act
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  // Assert
  expect(onCancel).toHaveBeenCalled();
});
