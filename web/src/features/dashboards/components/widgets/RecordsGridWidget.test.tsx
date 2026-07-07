import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { DashboardWidgetDto, RecordsGridData } from '@shared/types';

import { renderWithProviders } from '@/test-utils';

import { RecordsGridWidget } from './RecordsGridWidget';

expect.extend(toHaveNoViolations);

const COLUMNS = ['ID', 'Name', 'Stage', 'Dept/PG/Client', 'Assigned analyst', 'Priority', 'Due date'];

function gridWidget(overrides: Partial<RecordsGridData> = {}): DashboardWidgetDto {
  const data: RecordsGridData = {
    objectType: 'Request',
    columns: COLUMNS,
    count: 2,
    rows: [
      { id: 'REQ-1', name: 'Alpha', stage: 'Build', origin: 'Tax', analyst: 'M. Chen', priority: 5, due: '2026-07-01' },
      { id: 'REQ-2', name: 'Beta', stage: 'Review', origin: 'IP', analyst: 'S. Boyd', priority: 3, due: null },
    ],
    ...overrides,
  };
  return {
    id: 'grid',
    type: 'records-grid',
    title: 'All open requests',
    config: { metric: 'records-grid', objectType: 'Request' },
    data,
  };
}

it('RecordsGridWidget — with rows — renders records, count, and is accessible', async () => {
  // Arrange / Act
  const { container } = renderWithProviders(
    <RecordsGridWidget widget={gridWidget()} objectType="Request" onDrill={jest.fn()} />,
  );

  // Assert
  expect(screen.getByText('Alpha')).toBeInTheDocument();
  expect(screen.getByText('2 records')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('RecordsGridWidget — active drill — shows the pill and clears it', async () => {
  // Arrange
  const onClearDrill = jest.fn();
  renderWithProviders(
    <RecordsGridWidget
      widget={gridWidget()}
      objectType="Request"
      drill={{ type: 'origin', value: 'Tax' }}
      onDrill={jest.fn()}
      onClearDrill={onClearDrill}
    />,
  );

  // Assert — pill copy.
  expect(screen.getByText('Origin · Tax')).toBeInTheDocument();

  // Act
  await userEvent.click(screen.getByRole('button', { name: 'Clear drill-through filter' }));

  // Assert
  expect(onClearDrill).toHaveBeenCalled();
});

it('RecordsGridWidget — no saved view — the export button is disabled', () => {
  // Arrange / Act
  renderWithProviders(<RecordsGridWidget widget={gridWidget()} objectType="Request" onDrill={jest.fn()} />);

  // Assert
  expect(screen.getByRole('button', { name: /Export view/i })).toBeDisabled();
});

it('RecordsGridWidget — empty rows — shows the no-records note', () => {
  // Arrange / Act
  renderWithProviders(
    <RecordsGridWidget widget={gridWidget({ rows: [], count: 0 })} objectType="Request" onDrill={jest.fn()} />,
  );

  // Assert
  expect(screen.getByText('No records match this drill-through.')).toBeInTheDocument();
});
