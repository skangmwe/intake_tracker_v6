import { screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';

import { buildMe, buildMembership, renderWithProviders } from '@/test-utils';

import { HomePage } from './HomePage';

const membership = buildMembership();

describe('HomePage', () => {
  it('HomePage — memberships present — lists them', () => {
    renderWithProviders(<HomePage />, { seedMe: buildMe({ memberships: [membership] }) });
    expect(screen.getByText('AI Solutions')).toBeInTheDocument();
  });

  it('HomePage — no memberships — shows the empty note', () => {
    renderWithProviders(<HomePage />, { seedMe: buildMe({ memberships: [] }) });
    expect(screen.getByText(/not a member of any workspace/i)).toBeInTheDocument();
  });

  it('HomePage — loading — shows a status message', () => {
    // Arrange — a pending fetch keeps the query loading.
    globalThis.fetch = jest.fn().mockReturnValue(new Promise(() => undefined)) as unknown as typeof fetch;

    // Act
    renderWithProviders(<HomePage />);

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Loading your workspaces…');
  });

  it('HomePage — fetch error — shows an alert', async () => {
    // Arrange
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;

    // Act
    renderWithProviders(<HomePage />);

    // Assert
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('HomePage — no axe violations', async () => {
    const { container } = renderWithProviders(<HomePage />, {
      seedMe: buildMe({ memberships: [membership] }),
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
