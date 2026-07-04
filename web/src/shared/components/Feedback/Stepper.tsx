// Progress stepper — circles on a continuous 1px track (never bordered rectangles;
// steppers-and-wizards.md). Completed = filled accent + check; current = filled + number;
// upcoming = transparent ring + muted number. The completed connector segment renders in
// --accent-interactive. `compact` shrinks circles/labels for the record-detail sticky bar.
// State is announced to screen readers via visually-hidden text — never colour alone.

import { Fragment } from 'react';
import { Check } from '@phosphor-icons/react';

import './Stepper.css';

interface StepperStep {
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  currentIndex: number;
  compact?: boolean;
}

type StepState = 'completed' | 'current' | 'upcoming';

const STATE_SR_TEXT: Record<StepState, string> = {
  completed: 'completed',
  current: 'current step',
  upcoming: 'not started',
};

export function Stepper({ steps, currentIndex, compact = false }: StepperProps) {
  const className = compact ? 'mws-stepper mws-stepper--compact' : 'mws-stepper';
  const iconSize = compact ? 14 : 18;

  return (
    <div className={className} data-ds="stepper" aria-label="Progress">
      {steps.map((step, index) => {
        const state: StepState =
          index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'upcoming';
        const isLast = index === steps.length - 1;
        return (
          <Fragment key={`${step.label}-${index}`}>
            <div
              className="mws-step"
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="mws-step__circle" aria-hidden="true">
                {state === 'completed' ? <Check size={iconSize} weight="regular" /> : index + 1}
              </span>
              <span className="mws-step__label">{step.label}</span>
              <span className="mws-sr-only">{STATE_SR_TEXT[state]}</span>
            </div>
            {!isLast && (
              <span
                className="mws-step__connector"
                data-done={index < currentIndex ? 'true' : 'false'}
                aria-hidden="true"
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
