import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ViewModeToggle } from './ViewModeToggle';
import type { RecordViewKind } from './types';

const AVAILABLE: RecordViewKind[] = ['table', 'kanban', 'timeline', 'agenda'];

describe('ViewModeToggle', () => {
  it('ViewModeToggle — renders a segment per available kind with the active one pressed', () => {
    // Arrange + Act
    render(<ViewModeToggle available={AVAILABLE} active="kanban" onChange={jest.fn()} label="Requests layout" />);

    // Assert
    expect(screen.getByRole('group', { name: 'Requests layout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Board/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Table/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('ViewModeToggle — clicking a segment reports the new kind', async () => {
    // Arrange
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<ViewModeToggle available={AVAILABLE} active="table" onChange={onChange} label="Requests layout" />);

    // Act
    await user.click(screen.getByRole('button', { name: /Timeline/ }));

    // Assert
    expect(onChange).toHaveBeenCalledWith('timeline');
  });

  it('ViewModeToggle — fewer than two kinds renders nothing', () => {
    // Arrange + Act
    const { container } = render(
      <ViewModeToggle available={['table']} active="table" onChange={jest.fn()} label="Requests layout" />,
    );

    // Assert
    expect(container).toBeEmptyDOMElement();
  });

  it('ViewModeToggle — no axe violations', async () => {
    const { container } = render(
      <ViewModeToggle available={AVAILABLE} active="kanban" onChange={jest.fn()} label="Requests layout" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
