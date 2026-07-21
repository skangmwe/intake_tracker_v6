import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { TableShell, type SortState, type TableColumn, type TableRow } from './TableShell';

const COLUMNS: TableColumn[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'stage', label: 'Stage' },
  { key: 'score', label: 'Score', sortable: true, align: 'right' },
];

function buildRows(onOpen?: () => void): TableRow[] {
  return [
    { id: 'r1', cells: ['Alpha request', 'Execution', '7'], onOpen },
    { id: 'r2', cells: ['Beta request', 'Validation', '4'] },
  ];
}

describe('TableShell', () => {
  it('TableShell — renders a grid with headers and rows', () => {
    render(<TableShell columns={COLUMNS} rows={buildRows()} caption="Requests" />);
    expect(screen.getByRole('table', { name: 'Requests' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument();
    expect(screen.getByText('Alpha request')).toBeInTheDocument();
    expect(screen.getByText('Beta request')).toBeInTheDocument();
  });

  it('TableShell — clicking a sortable header cycles asc → desc → cleared', async () => {
    // Arrange
    const user = userEvent.setup();
    function Harness() {
      const [sort, setSort] = useState<SortState | undefined>(undefined);
      return (
        <TableShell columns={COLUMNS} rows={buildRows()} sort={sort} onSortChange={setSort} caption="Requests" />
      );
    }
    render(<Harness />);
    const nameHeader = screen.getByRole('columnheader', { name: /Name/ });
    const sortButton = within(nameHeader).getByRole('button', { name: /Name/ });

    // Act + Assert — asc
    await user.click(sortButton);
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');

    // desc
    await user.click(sortButton);
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending');

    // cleared
    await user.click(sortButton);
    expect(nameHeader).toHaveAttribute('aria-sort', 'none');
  });

  it('TableShell — row click fires onOpen', async () => {
    const user = userEvent.setup();
    const onOpen = jest.fn();
    render(<TableShell columns={COLUMNS} rows={buildRows(onOpen)} caption="Requests" />);

    await user.click(screen.getByText('Alpha request'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('TableShell — renders a resize separator per non-last column', () => {
    render(<TableShell columns={COLUMNS} rows={buildRows()} caption="Requests" />);
    // Three columns → two resize handles (last column is flexible).
    expect(screen.getAllByRole('separator')).toHaveLength(2);
  });

  it('TableShell — keyboard resize adjusts the separator value', async () => {
    const user = userEvent.setup();
    render(<TableShell columns={COLUMNS} rows={buildRows()} caption="Requests" />);

    const handle = screen.getAllByRole('separator')[0];
    if (!handle) throw new Error('expected a resize handle');
    const before = Number(handle.getAttribute('aria-valuenow'));
    handle.focus();
    await user.keyboard('{ArrowRight}');
    const updated = screen.getAllByRole('separator')[0];
    if (!updated) throw new Error('expected a resize handle');
    expect(Number(updated.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  });

  it('TableShell — applies the row tint class', () => {
    const rows: TableRow[] = [{ id: 'r1', cells: ['Alpha', 'Execution', '7'], tint: 'mws-aging-tint--overdue' }];
    render(<TableShell columns={COLUMNS} rows={rows} caption="Requests" />);
    expect(screen.getByText('Alpha').closest('.ast-grid__row')).toHaveClass('mws-aging-tint--overdue');
  });

  it('TableShell — sorting a different column moves the active sort onto it', async () => {
    // Arrange — Name is already the sorted column
    const user = userEvent.setup();
    function Harness() {
      const [sort, setSort] = useState<SortState | undefined>({ column: 'name', direction: 'asc' });
      return (
        <TableShell columns={COLUMNS} rows={buildRows()} sort={sort} onSortChange={setSort} caption="Requests" />
      );
    }
    render(<Harness />);
    const scoreHeader = screen.getByRole('columnheader', { name: /Score/ });

    // Act — sort by Score instead
    await user.click(within(scoreHeader).getByRole('button', { name: /Score/ }));

    // Assert
    expect(scoreHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'none');
  });

  it('TableShell — a sortable header is inert when no onSortChange is supplied', async () => {
    // Arrange — no handler wired
    const user = userEvent.setup();
    render(<TableShell columns={COLUMNS} rows={buildRows()} caption="Requests" />);
    const nameHeader = screen.getByRole('columnheader', { name: /Name/ });

    // Act — clicking must not throw
    await user.click(within(nameHeader).getByRole('button', { name: /Name/ }));

    // Assert — sort stays unset
    expect(nameHeader).toHaveAttribute('aria-sort', 'none');
  });

  it('TableShell — a centre-aligned column applies the centre cell class', () => {
    // Arrange
    const columns: TableColumn[] = [
      { key: 'name', label: 'Name' },
      { key: 'flag', label: 'Flag', align: 'center' },
    ];
    const rows: TableRow[] = [{ id: 'r1', cells: ['Alpha', 'Yes'] }];

    // Act
    render(<TableShell columns={columns} rows={rows} caption="Requests" />);

    // Assert
    expect(screen.getByText('Yes').closest('.ast-grid__cell')).toHaveClass('ast-grid__cell--center');
  });

  it('TableShell — renders a per-column filter slot for filterable columns', () => {
    // Arrange
    const columns: TableColumn[] = [
      { key: 'name', label: 'Name' },
      { key: 'stage', label: 'Stage', filterable: true },
    ];

    // Act
    render(
      <TableShell
        columns={columns}
        rows={buildRows()}
        caption="Requests"
        renderFilter={(column) => <button type="button">Filter {column.label}</button>}
      />,
    );

    // Assert
    expect(screen.getByRole('button', { name: 'Filter Stage' })).toBeInTheDocument();
  });

  it('TableShell — dragging the resize handle widens the column', () => {
    // Arrange
    render(<TableShell columns={COLUMNS} rows={buildRows()} caption="Requests" />);
    const handle = screen.getAllByRole('separator')[0]!;
    const before = Number(handle.getAttribute('aria-valuenow'));

    // Act — press on the handle and drag 60px to the right
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 160 });
    fireEvent.mouseUp(window);

    // Assert
    const after = Number(screen.getAllByRole('separator')[0]!.getAttribute('aria-valuenow'));
    expect(after).toBeGreaterThan(before);
  });

  it('TableShell — no axe violations', async () => {
    const { container } = render(<TableShell columns={COLUMNS} rows={buildRows()} caption="Requests" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
