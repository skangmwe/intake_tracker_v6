// Tests for the autosave indicator — each state renders its label and is accessible (jest-axe).

import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { AutosaveStatus, type SaveState } from './AutosaveStatus';

describe('AutosaveStatus', () => {
  it.each<[SaveState, RegExp]>([
    ['saved', /saved/i],
    ['saving', /saving/i],
    ['unsaved', /unsaved/i],
  ])('renders the %s state label', (state, label) => {
    render(<AutosaveStatus state={state} />);
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it('renders the error detail when provided', () => {
    render(<AutosaveStatus state="error" error="Gate references a missing stage." />);
    expect(screen.getByRole('status')).toHaveTextContent('Gate references a missing stage.');
  });

  it('falls back to a generic error label with no detail', () => {
    render(<AutosaveStatus state="error" />);
    expect(screen.getByRole('status')).toHaveTextContent(/couldn’t save/i);
  });

  it('has no axe violations across states', async () => {
    const { container, rerender } = render(<AutosaveStatus state="saved" />);
    expect(await axe(container)).toHaveNoViolations();
    rerender(<AutosaveStatus state="error" error="Boom." />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
