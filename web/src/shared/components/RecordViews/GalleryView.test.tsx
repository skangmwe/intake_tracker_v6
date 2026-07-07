import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { GalleryView } from './GalleryView';
import type { RecordViewItem } from './types';

// The gallery's thumbnail fetch is bearer-authenticated; mock the client so cards render the placeholder.
jest.mock('@/shared/http/apiClient', () => ({
  apiFetchBlob: jest.fn(() => Promise.resolve(new Blob())),
}));

const noop = () => undefined;

function buildItems(): RecordViewItem[] {
  return [
    {
      id: 'f1',
      title: 'PDF Summariser',
      subtitle: 'Summarise long PDFs',
      tags: ['Claude', 'RAG'],
      badges: [{ label: 'Published', tone: 'success' }],
      onOpen: noop,
    },
    { id: 'f2', title: 'Clause Finder', onOpen: noop },
  ];
}

describe('GalleryView', () => {
  it('GalleryView — renders a card per item with title and tags', () => {
    // Arrange + Act
    render(<GalleryView items={buildItems()} caption="Feature gallery" />);

    // Assert
    expect(screen.getByRole('button', { name: /PDF Summariser/ })).toBeInTheDocument();
    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('GalleryView — activating a card opens the record', async () => {
    // Arrange
    const onOpen = jest.fn();
    const user = userEvent.setup();
    render(<GalleryView items={[{ id: 'f1', title: 'PDF Summariser', onOpen }]} caption="Feature gallery" />);

    // Act
    await user.click(screen.getByRole('button', { name: /PDF Summariser/ }));

    // Assert
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('GalleryView — no axe violations', async () => {
    const { container } = render(<GalleryView items={buildItems()} caption="Feature gallery" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
