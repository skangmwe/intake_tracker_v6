import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';

import { apiFetchBlob } from '@/shared/http/apiClient';

import { AuthImage } from './AuthImage';

jest.mock('@/shared/http/apiClient', () => ({
  apiFetchBlob: jest.fn(),
}));

const mockedFetchBlob = apiFetchBlob as jest.MockedFunction<typeof apiFetchBlob>;

describe('AuthImage', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeAll(() => {
    URL.createObjectURL = jest.fn(() => 'blob:mock');
    URL.revokeObjectURL = jest.fn();
  });

  afterAll(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  beforeEach(() => {
    mockedFetchBlob.mockReset();
    (URL.createObjectURL as jest.Mock).mockClear();
    (URL.revokeObjectURL as jest.Mock).mockClear();
  });

  it('AuthImage — no path — renders the placeholder and does not fetch', () => {
    // Arrange + Act
    render(<AuthImage path={undefined} alt="Alpha feature" />);

    // Assert
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(mockedFetchBlob).not.toHaveBeenCalled();
  });

  it('AuthImage — with a path — fetches and shows the image', async () => {
    // Arrange
    mockedFetchBlob.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));

    // Act
    render(<AuthImage path="/api/v1/attachments/a1/content" alt="Alpha feature" />);

    // Assert
    const image = await screen.findByRole('img', { name: 'Alpha feature' });
    expect(image).toHaveAttribute('src', 'blob:mock');
    expect(mockedFetchBlob).toHaveBeenCalledWith('/api/v1/attachments/a1/content', expect.anything());
  });

  it('AuthImage — fetch fails — falls back to the placeholder', async () => {
    // Arrange
    mockedFetchBlob.mockRejectedValue(new Error('403'));

    // Act
    render(<AuthImage path="/api/v1/attachments/a1/content" alt="Alpha feature" />);

    // Assert
    await waitFor(() => expect(mockedFetchBlob).toHaveBeenCalled());
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('AuthImage — no axe violations in the placeholder state', async () => {
    const { container } = render(<AuthImage path={undefined} alt="Alpha feature" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
