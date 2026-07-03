import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { WorkspaceSearch } from './WorkspaceSearch';

describe('WorkspaceSearch', () => {
  it('WorkspaceSearch — renders a labelled search input', () => {
    render(<WorkspaceSearch />);
    expect(screen.getByRole('textbox', { name: 'Search this workspace' })).toBeInTheDocument();
  });

  it('WorkspaceSearch — typing while focused — reveals the results dropdown', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<WorkspaceSearch />);

    // Act
    await user.type(screen.getByRole('textbox', { name: 'Search this workspace' }), 'brief');

    // Assert
    expect(screen.getByRole('listbox', { name: 'Search results' })).toBeInTheDocument();
  });

  it('WorkspaceSearch — focused but empty — shows no dropdown', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSearch />);
    await user.click(screen.getByRole('textbox', { name: 'Search this workspace' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('WorkspaceSearch — no axe violations (idle and with results)', async () => {
    const user = userEvent.setup();
    const { container } = render(<WorkspaceSearch />);
    expect(await axe(container)).toHaveNoViolations();
    await user.type(screen.getByRole('textbox', { name: 'Search this workspace' }), 'brief');
    expect(await axe(container)).toHaveNoViolations();
  });
});
