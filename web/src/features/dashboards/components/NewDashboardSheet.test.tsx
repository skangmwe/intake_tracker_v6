// Tests for the New-dashboard side sheet (slice 28): dialog a11y, name-required validation, the
// create payload, and Escape-to-close.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import { NewDashboardSheet } from './NewDashboardSheet';

expect.extend(toHaveNoViolations);

function setup(overrides: Partial<Parameters<typeof NewDashboardSheet>[0]> = {}) {
  const onCreate = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <NewDashboardSheet onCreate={onCreate} onClose={onClose} isPending={false} {...overrides} />,
  );
  return { onCreate, onClose, ...utils };
}

it('NewDashboardSheet — renders the dialog accessibly', async () => {
  // Act
  const { container } = setup();

  // Assert
  expect(screen.getByRole('dialog', { name: 'New dashboard' })).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('NewDashboardSheet — submit with no name — shows an error and does not create', async () => {
  // Arrange
  const { onCreate } = setup();

  // Act
  await userEvent.click(screen.getByRole('button', { name: 'Create dashboard' }));

  // Assert
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');
  expect(onCreate).not.toHaveBeenCalled();
});

it('NewDashboardSheet — name + Personal — creates with the composed request', async () => {
  // Arrange
  const { onCreate } = setup();

  // Act
  await userEvent.type(screen.getByLabelText('Name'), 'Tax delivery');
  await userEvent.click(screen.getByRole('button', { name: 'Personal' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create dashboard' }));

  // Assert
  expect(onCreate).toHaveBeenCalledWith({
    name: 'Tax delivery',
    visibility: 'Personal',
    objectType: 'Request',
  });
});

it('NewDashboardSheet — Escape — closes', async () => {
  // Arrange
  const { onClose } = setup();

  // Act
  await userEvent.keyboard('{Escape}');

  // Assert
  expect(onClose).toHaveBeenCalled();
});
