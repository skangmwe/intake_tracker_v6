import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { SavedViewPicker, type SavedView } from './SavedViewPicker';

const VIEWS: SavedView[] = [
  { id: 'all', name: 'All requests', scope: 'shared', isDefault: true },
  { id: 'team', name: 'My team', scope: 'shared', tag: 'AIS' },
  { id: 'mine', name: 'Assigned to me', scope: 'personal' },
];

const COUNTS: Record<string, number> = { all: 128, team: 42, mine: 7 };

function renderPicker(overrides: Partial<Parameters<typeof SavedViewPicker>[0]> = {}) {
  const props = {
    views: VIEWS,
    activeViewId: 'all',
    onSelect: jest.fn(),
    countFor: (id: string) => COUNTS[id],
    onModifyColumns: jest.fn(),
    onEditView: jest.fn(),
    onSaveAsNew: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<SavedViewPicker {...props} />) };
}

describe('SavedViewPicker', () => {
  it('SavedViewPicker — trigger shows the active view name and meta line', () => {
    renderPicker();
    expect(screen.getByText('All requests')).toBeInTheDocument();
    expect(screen.getByText('Default · Shared')).toBeInTheDocument();
  });

  it('SavedViewPicker — opens the menu grouped by scope with counts', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: /All requests/ }));
    expect(screen.getByRole('group', { name: 'Shared' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Personal' })).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('SavedViewPicker — selecting a view fires onSelect', async () => {
    const user = userEvent.setup();
    const { props } = renderPicker();

    await user.click(screen.getByRole('button', { name: /All requests/ }));
    await user.click(screen.getByRole('button', { name: /My team/ }));
    expect(props.onSelect).toHaveBeenCalledWith('team');
  });

  it('SavedViewPicker — footer actions fire their callbacks', async () => {
    const user = userEvent.setup();
    const { props } = renderPicker();

    await user.click(screen.getByRole('button', { name: /All requests/ }));
    await user.click(screen.getByRole('button', { name: 'Save as new view' }));
    expect(props.onSaveAsNew).toHaveBeenCalledTimes(1);
  });

  it('SavedViewPicker — Escape closes the menu', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole('button', { name: /All requests/ }));
    expect(screen.getByText('Save as new view')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByText('Save as new view')).not.toBeInTheDocument();
  });

  it('SavedViewPicker — no axe violations when open', async () => {
    const user = userEvent.setup();
    const { container } = renderPicker();
    await user.click(screen.getByRole('button', { name: /All requests/ }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
