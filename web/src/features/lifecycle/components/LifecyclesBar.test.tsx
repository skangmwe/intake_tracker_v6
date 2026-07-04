// Tests for the Lifecycles bar — selecting, adding, renaming, defaulting, removing, and axe.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildLifecycleConfig } from '@/test-utils';

import { draftFromConfig, newLifecycle } from '../lifecycleDraft';
import { LifecyclesBar } from './LifecyclesBar';

const single = () => draftFromConfig(buildLifecycleConfig());
const withSecond = () => [...single(), { ...newLifecycle(), name: 'Fast track', requestType: 'Quick' }];

describe('LifecyclesBar', () => {
  it('renders a chip per lifecycle and marks the default', () => {
    const list = withSecond();
    render(<LifecyclesBar lifecycles={list} selectedUid={list[0]!.uid} onSelect={jest.fn()} onNew={jest.fn()} onRemove={jest.fn()} dispatch={jest.fn()} />);
    expect(screen.getByRole('button', { name: /standard.*default/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fast track/i })).toBeInTheDocument();
  });

  it('selects a lifecycle on chip click', async () => {
    const list = withSecond();
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(<LifecyclesBar lifecycles={list} selectedUid={list[0]!.uid} onSelect={onSelect} onNew={jest.fn()} onRemove={jest.fn()} dispatch={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: /fast track/i }));
    expect(onSelect).toHaveBeenCalledWith(list[1]!.uid);
  });

  it('adds a lifecycle and renames the selected one', async () => {
    const list = single();
    const onNew = jest.fn();
    const dispatch = jest.fn();
    const user = userEvent.setup();
    render(<LifecyclesBar lifecycles={list} selectedUid={list[0]!.uid} onSelect={jest.fn()} onNew={onNew} onRemove={jest.fn()} dispatch={dispatch} />);

    await user.click(screen.getByRole('button', { name: /new lifecycle/i }));
    expect(onNew).toHaveBeenCalled();

    await user.type(screen.getByDisplayValue('Standard'), '!');
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'LIFECYCLE_UPDATE', patch: { name: 'Standard!' } }));
  });

  it('hides remove for a single lifecycle and shows Make default on non-defaults', async () => {
    const list = withSecond();
    const dispatch = jest.fn();
    const user = userEvent.setup();
    // Select the non-default second lifecycle.
    render(<LifecyclesBar lifecycles={list} selectedUid={list[1]!.uid} onSelect={jest.fn()} onNew={jest.fn()} onRemove={jest.fn()} dispatch={dispatch} />);

    await user.click(screen.getByRole('button', { name: /make default/i }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'LIFECYCLE_SET_DEFAULT', uid: list[1]!.uid }));
    // Remove is present because there are two lifecycles.
    expect(screen.getByRole('button', { name: /remove lifecycle/i })).toBeInTheDocument();
  });

  it('does not render a remove control for a single lifecycle', () => {
    const list = single();
    render(<LifecyclesBar lifecycles={list} selectedUid={list[0]!.uid} onSelect={jest.fn()} onNew={jest.fn()} onRemove={jest.fn()} dispatch={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /remove lifecycle/i })).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const list = withSecond();
    const { container } = render(
      <LifecyclesBar lifecycles={list} selectedUid={list[1]!.uid} onSelect={jest.fn()} onNew={jest.fn()} onRemove={jest.fn()} dispatch={jest.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
