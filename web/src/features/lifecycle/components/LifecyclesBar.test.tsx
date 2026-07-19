// Tests for the Lifecycles selector (v2, slice 27) — a dropdown to pick the lifecycle to edit,
// plus add / rename / set-default / remove, and axe.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { buildLifecycleConfig } from '@/test-utils';

import { draftFromConfig, newLifecycle } from '../lifecycleDraft';
import { LifecyclesBar } from './LifecyclesBar';

const single = () => draftFromConfig(buildLifecycleConfig());
const withSecond = () => [...single(), { ...newLifecycle(), name: 'Fast track' }];

describe('LifecyclesBar', () => {
  it('renders an option per lifecycle in the dropdown and marks the default', () => {
    const list = withSecond();
    render(<LifecyclesBar lifecycles={list} selectedUid={list[0]!.uid} onSelect={jest.fn()} onNew={jest.fn()} onRemove={jest.fn()} dispatch={jest.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Select lifecycle' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Standard (default)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Fast track' })).toBeInTheDocument();
  });

  it('selects a lifecycle from the dropdown', async () => {
    const list = withSecond();
    const onSelect = jest.fn();
    const user = userEvent.setup();
    render(<LifecyclesBar lifecycles={list} selectedUid={list[0]!.uid} onSelect={onSelect} onNew={jest.fn()} onRemove={jest.fn()} dispatch={jest.fn()} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Select lifecycle' }), list[1]!.uid);
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

    await user.type(screen.getByRole('textbox', { name: 'Lifecycle name' }), '!');
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'LIFECYCLE_UPDATE', patch: { name: 'Standard!' } }));
  });

  it('shows Make default and a Remove control on a non-default lifecycle', async () => {
    const list = withSecond();
    const dispatch = jest.fn();
    const user = userEvent.setup();
    // Select the non-default second lifecycle.
    render(<LifecyclesBar lifecycles={list} selectedUid={list[1]!.uid} onSelect={jest.fn()} onNew={jest.fn()} onRemove={jest.fn()} dispatch={dispatch} />);

    await user.click(screen.getByRole('button', { name: /make default/i }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'LIFECYCLE_SET_DEFAULT', uid: list[1]!.uid }));
    // Remove is present because there are two lifecycles and this one is not the default.
    expect(screen.getByRole('button', { name: /remove lifecycle/i })).toBeInTheDocument();
  });

  it('hides Remove on the default lifecycle even with more than one lifecycle', () => {
    const list = withSecond();
    // The default (first) is selected; it cannot be removed outright — set another default first.
    render(<LifecyclesBar lifecycles={list} selectedUid={list[0]!.uid} onSelect={jest.fn()} onNew={jest.fn()} onRemove={jest.fn()} dispatch={jest.fn()} />);
    expect(screen.getByText('Default lifecycle')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove lifecycle/i })).not.toBeInTheDocument();
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
