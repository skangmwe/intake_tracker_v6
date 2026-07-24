import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { formatDate } from '@/shared/utils/dateFormat';

import { AgendaView } from './AgendaView';
import type { RecordViewItem } from './types';

const noop = () => undefined;

function buildItems(): RecordViewItem[] {
  return [
    { id: 'r1', title: 'Alpha', subtitle: 'first', dateValue: '2026-07-01', onOpen: noop },
    { id: 'r2', title: 'Beta', dateValue: '2026-07-01', onOpen: noop },
    { id: 'r3', title: 'Gamma', dateValue: '2026-07-05', onOpen: noop },
  ];
}

describe('AgendaView', () => {
  it('AgendaView — groups records by day with a count', () => {
    // Arrange + Act
    render(<AgendaView items={buildItems()} caption="Requests agenda" />);

    // Assert — the Jul 1 group holds two records
    const group = screen.getByRole('region', { name: formatDate(new Date(2026, 6, 1)) });
    expect(within(group).getByText('Alpha')).toBeInTheDocument();
    expect(within(group).getByText('Beta')).toBeInTheDocument();
  });

  it('AgendaView — activating a row opens the record', async () => {
    // Arrange
    const onOpen = jest.fn();
    const user = userEvent.setup();
    render(
      <AgendaView items={[{ id: 'r1', title: 'Alpha', dateValue: '2026-07-01', onOpen }]} caption="Requests agenda" />,
    );

    // Act
    await user.click(screen.getByRole('button', { name: /Alpha/ }));

    // Assert
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('AgendaView — no axe violations', async () => {
    const { container } = render(<AgendaView items={buildItems()} caption="Requests agenda" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
