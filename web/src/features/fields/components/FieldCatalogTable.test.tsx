import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildFieldCatalogRow } from '@/test-utils';

import { FieldCatalogTable } from './FieldCatalogTable';

const ROWS = [
  buildFieldCatalogRow({
    id: 's',
    fieldKey: 'recordId',
    displayName: 'Record ID',
    source: 'System',
    isRequired: true,
    isReadOnly: true,
    location: 'Global',
    status: 'Active',
  }),
  buildFieldCatalogRow({
    id: 'u',
    fieldKey: 'severity',
    displayName: 'Severity',
    source: 'User',
    isRequired: false,
    status: 'Archived',
  }),
];

function renderTable(overrides: Partial<React.ComponentProps<typeof FieldCatalogTable>> = {}) {
  const props: React.ComponentProps<typeof FieldCatalogTable> = {
    rows: ROWS,
    allRows: ROWS,
    sort: undefined,
    onSortChange: jest.fn(),
    filters: {},
    onFilterChange: jest.fn(),
    onOpen: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<FieldCatalogTable {...props} />) };
}

describe('FieldCatalogTable', () => {
  it('FieldCatalogTable — renders the eight columns and both rows', () => {
    renderTable();
    for (const header of [
      'Field',
      'Key',
      'Type',
      'Object',
      'Location',
      'Required',
      'Source',
      'Status',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: new RegExp(header, 'i') }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText('Record ID')).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
  });

  it('FieldCatalogTable — a system row shows the SYSTEM source and Global location', () => {
    renderTable();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getAllByText('Global').length).toBeGreaterThan(0);
    // Required shows a label, not just a colour — the header plus the required row's cell.
    expect(screen.getAllByText('Required').length).toBeGreaterThan(1);
  });

  it('FieldCatalogTable — clicking a row opens it', async () => {
    const onOpen = jest.fn();
    const user = userEvent.setup();
    renderTable({ onOpen });
    await user.click(screen.getByText('Severity'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ fieldKey: 'severity' }));
  });

  it('FieldCatalogTable — sorting a column calls back', async () => {
    const onSortChange = jest.fn();
    const user = userEvent.setup();
    renderTable({ onSortChange });
    // Exact name targets the sort button, not the "Filter Field" funnel.
    await user.click(screen.getByRole('button', { name: 'Field' }));
    expect(onSortChange).toHaveBeenCalledWith({ column: 'field', direction: 'asc' });
  });

  it('FieldCatalogTable — a platform row shows the PLATFORM source', () => {
    const platformRow = buildFieldCatalogRow({
      id: 'p',
      fieldKey: 'legacy-id',
      displayName: 'Legacy ID',
      source: 'Platform',
    });
    renderTable({ rows: [platformRow], allRows: [platformRow] });
    expect(screen.getByText('Platform')).toBeInTheDocument();
  });

  it('FieldCatalogTable — uses the supplied caption as the table name', () => {
    renderTable({ caption: 'Platform field definitions' });
    expect(
      screen.getByRole('table', { name: 'Platform field definitions' }),
    ).toBeInTheDocument();
  });

  it('FieldCatalogTable — no axe violations', async () => {
    const { container } = renderTable();
    expect(await axe(container)).toHaveNoViolations();
  });
});
