// Tests for HomePanel — the shared card shell renders its meta + children when populated, and the
// empty note when isEmpty. jest-axe on both states.

import { screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { renderWithProviders } from '@/test-utils';

import { HomePanel } from './HomePanel';

expect.extend(toHaveNoViolations);

it('HomePanel — populated — renders title, meta and children', async () => {
  // Act
  const { container } = renderWithProviders(
    <HomePanel title="Needs your decision" meta="2 open" isEmpty={false} emptyLabel="nothing">
      <p>a child</p>
    </HomePanel>,
  );

  // Assert
  expect(screen.getByRole('heading', { level: 2, name: 'Needs your decision' })).toBeInTheDocument();
  expect(screen.getByText('2 open')).toBeInTheDocument();
  expect(screen.getByText('a child')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('HomePanel — empty — renders the empty note instead of children', async () => {
  // Act
  const { container } = renderWithProviders(
    <HomePanel title="Your work today" isEmpty emptyLabel="Nothing assigned today.">
      <p>should not show</p>
    </HomePanel>,
  );

  // Assert
  expect(screen.getByText('Nothing assigned today.')).toBeInTheDocument();
  expect(screen.queryByText('should not show')).not.toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});
