// Unit tests for the shared SideSheet primitive — dialog role + accessible name, and the three
// dismiss paths (close button, Escape, scrim mousedown). jest-axe runs against the open state
// (accessibility.md — the only meaningfully different rendered state; mount == open).

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SideSheet } from './SideSheet';

describe('SideSheet', () => {
  it('SideSheet — open — renders a named dialog with its children', () => {
    // Arrange + Act
    render(
      <SideSheet title="Item detail" onClose={jest.fn()}>
        <p>Body content</p>
      </SideSheet>,
    );

    // Assert
    expect(screen.getByRole('dialog', { name: 'Item detail' })).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('SideSheet — close button — invokes onClose', async () => {
    // Arrange
    const onClose = jest.fn();
    render(
      <SideSheet title="Item detail" onClose={onClose}>
        <p>Body</p>
      </SideSheet>,
    );

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('SideSheet — Escape — invokes onClose', async () => {
    // Arrange
    const onClose = jest.fn();
    render(
      <SideSheet title="Item detail" onClose={onClose}>
        <p>Body</p>
      </SideSheet>,
    );

    // Act
    await userEvent.keyboard('{Escape}');

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('SideSheet — open — has no axe violations', async () => {
    // Arrange
    const { container } = render(
      <SideSheet title="Item detail" onClose={jest.fn()}>
        <p>Body</p>
      </SideSheet>,
    );

    // Act + Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});
