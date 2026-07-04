import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { Stepper } from './Stepper';

const STEPS = [{ label: 'Intake' }, { label: 'Build' }, { label: 'QA' }, { label: 'Done' }];

describe('Stepper', () => {
  it('Stepper — renders completed steps with a check and completed status', () => {
    // Arrange
    render(<Stepper steps={STEPS} currentIndex={2} />);

    // Assert — steps before the current index are completed
    const intake = screen.getByText('Intake').closest('.mws-step');
    expect(intake).toHaveAttribute('data-state', 'completed');
    expect(intake).toHaveTextContent('completed');
  });

  it('Stepper — marks the current step with aria-current and its number', () => {
    render(<Stepper steps={STEPS} currentIndex={2} />);

    const current = screen.getByText('QA').closest('.mws-step');
    expect(current).toHaveAttribute('data-state', 'current');
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(current).toHaveTextContent('3');
  });

  it('Stepper — renders upcoming steps as not started', () => {
    render(<Stepper steps={STEPS} currentIndex={2} />);

    const upcoming = screen.getByText('Done').closest('.mws-step');
    expect(upcoming).toHaveAttribute('data-state', 'upcoming');
    expect(upcoming).toHaveTextContent('not started');
  });

  it('Stepper — completed connectors carry data-done and upcoming ones do not', () => {
    const { container } = render(<Stepper steps={STEPS} currentIndex={2} />);

    const connectors = container.querySelectorAll('.mws-step__connector');
    // Three connectors for four steps; the first two sit between completed steps.
    expect(connectors).toHaveLength(3);
    expect(connectors[0]).toHaveAttribute('data-done', 'true');
    expect(connectors[2]).toHaveAttribute('data-done', 'false');
  });

  it('Stepper — compact mode applies the compact modifier class', () => {
    const { container } = render(<Stepper steps={STEPS} currentIndex={1} compact />);
    expect(container.querySelector('.mws-stepper')).toHaveClass('mws-stepper--compact');
  });

  it('Stepper — no axe violations', async () => {
    const { container } = render(<Stepper steps={STEPS} currentIndex={2} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
