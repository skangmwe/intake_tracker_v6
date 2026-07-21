import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { KanbanView } from './KanbanView';
import type { RecordViewItem } from './types';

const noop = () => undefined;

function buildItems(): RecordViewItem[] {
  return [
    { id: 'r1', title: 'Alpha', groupValue: 'Triage', onOpen: noop },
    { id: 'r2', title: 'Beta', groupValue: 'Execution', badges: [{ label: 'Overdue', tone: 'error' }], onOpen: noop },
    { id: 'r3', title: 'Gamma', onOpen: noop },
  ];
}

const ORDER = ['Triage', 'Execution', 'Done'];

describe('KanbanView', () => {
  it('KanbanView — groups items into the ordered columns', () => {
    // Arrange + Act
    render(<KanbanView items={buildItems()} groupOrder={ORDER} caption="Requests board" />);

    // Assert — a column per group value, with counts
    expect(screen.getByRole('region', { name: 'Triage (1)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Execution (1)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Done (0)' })).toBeInTheDocument();
  });

  it('KanbanView — an item without a group value lands in Unassigned', () => {
    // Arrange + Act
    render(<KanbanView items={buildItems()} groupOrder={ORDER} caption="Requests board" />);

    // Assert
    const unassigned = screen.getByRole('region', { name: 'Unassigned (1)' });
    expect(within(unassigned).getByText('Gamma')).toBeInTheDocument();
  });

  it('KanbanView — activating a card opens the record', async () => {
    // Arrange
    const onOpen = jest.fn();
    const items: RecordViewItem[] = [{ id: 'r1', title: 'Alpha', groupValue: 'Triage', onOpen }];
    const user = userEvent.setup();
    render(<KanbanView items={items} groupOrder={ORDER} caption="Requests board" />);

    // Act
    await user.click(screen.getByRole('button', { name: /Alpha/ }));

    // Assert
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('KanbanView — an empty column shows a no-records note', () => {
    // Arrange + Act
    render(<KanbanView items={buildItems()} groupOrder={ORDER} caption="Requests board" />);

    // Assert
    expect(screen.getByText('No records')).toBeInTheDocument();
  });

  it('KanbanView — no axe violations', async () => {
    const { container } = render(<KanbanView items={buildItems()} groupOrder={ORDER} caption="Requests board" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
