import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ViewBar, type ActiveFilterPill } from './ViewBar';

describe('ViewBar', () => {
  it('ViewBar — renders provided slots', () => {
    render(
      <ViewBar
        viewPicker={<span>picker</span>}
        exportSlot={<button type="button">Export</button>}
        primaryAction={<button type="button">Create request</button>}
      />,
    );
    expect(screen.getByText('picker')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create request' })).toBeInTheDocument();
  });

  it('ViewBar — hides filter pills and Clear all when no filters are active', () => {
    render(<ViewBar />);
    expect(screen.queryByLabelText('Active filters')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
  });

  it('ViewBar — renders a removable pill per active filter', async () => {
    // Arrange
    const user = userEvent.setup();
    const onRemove = jest.fn();
    const filters: ActiveFilterPill[] = [{ id: 'stage', label: 'Stage: Build', onRemove }];

    // Act
    render(<ViewBar filters={filters} onClearAll={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Remove filter Stage: Build' }));

    // Assert
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('ViewBar — Clear all fires its callback when filters are active', async () => {
    const user = userEvent.setup();
    const onClearAll = jest.fn();
    const filters: ActiveFilterPill[] = [{ id: 'stage', label: 'Stage: Build', onRemove: jest.fn() }];

    render(<ViewBar filters={filters} onClearAll={onClearAll} />);
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('ViewBar — no axe violations', async () => {
    const filters: ActiveFilterPill[] = [{ id: 'stage', label: 'Stage: Build', onRemove: jest.fn() }];
    const { container } = render(
      <ViewBar filters={filters} onClearAll={jest.fn()} primaryAction={<button type="button">Create</button>} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
