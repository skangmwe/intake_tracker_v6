// Behaviour tests for the three saved-view editor tab bodies (S24). Each is a pure, controlled
// presentational component: it renders the current draft rows and calls onChange with the next
// rows. The tests exercise add / update / remove for every tab plus the Fields column-shuttle
// reorder (including the boundary no-ops) and the label fallback — the branches the editor's own
// tests don't reach. jest-axe on each tab per web-testing.md.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { FilterRow, SortRow } from '../savedViewEditorModel';
import { FieldsTab, FiltersTab, SortTab, type ColumnOption } from './SavedViewEditorTabs';

const COLUMNS: ColumnOption[] = [
  { key: 'name', label: 'Name' },
  { key: 'stage', label: 'Stage' },
  { key: 'score', label: 'Score' },
];

const filterRow = (overrides: Partial<FilterRow> = {}): FilterRow => ({
  id: 'f1',
  column: 'name',
  comparator: 'contains',
  value: '',
  ...overrides,
});

const sortRow = (overrides: Partial<SortRow> = {}): SortRow => ({
  id: 's1',
  column: 'name',
  direction: 'asc',
  ...overrides,
});

describe('FiltersTab', () => {
  it('FiltersTab — no rows — shows the empty hint and no filter rows', () => {
    // Arrange
    const onChange = jest.fn();

    // Act
    render(<FiltersTab rows={[]} columns={COLUMNS} onChange={onChange} />);

    // Assert
    expect(screen.getByText('No filters — this view shows every row you can see.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Filter column')).not.toBeInTheDocument();
  });

  it('FiltersTab — Add filter — appends a row seeded with the first column', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FiltersTab rows={[]} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.click(screen.getByRole('button', { name: /Add filter/ }));

    // Assert
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as FilterRow[];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ column: 'name', comparator: 'contains', value: '' });
  });

  it('FiltersTab — Add filter with no columns — seeds an empty column', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FiltersTab rows={[]} columns={[]} onChange={onChange} />);

    // Act
    await user.click(screen.getByRole('button', { name: /Add filter/ }));

    // Assert
    expect((onChange.mock.calls[0]![0] as FilterRow[])[0]).toMatchObject({ column: '' });
  });

  it('FiltersTab — changing the column emits the updated row', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FiltersTab rows={[filterRow()]} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.selectOptions(screen.getByLabelText('Filter column'), 'stage');

    // Assert
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'f1', column: 'stage' })]);
  });

  it('FiltersTab — changing the comparator emits the updated row', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FiltersTab rows={[filterRow()]} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.selectOptions(screen.getByLabelText('Comparator'), 'gt');

    // Assert
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'f1', comparator: 'gt' })]);
  });

  it('FiltersTab — the value placeholder switches for the is-any-of comparator', () => {
    // Arrange + Act
    render(<FiltersTab rows={[filterRow({ comparator: 'is' })]} columns={COLUMNS} onChange={jest.fn()} />);

    // Assert
    expect(screen.getByLabelText('Filter value')).toHaveAttribute('placeholder', 'value, value…');
  });

  it('FiltersTab — typing a value emits the updated row', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FiltersTab rows={[filterRow()]} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.type(screen.getByLabelText('Filter value'), 'x');

    // Assert
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'f1', value: 'x' })]);
  });

  it('FiltersTab — Remove filter drops the row', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FiltersTab rows={[filterRow(), filterRow({ id: 'f2', column: 'stage' })]} columns={COLUMNS} onChange={onChange} />,
    );

    // Act
    await user.click(screen.getAllByRole('button', { name: 'Remove filter' })[0]!);

    // Assert
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'f2' })]);
  });

  it('FiltersTab — no axe violations', async () => {
    const { container } = render(<FiltersTab rows={[filterRow()]} columns={COLUMNS} onChange={jest.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('FieldsTab', () => {
  it('FieldsTab — no columns selected — shows the empty hint', () => {
    render(<FieldsTab selected={[]} columns={COLUMNS} onChange={jest.fn()} />);
    expect(screen.getByText('Add at least one column below.')).toBeInTheDocument();
  });

  it('FieldsTab — renders selected columns by their label', () => {
    render(<FieldsTab selected={['name', 'stage']} columns={COLUMNS} onChange={jest.fn()} />);
    const list = screen.getByRole('list', { name: 'Selected columns' });
    expect(within(list).getByText('Name')).toBeInTheDocument();
    expect(within(list).getByText('Stage')).toBeInTheDocument();
  });

  it('FieldsTab — an unknown key falls back to the raw key as its label', () => {
    render(<FieldsTab selected={['ghost']} columns={COLUMNS} onChange={jest.fn()} />);
    expect(screen.getByText('ghost')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move ghost up' })).toBeInTheDocument();
  });

  it('FieldsTab — Move up reorders the two columns', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FieldsTab selected={['name', 'stage']} columns={COLUMNS} onChange={onChange} />);

    // Act — move the second column up
    await user.click(screen.getByRole('button', { name: 'Move Stage up' }));

    // Assert
    expect(onChange).toHaveBeenCalledWith(['stage', 'name']);
  });

  it('FieldsTab — Move down reorders the two columns', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FieldsTab selected={['name', 'stage']} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Move Name down' }));

    // Assert
    expect(onChange).toHaveBeenCalledWith(['stage', 'name']);
  });

  it('FieldsTab — Move up at the top is a no-op', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FieldsTab selected={['name', 'stage']} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Move Name up' }));

    // Assert — target index < 0, so onChange never fires
    expect(onChange).not.toHaveBeenCalled();
  });

  it('FieldsTab — Move down at the bottom is a no-op', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FieldsTab selected={['name', 'stage']} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Move Stage down' }));

    // Assert — target index >= length, so onChange never fires
    expect(onChange).not.toHaveBeenCalled();
  });

  it('FieldsTab — Remove drops the column', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FieldsTab selected={['name', 'stage']} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.click(screen.getByRole('button', { name: 'Remove Name' }));

    // Assert
    expect(onChange).toHaveBeenCalledWith(['stage']);
  });

  it('FieldsTab — adding a column from the picker appends it', async () => {
    // Arrange — only "name" selected, so "stage" and "score" remain available
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<FieldsTab selected={['name']} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.selectOptions(screen.getByLabelText('Add a column'), 'score');

    // Assert
    expect(onChange).toHaveBeenCalledWith(['name', 'score']);
  });

  it('FieldsTab — the column picker is hidden once every column is selected', () => {
    render(<FieldsTab selected={['name', 'stage', 'score']} columns={COLUMNS} onChange={jest.fn()} />);
    expect(screen.queryByLabelText('Add a column')).not.toBeInTheDocument();
  });

  it('FieldsTab — no axe violations', async () => {
    const { container } = render(<FieldsTab selected={['name']} columns={COLUMNS} onChange={jest.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('SortTab', () => {
  it('SortTab — no rows — shows the empty hint', () => {
    render(<SortTab rows={[]} columns={COLUMNS} onChange={jest.fn()} />);
    expect(screen.getByText(/No sort — rows use the surface.s default order\./)).toBeInTheDocument();
  });

  it('SortTab — Add sort appends an ascending row on the first column', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<SortTab rows={[]} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.click(screen.getByRole('button', { name: /Add sort/ }));

    // Assert
    const next = onChange.mock.calls[0]![0] as SortRow[];
    expect(next[0]).toMatchObject({ column: 'name', direction: 'asc' });
  });

  it('SortTab — changing the column emits the updated row', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<SortTab rows={[sortRow()]} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.selectOptions(screen.getByLabelText('Sort column'), 'score');

    // Assert
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 's1', column: 'score' })]);
  });

  it('SortTab — changing the direction emits the updated row', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<SortTab rows={[sortRow()]} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.selectOptions(screen.getByLabelText('Sort direction'), 'desc');

    // Assert
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 's1', direction: 'desc' })]);
  });

  it('SortTab — Remove sort drops the row', async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<SortTab rows={[sortRow(), sortRow({ id: 's2', column: 'stage' })]} columns={COLUMNS} onChange={onChange} />);

    // Act
    await user.click(screen.getAllByRole('button', { name: 'Remove sort' })[1]!);

    // Assert
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 's1' })]);
  });

  it('SortTab — no axe violations', async () => {
    const { container } = render(<SortTab rows={[sortRow()]} columns={COLUMNS} onChange={jest.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
