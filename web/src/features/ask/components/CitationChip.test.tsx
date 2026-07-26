// Behaviour + a11y tests for the inline citation chip.

import { screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { renderWithProviders } from '@/test-utils';

import { CitationChip } from './CitationChip';

describe('CitationChip', () => {
  it('CitationChip — a cited record — links to the record with an accessible name', async () => {
    // Arrange / Act
    const { container } = renderWithProviders(
      <CitationChip marker={2} recordId="LIT-9004" title="Retention helper" />,
    );

    // Assert
    const link = screen.getByRole('link', { name: /source 2: retention helper/i });
    expect(link).toHaveAttribute('href', '/requests/LIT-9004');
    expect(await axe(container)).toHaveNoViolations();
  });
});
