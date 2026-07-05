// Tests for the S5 slim mirror note. Pure render (no providers) — asserts the origin + mirror status
// surface and the em-dash fallback when the status is blank, each under jest-axe.

import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { BridgeBlock, WorkspaceId } from '@shared/types';

import { EscalatedIntakeNote } from './EscalatedIntakeNote';

expect.extend(toHaveNoViolations);

function bridge(overrides: Partial<BridgeBlock> = {}): BridgeBlock {
  return {
    isEscalated: true,
    originWorkspaceId: 'ws-pg' as WorkspaceId,
    originWorkspaceName: 'Litigation',
    aiWorkspaceId: 'ws-1' as WorkspaceId,
    escalatedAt: '2026-07-04T18:00:00Z',
    aiSolutionsStatus: 'Build',
    lockedFields: ['name'],
    ...overrides,
  };
}

describe('EscalatedIntakeNote', () => {
  it('EscalatedIntakeNote — surfaces the origin and the current mirror status', async () => {
    // Arrange / Act
    const { container } = render(<EscalatedIntakeNote bridge={bridge()} />);

    // Assert
    const note = screen.getByRole('complementary', { name: 'Escalation bridge' });
    expect(note).toHaveTextContent('Litigation');
    expect(note).toHaveTextContent('AI Solutions Status');
    expect(note).toHaveTextContent('Build');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('EscalatedIntakeNote — blank mirror status renders an em-dash', async () => {
    // Arrange / Act
    const { container } = render(<EscalatedIntakeNote bridge={bridge({ aiSolutionsStatus: '' })} />);

    // Assert
    expect(screen.getByRole('complementary', { name: 'Escalation bridge' })).toHaveTextContent('—');
    expect(await axe(container)).toHaveNoViolations();
  });
});
