// Tests for AnnouncementsManageTable (S23) — column headers, each status pill, the pin marker, the
// em-dash for a missing poster, the ANNOUNCEMENT funnel affordance, row-open, and axe on the rendered
// grid.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';

import type { AnnouncementListRow } from '@shared/types';

import { AnnouncementsManageTable } from './AnnouncementsManageTable';

expect.extend(toHaveNoViolations);

function row(overrides: Partial<AnnouncementListRow> = {}): AnnouncementListRow {
  return {
    id: 'a1' as AnnouncementListRow['id'],
    title: 'Q3 intake freeze',
    bodySnippet: 'Preview',
    pinned: false,
    status: 'Active',
    author: 'u1' as AnnouncementListRow['author'],
    authorName: 'S. Boyd',
    postedAt: '2026-07-05T09:31:00Z',
    ...overrides,
  };
}

// The Archived row omits authorName entirely (not undefined) so the cell renders the em-dash.
const archivedNoAuthor: AnnouncementListRow = {
  id: 'a-arch' as AnnouncementListRow['id'],
  title: 'Model policy update',
  bodySnippet: 'Preview',
  pinned: false,
  status: 'Archived',
  author: 'u1' as AnnouncementListRow['author'],
  postedAt: '2026-07-05T09:31:00Z',
};

const ROWS: AnnouncementListRow[] = [
  row({
    id: 'a-active' as AnnouncementListRow['id'],
    title: 'Q3 intake freeze',
    pinned: true,
    status: 'Active',
  }),
  row({
    id: 'a-sched' as AnnouncementListRow['id'],
    title: 'Summer office hours',
    status: 'Scheduled',
    authorName: 'M. Chen',
  }),
  archivedNoAuthor,
];

const NOOP = () => undefined;

function renderTable(overrides: Partial<Parameters<typeof AnnouncementsManageTable>[0]> = {}) {
  return render(
    <AnnouncementsManageTable
      rows={ROWS}
      sort={undefined}
      onSortChange={NOOP}
      filters={{}}
      onFilterChange={NOOP}
      onOpen={NOOP}
      {...overrides}
    />,
  );
}

describe('AnnouncementsManageTable', () => {
  it('AnnouncementsManageTable — renders the four prototype columns', () => {
    // Arrange / Act
    renderTable();

    // Assert
    expect(screen.getByText('Announcement')).toBeInTheDocument();
    expect(screen.getByText('Posted by')).toBeInTheDocument();
    expect(screen.getByText('Posted')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('AnnouncementsManageTable — renders each status as a labelled pill', () => {
    // Arrange / Act
    renderTable();

    // Assert — colour is always paired with the status word.
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('AnnouncementsManageTable — pinned row shows a pin marker; missing poster shows an em-dash', () => {
    // Arrange / Act
    renderTable();

    // Assert
    expect(screen.getByLabelText('Pinned')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('AnnouncementsManageTable — exposes the ANNOUNCEMENT filter funnel affordance', () => {
    // Arrange / Act
    renderTable();

    // Assert
    expect(screen.getByRole('button', { name: 'Filter Announcement' })).toBeInTheDocument();
  });

  it('AnnouncementsManageTable — clicking a row opens it', async () => {
    // Arrange
    const onOpen = jest.fn();
    const user = userEvent.setup();
    renderTable({ onOpen });

    // Act
    await user.click(screen.getByText('Summer office hours'));

    // Assert
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-sched' }));
  });

  it('AnnouncementsManageTable — no axe violations', async () => {
    // Arrange / Act
    const { container } = renderTable();

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});
