// Behaviour + a11y tests for the cited-source list.

import { screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { renderWithProviders } from '@/test-utils';

import { SourceList } from './SourceList';

const CITATIONS = [
  { marker: 1, recordId: 'LIT-9004', title: 'Retention helper' },
  { marker: 2, recordId: 'LIT-9010', title: 'Clause finder' },
];

describe('SourceList', () => {
  it('SourceList — with citations — lists each cited record as a link, no violations', async () => {
    // Arrange / Act
    const { container } = renderWithProviders(<SourceList citations={CITATIONS} />);

    // Assert
    expect(screen.getByRole('link', { name: /retention helper/i })).toHaveAttribute('href', '/requests/LIT-9004');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SourceList — no citations — renders nothing', () => {
    // Arrange / Act
    const { container } = renderWithProviders(<SourceList citations={[]} />);

    // Assert
    expect(container).toBeEmptyDOMElement();
  });
});
