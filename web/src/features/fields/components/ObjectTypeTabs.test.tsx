import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ObjectTypeTabs } from './ObjectTypeTabs';

describe('ObjectTypeTabs', () => {
  it('ObjectTypeTabs — renders a tab per object type with the active one selected', () => {
    render(<ObjectTypeTabs active="Request" onChange={jest.fn()} />);
    expect(screen.getByRole('tab', { name: 'Request' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Task' })).toHaveAttribute('aria-selected', 'false');
  });

  it('ObjectTypeTabs — clicking a tab — calls onChange', async () => {
    // Arrange
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<ObjectTypeTabs active="Request" onChange={onChange} />);

    // Act
    await user.click(screen.getByRole('tab', { name: 'Task' }));

    // Assert
    expect(onChange).toHaveBeenCalledWith('Task');
  });

  it('ObjectTypeTabs — arrow-right — moves to the next tab', async () => {
    // Arrange
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<ObjectTypeTabs active="Request" onChange={onChange} />);

    // Act
    screen.getByRole('tab', { name: 'Request' }).focus();
    await user.keyboard('{ArrowRight}');

    // Assert
    expect(onChange).toHaveBeenCalledWith('Task');
  });

  it('ObjectTypeTabs — no axe violations', async () => {
    const { container } = render(<ObjectTypeTabs active="Task" onChange={jest.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
