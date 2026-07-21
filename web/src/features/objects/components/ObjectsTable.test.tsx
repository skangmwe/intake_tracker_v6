// ObjectsTable — renders the object rows on the shared list-surface, exposes a keyboard-accessible
// per-row View trigger, and passes an axe check.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildObjectDefinition } from '@/test-utils';

import { ObjectsTable } from './ObjectsTable';

function renderTable(overrides: Partial<React.ComponentProps<typeof ObjectsTable>> = {}) {
  const props: React.ComponentProps<typeof ObjectsTable> = {
    rows: [
      buildObjectDefinition({
        id: 'o-request',
        name: 'Request',
        pluralLabel: 'Requests',
        location: 'Global',
        recordsCount: 128,
        fieldsCount: 7,
        isSystem: true,
      }),
      buildObjectDefinition({
        id: 'o-vendor',
        name: 'Vendor',
        pluralLabel: null,
        description: null,
      }),
    ],
    sort: undefined,
    onSortChange: jest.fn(),
    filters: {},
    onFilterChange: jest.fn(),
    locationOptions: [
      { value: 'Global', label: 'Global', count: 1 },
      { value: 'LocalWorkspace', label: 'Local Workspace', count: 1 },
    ],
    onOpen: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<ObjectsTable {...props} />) };
}

describe('ObjectsTable', () => {
  it('ObjectsTable — with rows — renders object names and counts', () => {
    // Arrange / Act
    renderTable();

    // Assert
    expect(screen.getByText('Request')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('Global')).toBeInTheDocument();
  });

  it('ObjectsTable — missing plural / description — renders an em-dash', () => {
    // Arrange / Act
    renderTable();

    // Assert — the Vendor row has no plural label and no description.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('ObjectsTable — View button — opens the row via keyboard-accessible control', async () => {
    // Arrange
    const onOpen = jest.fn();
    const user = userEvent.setup();
    renderTable({ onOpen });

    // Act
    await user.click(screen.getByRole('button', { name: 'View Vendor' }));

    // Assert
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ name: 'Vendor' }));
  });

  it('ObjectsTable — no accessibility violations', async () => {
    // Arrange
    const { container } = renderTable();

    // Act
    const results = await axe(container);

    // Assert
    expect(results).toHaveNoViolations();
  });
});
