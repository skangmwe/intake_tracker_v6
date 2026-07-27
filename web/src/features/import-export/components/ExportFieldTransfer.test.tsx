import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { IoFieldSpec } from '@shared/types';

import { ExportFieldTransfer } from './ExportFieldTransfer';

const FIELDS: IoFieldSpec[] = [
  { key: 'id', label: 'Record ID', alwaysIncluded: true },
  { key: 'alpha', label: 'Alpha' },
  { key: 'beta', label: 'Beta' },
  { key: 'gamma', label: 'Gamma' },
];

// Controlled harness so onChange drives the rendered state, matching how the wizard uses it.
function Harness({ initial = [] as string[] }: { initial?: string[] }) {
  const [keys, setKeys] = useState<string[]>(initial);
  return <ExportFieldTransfer fields={FIELDS} selectedKeys={keys} onChange={setKeys} />;
}

function availableList() {
  return screen.getByRole('listbox', { name: /available/i });
}
function selectedList() {
  return screen.getByRole('listbox', { name: /selected/i });
}

describe('ExportFieldTransfer', () => {
  it('ExportFieldTransfer — default — identity locked in Selected, rest in Available', () => {
    // Arrange / Act
    render(<Harness />);

    // Assert
    expect(within(selectedList()).getByText('Record ID')).toBeInTheDocument();
    expect(within(availableList()).getByText('Alpha')).toBeInTheDocument();
    expect(within(availableList()).getByText('Beta')).toBeInTheDocument();
  });

  it('ExportFieldTransfer — double-click an available field — moves it to Selected', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act
    await user.dblClick(within(availableList()).getByText('Beta'));

    // Assert
    expect(within(selectedList()).getByText('Beta')).toBeInTheDocument();
    expect(within(availableList()).queryByText('Beta')).not.toBeInTheDocument();
  });

  it('ExportFieldTransfer — select two then Move → — moves both', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act
    await user.click(within(availableList()).getByText('Alpha'));
    await user.keyboard('{Control>}');
    await user.click(within(availableList()).getByText('Gamma'));
    await user.keyboard('{/Control}');
    await user.click(screen.getByRole('button', { name: /move selected right/i }));

    // Assert
    expect(within(selectedList()).getByText('Alpha')).toBeInTheDocument();
    expect(within(selectedList()).getByText('Gamma')).toBeInTheDocument();
  });

  it('ExportFieldTransfer — Move all / Clear all — respects locked identity', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act — move everything, then clear.
    await user.click(screen.getByRole('button', { name: /move all right/i }));
    // Assert all three orderable fields moved.
    expect(within(selectedList()).getByText('Alpha')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear all/i }));

    // Assert — identity stays, orderable fields returned to Available.
    expect(within(selectedList()).getByText('Record ID')).toBeInTheDocument();
    expect(within(selectedList()).queryByText('Alpha')).not.toBeInTheDocument();
    expect(within(availableList()).getByText('Alpha')).toBeInTheDocument();
  });

  it('ExportFieldTransfer — filter Available — narrows the list', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act
    await user.type(screen.getByRole('searchbox', { name: /filter available/i }), 'bet');

    // Assert
    expect(within(availableList()).getByText('Beta')).toBeInTheDocument();
    expect(within(availableList()).queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('ExportFieldTransfer — Alt+ArrowDown on a Selected field — moves it down one', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={['alpha', 'beta']} />);

    // Act — focus Alpha (first orderable) and push it below Beta.
    const alpha = within(selectedList()).getByText('Alpha');
    alpha.focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    // Assert — Beta now precedes Alpha in the Selected list DOM order.
    const options = within(selectedList()).getAllByRole('option').map((el) => el.textContent);
    const betaIndex = options.findIndex((t) => t?.includes('Beta'));
    const alphaIndex = options.findIndex((t) => t?.includes('Alpha'));
    expect(betaIndex).toBeLessThan(alphaIndex);
  });

  it('ExportFieldTransfer — locked identity field — cannot be removed', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness initial={['alpha']} />);

    // Act — try to double-click the locked identity row.
    await user.dblClick(within(selectedList()).getByText('Record ID'));

    // Assert — still in Selected, never appears in Available.
    expect(within(selectedList()).getByText('Record ID')).toBeInTheDocument();
    expect(within(availableList()).queryByText('Record ID')).not.toBeInTheDocument();
  });

  it('ExportFieldTransfer — no axe violations across states', async () => {
    // Arrange
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    // Assert — default
    expect(await axe(container)).toHaveNoViolations();

    // Act — populate Selected + apply a filter, then re-check.
    await user.dblClick(within(availableList()).getByText('Alpha'));
    await user.type(screen.getByRole('searchbox', { name: /filter selected/i }), 'alp');

    // Assert — populated + filtered
    expect(await axe(container)).toHaveNoViolations();
  });
});
