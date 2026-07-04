// Tests for the Approver-teams editor — renders member chips, resolves an add, removes a member,
// surfaces the add error, and is accessible (jest-axe).

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ApproverTeamDto, UserId } from '@shared/types';

import { ApproverTeamsEditor } from './ApproverTeamsEditor';

const teams: ApproverTeamDto[] = [
  { roleLabel: 'InfoSec', members: [{ userId: 'u-1' as UserId, displayName: 'N. Varga' }] },
  { roleLabel: 'GCO', members: [] },
];

describe('ApproverTeamsEditor', () => {
  it('renders each role with its members', () => {
    render(<ApproverTeamsEditor teams={teams} onAdd={jest.fn().mockResolvedValue(undefined)} onRemove={jest.fn()} addError={null} />);
    expect(screen.getByText('InfoSec')).toBeInTheDocument();
    expect(screen.getByText('N. Varga')).toBeInTheDocument();
    expect(screen.getByLabelText('Add member to GCO')).toBeInTheDocument();
  });

  it('resolves an add and clears the input on success', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ApproverTeamsEditor teams={teams} onAdd={onAdd} onRemove={jest.fn()} addError={null} />);

    const input = screen.getByLabelText('Add member to GCO');
    await user.type(input, 'R. Osei');
    // GCO is the second team, so its Add button is the second one.
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[1]!);

    expect(onAdd).toHaveBeenCalledWith('GCO', 'R. Osei');
    expect(input).toHaveValue('');
  });

  it('submits on Enter', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ApproverTeamsEditor teams={teams} onAdd={onAdd} onRemove={jest.fn()} addError={null} />);

    await user.type(screen.getByLabelText('Add member to InfoSec'), 'K. Sato{Enter}');
    expect(onAdd).toHaveBeenCalledWith('InfoSec', 'K. Sato');
  });

  it('keeps the typed value when the add fails', async () => {
    const onAdd = jest.fn().mockRejectedValue(new Error('nope'));
    const user = userEvent.setup();
    render(<ApproverTeamsEditor teams={teams} onAdd={onAdd} onRemove={jest.fn()} addError="No active member matches." />);

    const input = screen.getByLabelText('Add member to GCO');
    await user.type(input, 'Ghost');
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[1]!);

    expect(input).toHaveValue('Ghost');
    expect(screen.getByRole('alert')).toHaveTextContent('No active member matches.');
  });

  it('removes a member', async () => {
    const onRemove = jest.fn();
    const user = userEvent.setup();
    render(<ApproverTeamsEditor teams={teams} onAdd={jest.fn().mockResolvedValue(undefined)} onRemove={onRemove} addError={null} />);

    await user.click(screen.getByRole('button', { name: /remove n\. varga from infosec/i }));
    expect(onRemove).toHaveBeenCalledWith('InfoSec', 'u-1');
  });

  it('has no axe violations, with and without an error', async () => {
    const { container, rerender } = render(
      <ApproverTeamsEditor teams={teams} onAdd={jest.fn().mockResolvedValue(undefined)} onRemove={jest.fn()} addError={null} />,
    );
    expect(await axe(container)).toHaveNoViolations();
    rerender(
      <ApproverTeamsEditor teams={teams} onAdd={jest.fn().mockResolvedValue(undefined)} onRemove={jest.fn()} addError="Boom." />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
