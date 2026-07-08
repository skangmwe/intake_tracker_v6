import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { TableFooter } from './TableFooter';

function renderFooter(overrides: Partial<Parameters<typeof TableFooter>[0]> = {}) {
  const props = {
    page: 1,
    totalPages: 3,
    total: 58,
    start: 1,
    end: 25,
    onPrev: jest.fn(),
    onNext: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<TableFooter {...props} />) };
}

describe('TableFooter', () => {
  it('TableFooter — default noun — shows the range/total summary as records', () => {
    // Arrange / Act
    renderFooter();

    // Assert
    expect(screen.getByText('1–25 of 58 records')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('TableFooter — custom noun — pluralises the summary with that noun', () => {
    // Arrange / Act
    renderFooter({ noun: 'features', total: 3, end: 3, totalPages: 1 });

    // Assert
    expect(screen.getByText('1–3 of 3 features')).toBeInTheDocument();
  });

  it('TableFooter — zero total — shows "0 {noun}" without a range', () => {
    // Arrange / Act
    renderFooter({ total: 0, start: 0, end: 0, noun: 'features' });

    // Assert
    expect(screen.getByText('0 features')).toBeInTheDocument();
  });

  it('TableFooter — nav buttons — fire onPrev and onNext', async () => {
    // Arrange
    const user = userEvent.setup();
    const { props } = renderFooter();

    // Act
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    // Assert
    expect(props.onPrev).toHaveBeenCalledTimes(1);
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it('TableFooter — no accessibility violations', async () => {
    // Arrange
    const { container } = renderFooter();

    // Act
    const results = await axe(container);

    // Assert
    expect(results).toHaveNoViolations();
  });
});
