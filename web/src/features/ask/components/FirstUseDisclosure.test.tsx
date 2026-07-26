// Behaviour + a11y tests for the dismissible first-use disclosure.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { FirstUseDisclosure } from './FirstUseDisclosure';

describe('FirstUseDisclosure', () => {
  it('FirstUseDisclosure — first render — shows the AI note, no violations', async () => {
    // Arrange / Act
    const { container } = render(<FirstUseDisclosure />);

    // Assert
    expect(screen.getByRole('note')).toHaveTextContent(/answers are ai-generated/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('FirstUseDisclosure — dismiss — removes the note', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<FirstUseDisclosure />);

    // Act
    await user.click(screen.getByRole('button', { name: /dismiss ai notice/i }));

    // Assert
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
