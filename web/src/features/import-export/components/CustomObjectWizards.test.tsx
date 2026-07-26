// Guards the contract that lets a custom object (SP5) flow through the existing Export/Import wizards
// with zero production changes: whatever `/io/objects` returns, the wizards render as a selectable
// option (`objects.map(item => ({ value: item.objectType, label: item.label }))`, filtered by
// `canExport`/`canImport`). This test seeds the io-object catalog mock with a custom object shape and
// asserts it lights up the same way Request/Feature do in the sibling wizard tests.

import { axe } from 'jest-axe';
import { render, screen } from '@testing-library/react';

import type { IoObjectDto, WorkspaceId } from '@shared/types';

import { useExportObject, useIoObjects, useStartImport, useImportStatus } from '../useImportExport';
import { ExportWizard } from './ExportWizard';
import { ImportWizard } from './ImportWizard';

jest.mock('../useImportExport');

const mockedIoObjects = useIoObjects as jest.MockedFunction<typeof useIoObjects>;
const mockedExport = useExportObject as jest.MockedFunction<typeof useExportObject>;
const mockedStart = useStartImport as jest.MockedFunction<typeof useStartImport>;
const mockedStatus = useImportStatus as jest.MockedFunction<typeof useImportStatus>;

const WORKSPACE = '1a150000-0000-4000-8000-000000000001' as WorkspaceId;

const VENDOR: IoObjectDto = {
  objectType: 'vendor',
  label: 'Vendors',
  canImport: true,
  canExport: true,
  importFields: [{ key: 'name', label: 'Name', required: true }],
  exportFields: [
    { key: 'id', label: 'Record ID', alwaysIncluded: true },
    { key: 'name', label: 'Name', alwaysIncluded: true },
    { key: 'vendorName', label: 'Vendor name' },
  ],
};

function mockObjects(data: IoObjectDto[]) {
  mockedIoObjects.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useIoObjects>);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedExport.mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  } as unknown as ReturnType<typeof useExportObject>);
  mockedStart.mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useStartImport>);
  mockedStatus.mockReturnValue({ data: undefined, isError: false } as unknown as ReturnType<
    typeof useImportStatus
  >);
});

describe('custom object in the IO wizards', () => {
  it('ExportWizard — custom object present — appears as a selectable option', () => {
    // Arrange
    mockObjects([VENDOR]);

    // Act
    render(<ExportWizard workspaceId={WORKSPACE} />);

    // Assert
    expect(
      screen.getByRole('combobox', { name: 'Object to export' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Vendors' })).toBeInTheDocument();
  });

  it('ExportWizard — custom object — no axe violations', async () => {
    // Arrange
    mockObjects([VENDOR]);

    // Act
    const { container } = render(<ExportWizard workspaceId={WORKSPACE} />);

    // Assert
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ImportWizard — custom object present — appears as a selectable option, no axe violations', async () => {
    // Arrange
    mockObjects([VENDOR]);

    // Act
    const { container } = render(<ImportWizard workspaceId={WORKSPACE} />);

    // Assert
    expect(
      screen.getByRole('combobox', { name: 'Object to import' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Vendors' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
