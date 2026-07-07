import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import { DashPinButton } from './DashPinButton';

expect.extend(toHaveNoViolations);

it('DashPinButton — toggles the pressed state and label, and is accessible', async () => {
  // Arrange
  const { container } = render(<DashPinButton />);
  const button = screen.getByRole('button', { name: 'Set as default landing surface' });

  // Assert — starts unpinned.
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await axe(container)).toHaveNoViolations();

  // Act
  await userEvent.click(button);

  // Assert — toggles pressed + label.
  expect(
    screen.getByRole('button', { name: 'This dashboard is your default landing surface' }),
  ).toHaveAttribute('aria-pressed', 'true');
});
