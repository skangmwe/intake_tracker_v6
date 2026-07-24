// RecordRowActions — the portaled kebab: closed by default, opens to View / Edit / Delete, each
// action fires its callback and closes. Both the resting and open states pass an axe check.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { RecordRowActions } from './RecordRowActions';

function renderMenu(overrides: Partial<React.ComponentProps<typeof RecordRowActions>> = {}) {
  const props: React.ComponentProps<typeof RecordRowActions> = {
    recordLabel: 'Acme',
    onView: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<RecordRowActions {...props} />) };
}

describe('RecordRowActions', () => {
  it('RecordRowActions — resting — shows only the labelled trigger', () => {
    // Arrange / Act
    renderMenu();

    // Assert
    expect(screen.getByRole('button', { name: 'Actions for Acme' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('RecordRowActions — trigger click — opens the View/Edit/Delete menu', async () => {
    // Arrange
    const user = userEvent.setup();
    renderMenu();

    // Act
    await user.click(screen.getByRole('button', { name: 'Actions for Acme' }));

    // Assert
    expect(screen.getByRole('menu', { name: 'Actions for Acme' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });

  it('RecordRowActions — View — fires onView and closes', async () => {
    // Arrange
    const onView = jest.fn();
    const user = userEvent.setup();
    renderMenu({ onView });

    // Act
    await user.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    await user.click(screen.getByRole('menuitem', { name: 'View' }));

    // Assert
    expect(onView).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('RecordRowActions — Delete — fires onDelete', async () => {
    // Arrange
    const onDelete = jest.fn();
    const user = userEvent.setup();
    renderMenu({ onDelete });

    // Act
    await user.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    // Assert
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('RecordRowActions — resting and open — no accessibility violations', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = renderMenu();

    // Act / Assert — resting
    expect(await axe(container)).toHaveNoViolations();

    // Act / Assert — open. Axe the portaled menu subtree with the page-level `region` (landmark)
    // best-practice disabled: an isolated portaled popover legitimately isn't inside a landmark.
    await user.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    const results = await axe(screen.getByRole('menu'), { rules: { region: { enabled: false } } });
    expect(results).toHaveNoViolations();
  });
});
