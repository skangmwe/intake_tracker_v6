// Tests for the Gates editor — renders gates + team-only slots with live eligible counts,
// dispatches edits, and is accessible (jest-axe).

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildLifecycleConfig } from '@/test-utils';

import { draftFromConfig, type LifecycleDraft } from '../lifecycleDraft';
import { GatesEditor } from './GatesEditor';

const lifecycle = (): LifecycleDraft => draftFromConfig(buildLifecycleConfig())[0]!;
const roleLabels = ['InfoSec', 'AI Solutions Manager'];
const eligible = new Map([['InfoSec', 2]]);

function renderEditor(dispatch = jest.fn()) {
  render(<GatesEditor lifecycle={lifecycle()} roleLabels={roleLabels} eligibleByRole={eligible} dispatch={dispatch} />);
  return dispatch;
}

describe('GatesEditor', () => {
  it('renders the gate name, transition selects and the live eligible count', () => {
    renderEditor();
    expect(screen.getByDisplayValue('QA readiness gate')).toBeInTheDocument();
    expect(screen.getByLabelText('QA readiness gate — from stage')).toHaveValue('execution');
    expect(screen.getByLabelText('QA readiness gate — to stage')).toHaveValue('validation');
    expect(screen.getByText('2 eligible')).toBeInTheDocument();
  });

  it('dispatches a gate name edit', async () => {
    const dispatch = renderEditor();
    const user = userEvent.setup();
    await user.type(screen.getByDisplayValue('QA readiness gate'), 'X');
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'GATE_UPDATE', patch: { name: 'QA readiness gateX' } }));
  });

  it('dispatches a from-stage change', async () => {
    const dispatch = renderEditor();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('QA readiness gate — from stage'), 'validation');
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'GATE_UPDATE', patch: { fromStageKey: 'validation' } }));
  });

  it('adds a gate, adds an approving team, and removes a slot', async () => {
    const dispatch = renderEditor();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add gate/i }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'GATE_ADD' }));

    await user.click(screen.getByRole('button', { name: /add approving team/i }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SLOT_ADD', roleLabel: 'InfoSec' }));

    await user.click(screen.getByRole('button', { name: /remove approving team/i }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SLOT_REMOVE' }));
  });

  it('changes a slot role and removes the gate', async () => {
    const dispatch = renderEditor();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Approving team'), 'AI Solutions Manager');
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SLOT_UPDATE', roleLabel: 'AI Solutions Manager' }));

    await user.click(screen.getByRole('button', { name: /remove gate qa readiness gate/i }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'GATE_REMOVE' }));
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <GatesEditor lifecycle={lifecycle()} roleLabels={roleLabels} eligibleByRole={eligible} dispatch={jest.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
