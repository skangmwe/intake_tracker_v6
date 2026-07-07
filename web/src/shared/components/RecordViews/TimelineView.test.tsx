import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { TimelineView } from './TimelineView';
import type { RecordViewItem } from './types';

const noop = () => undefined;

function buildItems(): RecordViewItem[] {
  return [
    { id: 'r1', title: 'Alpha', dateValue: '2026-07-10', onOpen: noop },
    { id: 'r2', title: 'Beta', dateValue: '2026-07-01', onOpen: noop },
    { id: 'r3', title: 'Gamma', onOpen: noop },
  ];
}

describe('TimelineView', () => {
  it('TimelineView — renders day nodes in chronological order', () => {
    // Arrange + Act
    render(<TimelineView items={buildItems()} caption="Requests timeline" />);

    // Assert — the earliest date appears before the later date in the DOM
    const first = screen.getByText('1 Jul 2026');
    const second = screen.getByText('10 Jul 2026');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('TimelineView — a dateless record shows under a No date node', () => {
    // Arrange + Act
    render(<TimelineView items={buildItems()} caption="Requests timeline" />);

    // Assert
    expect(screen.getByText('No date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gamma/ })).toBeInTheDocument();
  });

  it('TimelineView — activating an entry opens the record', async () => {
    // Arrange
    const onOpen = jest.fn();
    const user = userEvent.setup();
    render(
      <TimelineView items={[{ id: 'r1', title: 'Alpha', dateValue: '2026-07-10', onOpen }]} caption="Requests timeline" />,
    );

    // Act
    await user.click(screen.getByRole('button', { name: /Alpha/ }));

    // Assert
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('TimelineView — no axe violations', async () => {
    const { container } = render(<TimelineView items={buildItems()} caption="Requests timeline" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
