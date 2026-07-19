// Unit tests for the Toolkit list — renders rows through the shared TableShell, opens on row click,
// and passes axe. The TableShell primitive renders a real semantic table.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ToolkitItemId, ToolkitItemListRow, UserId } from '@shared/types';

import { ToolkitList } from './ToolkitList';

function row(overrides: Partial<ToolkitItemListRow> = {}): ToolkitItemListRow {
  return {
    id: 'AIS-00000073' as ToolkitItemId,
    kind: 'Playbook',
    status: 'Active',
    name: 'Litigation intake playbook',
    oneLiner: 'Run a new matter through intake',
    maintainer: 'Grace Lin',
    hasAttachment: false,
    lastModifiedAt: '2026-07-02T10:00:00Z',
    lastModifiedBy: 'Grace Lin' as UserId,
    eTag: 'etag==',
    ...overrides,
  };
}

const noFilter = () => null;

describe('ToolkitList', () => {
  it('ToolkitList — rows provided — renders each item name and its record id', () => {
    // Arrange + Act
    render(<ToolkitList rows={[row()]} sort={undefined} onSortChange={jest.fn()} renderFilter={noFilter} onOpen={jest.fn()} />);

    // Assert
    expect(screen.getByText('Litigation intake playbook')).toBeInTheDocument();
    expect(screen.getByText('AIS-00000073')).toBeInTheDocument();
  });

  it('ToolkitList — row click — opens the item', async () => {
    // Arrange
    const onOpen = jest.fn();
    render(<ToolkitList rows={[row()]} sort={undefined} onSortChange={jest.fn()} renderFilter={noFilter} onOpen={onOpen} />);

    // Act
    await userEvent.click(screen.getByText('Litigation intake playbook'));

    // Assert
    expect(onOpen).toHaveBeenCalledWith('AIS-00000073');
  });

  it('ToolkitList — no axe violations', async () => {
    // Arrange
    const { container } = render(
      <ToolkitList rows={[row()]} sort={{ column: 'name', direction: 'asc' }} onSortChange={jest.fn()} renderFilter={noFilter} onOpen={jest.fn()} />,
    );

    // Act + Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});
