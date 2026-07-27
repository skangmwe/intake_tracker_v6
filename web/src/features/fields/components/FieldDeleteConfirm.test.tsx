import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { FieldDeleteConfirm } from './FieldDeleteConfirm';

function renderConfirm(overrides: Partial<React.ComponentProps<typeof FieldDeleteConfirm>> = {}) {
  const props: React.ComponentProps<typeof FieldDeleteConfirm> = {
    fieldLabel: 'Priority',
    isDeleting: false,
    onCancel: jest.fn(),
    onConfirm: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<FieldDeleteConfirm {...props} />) };
}

describe('FieldDeleteConfirm', () => {
  it('FieldDeleteConfirm — renders as an alertdialog naming the field', () => {
    // Arrange / Act
    renderConfirm({ fieldLabel: 'Priority' });

    // Assert
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent('Delete “Priority”?');
    expect(confirm).toHaveTextContent(/removed from every workspace/i);
  });

  it('FieldDeleteConfirm — Cancel calls onCancel', async () => {
    // Arrange
    const onCancel = jest.fn();
    const user = userEvent.setup();
    renderConfirm({ onCancel });

    // Act
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assert
    expect(onCancel).toHaveBeenCalled();
  });

  it('FieldDeleteConfirm — confirming calls onConfirm', async () => {
    // Arrange
    const onConfirm = jest.fn();
    const user = userEvent.setup();
    renderConfirm({ onConfirm });

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete field' }));

    // Assert
    expect(onConfirm).toHaveBeenCalled();
  });

  it('FieldDeleteConfirm — isDeleting — disables both actions and shows the pending label', () => {
    // Arrange / Act
    renderConfirm({ isDeleting: true });

    // Assert
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  });

  it('FieldDeleteConfirm — no axe violations', async () => {
    // Arrange
    const { container } = renderConfirm();

    // Act
    const results = await axe(container);

    // Assert
    expect(results).toHaveNoViolations();
  });
});
