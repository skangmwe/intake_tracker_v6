import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Stack } from '@phosphor-icons/react';

import { WidgetEyebrow } from './WidgetEyebrow';

expect.extend(toHaveNoViolations);

it('WidgetEyebrow — renders the title with an aria-hidden icon and is accessible', async () => {
  // Arrange / Act
  const { container } = render(<WidgetEyebrow title="Inflight status" icon={Stack} />);

  // Assert
  expect(screen.getByText('Inflight status')).toBeInTheDocument();
  expect(await axe(container)).toHaveNoViolations();
});

it('WidgetEyebrow — no icon — renders the title alone', () => {
  render(<WidgetEyebrow title="Records" />);
  expect(screen.getByText('Records')).toBeInTheDocument();
});
