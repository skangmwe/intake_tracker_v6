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

  it('ViewModeToggle — always renders in canonical order regardless of the available order', () => {
    // Arrange — pass the kinds out of order; the toggle should still render list → board → gallery.
    render(
      <ViewModeToggle
        available={['gallery', 'kanban', 'table']}
        active="table"
        onChange={jest.fn()}
        label="Requests layout"
      />,
    );

    // Act
    const labels = screen.getAllByRole('button').map((button) => button.textContent);

    // Assert — canonical order: table (Board excluded? no) → Board → Gallery
    expect(labels).toEqual(['Table', 'Board', 'Gallery']);
  });

  it('ViewModeToggle — iconOnly keeps the accessible name and adds a tooltip', () => {
    // Arrange + Act
    render(
      <ViewModeToggle available={AVAILABLE} active="table" onChange={jest.fn()} label="Requests layout" iconOnly />,
    );

    // Assert — the label text is still the accessible name (visually hidden), and a title tooltip exists.
    const boardButton = screen.getByRole('button', { name: 'Board' });
    expect(boardButton).toHaveAttribute('title', 'Board');
    expect(screen.getByRole('group', { name: 'Requests layout' })).toHaveClass('rv-toggle--icon-only');
  });

  it('ViewModeToggle — iconOnly has no axe violations', async () => {
    const { container } = render(
      <ViewModeToggle available={AVAILABLE} active="kanban" onChange={jest.fn()} label="Requests layout" iconOnly />,
    );
    expect(await axe(container)).toHaveNoViolations();
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
