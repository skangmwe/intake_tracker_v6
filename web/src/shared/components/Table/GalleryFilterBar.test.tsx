import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { GalleryFilterBar, type GalleryFilterFacet } from './GalleryFilterBar';

const FACETS: GalleryFilterFacet[] = [
  { key: 'stage', label: 'Stage', control: <button type="button">stage funnel</button> },
  { key: 'owner', label: 'Owner', control: <button type="button">owner funnel</button> },
];

describe('GalleryFilterBar', () => {
  it('GalleryFilterBar — search provided — renders the box, shows its value, fires onChange', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();

    // Act
    render(
      <GalleryFilterBar
        facets={FACETS}
        search={{ value: 'pdf', onChange, label: 'Search features by name', placeholder: 'Search by name' }}
      />,
    );
    const input = screen.getByRole('searchbox', { name: 'Search features by name' });
    await user.type(input, 'x');

    // Assert
    expect(input).toHaveValue('pdf');
    expect(onChange).toHaveBeenCalledWith('pdfx');
  });

  it('GalleryFilterBar — no search prop — omits the search box', () => {
    // Arrange + Act
    render(<GalleryFilterBar facets={FACETS} />);

    // Assert
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('GalleryFilterBar — renders a labeled control per facet', () => {
    // Arrange + Act
    render(<GalleryFilterBar facets={FACETS} ariaLabel="Filter features" />);

    // Assert
    expect(screen.getByRole('group', { name: 'Filter features' })).toBeInTheDocument();
    expect(screen.getByText('Stage')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'stage funnel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'owner funnel' })).toBeInTheDocument();
  });

  it('GalleryFilterBar — empty facets and no search — renders an empty group', () => {
    // Arrange + Act
    render(<GalleryFilterBar facets={[]} ariaLabel="Filters" />);

    // Assert
    const group = screen.getByRole('group', { name: 'Filters' });
    expect(group).toBeEmptyDOMElement();
  });

  it('GalleryFilterBar — search + facets — no axe violations', async () => {
    // Arrange + Act
    const { container } = render(
      <GalleryFilterBar
        facets={FACETS}
        ariaLabel="Filter features"
        search={{ value: '', onChange: jest.fn(), label: 'Search features by name' }}
      />,
    );

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });

  it('GalleryFilterBar — facets only (no search) — no axe violations', async () => {
    // Arrange + Act
    const { container } = render(<GalleryFilterBar facets={FACETS} ariaLabel="Filter toolkit" />);

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});
