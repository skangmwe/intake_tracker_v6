import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { RangeSlider } from './RangeSlider';

function Harness({ formatValue }: { formatValue?: (value: number) => string }) {
  const [value, setValue] = useState(5);
  return (
    <RangeSlider
      label="Priority score"
      value={value}
      onChange={setValue}
      min={0}
      max={10}
      formatValue={formatValue}
    />
  );
}

describe('RangeSlider', () => {
  it('RangeSlider — renders a labelled slider with a value readout', () => {
    render(<Harness />);
    const slider = screen.getByLabelText('Priority score');
    expect(slider).toHaveAttribute('type', 'range');
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('RangeSlider — interaction updates the value and readout', () => {
    // Arrange
    render(<Harness />);
    const slider = screen.getByLabelText('Priority score');

    // Act
    // Native range keyboard/drag moves surface as a `change` event; jsdom does not
    // simulate arrow-key range increments, so fire the change directly to model the
    // same real-world interaction path the component handles via onChange.
    fireEvent.change(slider, { target: { value: '6' } });

    // Assert
    expect(slider).toHaveValue('6');
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('RangeSlider — applies the value formatter', () => {
    render(<Harness formatValue={(value) => `${value} pts`} />);
    expect(screen.getByText('5 pts')).toBeInTheDocument();
  });

  it('RangeSlider — no axe violations', async () => {
    const { container } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
