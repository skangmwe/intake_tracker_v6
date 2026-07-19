// Unit tests for the Toolkit surface — loading / error / zero-data / populated states, the view
// toggle, opening the detail sheet from a card, and opening the editor from New item. useMe and the
// list hook are mocked; the child sheets are stubbed so the test targets the surface. jest-axe runs
// against the populated and zero-data states.

import { axe } from 'jest-axe';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ToolkitItemId, ToolkitItemListRow, ToolkitListResponse, UserId } from '@shared/types';

import { renderWithProviders, buildMe, buildMembership } from '@/test-utils';
import { useMe } from '@/features/users/useMe';

import { useToolkitList } from '../useToolkit';
import { ToolkitSurface } from './ToolkitSurface';

jest.mock('@/features/users/useMe');
jest.mock('../useToolkit');
jest.mock('./ToolkitDetailSheet', () => ({
  ToolkitDetailSheet: ({ itemId }: { itemId: string }) => <div data-testid="detail-sheet">{itemId}</div>,
}));
jest.mock('./ToolkitEditorSheet', () => ({
  ToolkitEditorSheet: () => <div data-testid="editor-sheet" />,
}));

const mockedUseMe = useMe as jest.MockedFunction<typeof useMe>;
const mockedUseList = useToolkitList as jest.MockedFunction<typeof useToolkitList>;

const me = buildMe({ memberships: [buildMembership({ level: 'Member' })] });

function row(overrides: Partial<ToolkitItemListRow> = {}): ToolkitItemListRow {
  return {
    id: 'AIS-00000073' as ToolkitItemId,
    kind: 'Prompt',
    status: 'Active',
    name: 'Clause extraction prompt',
    oneLiner: 'Pulls structured clauses out of contracts',
    maintainer: 'Mia Chen',
    hasAttachment: false,
    lastModifiedAt: '2026-07-02T10:00:00Z',
    lastModifiedBy: 'Mia Chen' as UserId,
    eTag: 'etag==',
    ...overrides,
  };
}

function page(items: ToolkitItemListRow[]): ToolkitListResponse {
  return { items, totalCount: items.length, page: 1, pageSize: 20 };
}

function listStub(overrides: Partial<ReturnType<typeof useToolkitList>>) {
  mockedUseList.mockReturnValue({ data: undefined, isLoading: false, isError: false, ...overrides } as ReturnType<typeof useToolkitList>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseMe.mockReturnValue({ data: me } as ReturnType<typeof useMe>);
});

describe('ToolkitSurface', () => {
  it('ToolkitSurface — loading — shows a loading status', () => {
    // Arrange
    listStub({ isLoading: true });

    // Act
    renderWithProviders(<ToolkitSurface />, { seedMe: me });

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent('Loading toolkit');
  });

  it('ToolkitSurface — error — shows an error alert', () => {
    // Arrange
    listStub({ isError: true });

    // Act
    renderWithProviders(<ToolkitSurface />, { seedMe: me });

    // Assert
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('ToolkitSurface — empty catalog — shows the zero-data state', () => {
    // Arrange
    listStub({ data: page([]) });

    // Act
    renderWithProviders(<ToolkitSurface />, { seedMe: me });

    // Assert
    expect(screen.getByText('No toolkit items yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add your first item' })).toBeInTheDocument();
  });

  it('ToolkitSurface — populated — renders the item and opens its detail sheet on click', async () => {
    // Arrange
    listStub({ data: page([row()]) });
    renderWithProviders(<ToolkitSurface />, { seedMe: me });

    // Act
    await userEvent.click(screen.getByText('Clause extraction prompt'));

    // Assert
    expect(screen.getByTestId('detail-sheet')).toHaveTextContent('AIS-00000073');
  });

  it('ToolkitSurface — view toggle — switches to the list view', async () => {
    // Arrange
    listStub({ data: page([row()]) });
    renderWithProviders(<ToolkitSurface />, { seedMe: me });

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'List view' }));

    // Assert
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ToolkitSurface — New item — opens the editor sheet', async () => {
    // Arrange
    listStub({ data: page([row()]) });
    renderWithProviders(<ToolkitSurface />, { seedMe: me });

    // Act
    await userEvent.click(screen.getByRole('button', { name: /new item/i }));

    // Assert
    expect(screen.getByTestId('editor-sheet')).toBeInTheDocument();
  });

  it('ToolkitSurface — populated — no axe violations', async () => {
    // Arrange
    listStub({ data: page([row()]) });
    const { container } = renderWithProviders(<ToolkitSurface />, { seedMe: me });

    // Act + Assert
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ToolkitSurface — zero-data — no axe violations', async () => {
    // Arrange
    listStub({ data: page([]) });
    const { container } = renderWithProviders(<ToolkitSurface />, { seedMe: me });

    // Act + Assert
    expect(await axe(container)).toHaveNoViolations();
  });
});
