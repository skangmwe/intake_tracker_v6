// Tests for the shared Modal primitive. Covers render (role/label/body/footer), Escape + scrim-click
// close, click-inside does not close, and the focus trap wrapping Tab / Shift+Tab — under jest-axe.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import { Modal } from './Modal';

expect.extend(toHaveNoViolations);

function renderModal(onClose = jest.fn()) {
  const view = render(
    <Modal
      title="Do the thing?"
      onClose={onClose}
      footer={
        <>
          <button type="button">Cancel</button>
          <button type="button">Confirm</button>
        </>
      }
    >
      <p>Body copy.</p>
    </Modal>,
  );
  return { ...view, onClose };
}

describe('Modal', () => {
  it('Modal — renders a labelled dialog with body and footer', async () => {
    // Arrange / Act
    const { container } = renderModal();

    // Assert
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-ds', 'modal');
    expect(screen.getByRole('heading', { name: 'Do the thing?' })).toBeInTheDocument();
    expect(screen.getByText('Body copy.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Modal — Escape closes', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onClose } = renderModal();

    // Act
    await user.keyboard('{Escape}');

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Modal — clicking the scrim closes, clicking inside does not', async () => {
    // Arrange
    const user = userEvent.setup();
    const { onClose } = renderModal();

    // Act — click inside the dialog first (no close), then the scrim (close).
    await user.click(screen.getByText('Body copy.'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(document.querySelector('.mws-modal-scrim') as HTMLElement);

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Modal — traps focus: Tab wraps last→first and Shift+Tab first→last', async () => {
    // Arrange
    const user = userEvent.setup();
    renderModal();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Confirm' });

    // Act + Assert
    confirm.focus();
    await user.tab();
    expect(cancel).toHaveFocus();

    cancel.focus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });
});
