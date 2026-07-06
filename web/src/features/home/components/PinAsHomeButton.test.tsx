// Tests for PinAsHomeButton — the static pressed indicator (Home is the default landing surface). It
// exposes an accessible name and aria-pressed; no navigation or persistence is invoked. axe clean.

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { PinAsHomeButton } from './PinAsHomeButton';

expect.extend(toHaveNoViolations);

it('PinAsHomeButton — renders a pressed, labelled indicator button', async () => {
  // Act
  const { container } = render(<PinAsHomeButton />);

  // Assert
  const button = screen.getByRole('button', { name: /default landing surface/i });
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await axe(container)).toHaveNoViolations();
});
