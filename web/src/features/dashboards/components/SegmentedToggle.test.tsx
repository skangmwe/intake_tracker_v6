// Tests for the composer's segmented toggle (slice 28): selected state via aria-pressed + click.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import { SegmentedToggle } from './SegmentedToggle';

expect.extend(toHaveNoViolations);

const OPTIONS = [
  { value: 'Shared', label: 'Shared' },
  { value: 'Personal', label: 'Personal' },
] as const;

it('SegmentedToggle — marks the selected option pressed, accessibly', async () => {
  // Act
  const { container } = render(
    <SegmentedToggle label="Visibility" value="Shared" options={OPTIONS} onChange={() => {}} />,
  );

  // Assert
  expect(screen.getByRole('button', { name: 'Shared' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Personal' })).toHaveAttribute('aria-pressed', 'false');
  expect(await axe(container)).toHaveNoViolations();
});

it('SegmentedToggle — click — calls onChange with the option value', async () => {
  // Arrange
  const onChange = jest.fn();
  render(
    <SegmentedToggle label="Visibility" value="Shared" options={OPTIONS} onChange={onChange} />,
  );

  // Act
  await userEvent.click(screen.getByRole('button', { name: 'Personal' }));

  // Assert
  expect(onChange).toHaveBeenCalledWith('Personal');
});
