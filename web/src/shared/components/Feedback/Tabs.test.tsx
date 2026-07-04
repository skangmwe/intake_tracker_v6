import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { Tabs } from './Tabs';

const TAB_ITEMS = [
  { id: 'details', label: 'Details' },
  { id: 'activity', label: 'Activity' },
  { id: 'files', label: 'Files' },
];

function TabsHarness() {
  const [value, setValue] = useState('details');
  return <Tabs tabs={TAB_ITEMS} value={value} onChange={setValue} label="Record sections" />;
}

describe('Tabs', () => {
  it('Tabs — renders a tablist with the active tab selected', () => {
    render(<TabsHarness />);
    expect(screen.getByRole('tablist', { name: 'Record sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'false');
  });

  it('Tabs — clicking a tab selects it', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<TabsHarness />);

    // Act
    await user.click(screen.getByRole('tab', { name: 'Files' }));

    // Assert
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'false');
  });

  it('Tabs — ArrowRight moves selection to the next tab', async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Tabs — ArrowLeft from the first tab wraps to the last', async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);

    screen.getByRole('tab', { name: 'Details' }).focus();
    await user.keyboard('{ArrowLeft}');

    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Tabs — End jumps to the last tab, Home returns to the first', async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);

    screen.getByRole('tab', { name: 'Details' }).focus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Tabs — only the active tab is in the tab order (roving tabIndex)', () => {
    render(<TabsHarness />);
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('tabindex', '-1');
  });

  it('Tabs — no axe violations', async () => {
    const { container } = render(<TabsHarness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
