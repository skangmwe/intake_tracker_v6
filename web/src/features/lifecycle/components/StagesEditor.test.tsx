// Tests for the Stages editor — renders the track, dispatches edits, marks gate targets, and is
// accessible (jest-axe).

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildLifecycleConfig } from '@/test-utils';

import { draftFromConfig, type LifecycleDraft } from '../lifecycleDraft';
import { StagesEditor } from './StagesEditor';

const lifecycle = (): LifecycleDraft => draftFromConfig(buildLifecycleConfig())[0]!;

describe('StagesEditor', () => {
  it('renders a name input and category select per stage', () => {
    render(<StagesEditor lifecycle={lifecycle()} dispatch={jest.fn()} />);
    expect(screen.getByLabelText('Stage 1 name')).toHaveValue('Execution');
    expect(screen.getByLabelText('Status category for Validation')).toHaveValue('Validation');
  });

  it('marks the stage a gate fires into with a gate icon', () => {
    // The seed gate targets "validation"; a "Gate on entry" marker should appear.
    render(<StagesEditor lifecycle={lifecycle()} dispatch={jest.fn()} />);
    expect(screen.getByLabelText('Gate on entry')).toBeInTheDocument();
  });

  it('dispatches a stage label update on edit', async () => {
    const dispatch = jest.fn();
    const user = userEvent.setup();
    render(<StagesEditor lifecycle={lifecycle()} dispatch={dispatch} />);

    await user.type(screen.getByLabelText('Stage 1 name'), '!');

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'STAGE_UPDATE', patch: { label: 'Execution!' } }));
  });

  it('dispatches add and remove actions', async () => {
    const dispatch = jest.fn();
    const user = userEvent.setup();
    render(<StagesEditor lifecycle={lifecycle()} dispatch={dispatch} />);

    await user.click(screen.getByRole('button', { name: /add stage/i }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'STAGE_ADD' }));

    await user.click(screen.getByRole('button', { name: /remove stage execution/i }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'STAGE_REMOVE' }));
  });

  it('has no axe violations', async () => {
    const { container } = render(<StagesEditor lifecycle={lifecycle()} dispatch={jest.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
