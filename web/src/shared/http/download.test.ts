// Tests for saveBlob — the transient-anchor download helper. jsdom implements neither
// URL.createObjectURL nor URL.revokeObjectURL, so both are stubbed; the anchor's click is spied so
// no real navigation happens. Logic-only (no rendered DOM output), so no axe assertion.

import { saveBlob } from './download';

describe('saveBlob', () => {
  const createObjectURL = jest.fn(() => 'blob:mock-url');
  const revokeObjectURL = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, writable: true, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, writable: true, configurable: true });
  });

  it('saveBlob — creates an object URL, clicks a download anchor, then revokes the URL', () => {
    // Arrange
    const blob = new Blob(['col-a,col-b'], { type: 'text/csv' });
    const anchor = document.createElement('a');
    const click = jest.spyOn(anchor, 'click').mockImplementation(() => {});
    const createElement = jest.spyOn(document, 'createElement').mockReturnValue(anchor);

    // Act
    saveBlob(blob, 'report.csv');

    // Assert
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toContain('blob:mock-url');
    expect(anchor.download).toBe('report.csv');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    createElement.mockRestore();
  });

  it('saveBlob — revokes the object URL even when the anchor click throws', () => {
    // Arrange
    const blob = new Blob(['x']);
    const anchor = document.createElement('a');
    jest.spyOn(anchor, 'click').mockImplementation(() => {
      throw new Error('click blocked');
    });
    const createElement = jest.spyOn(document, 'createElement').mockReturnValue(anchor);

    // Act + Assert — the finally block still revokes before the error propagates
    expect(() => saveBlob(blob, 'x.csv')).toThrow('click blocked');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    createElement.mockRestore();
  });
});
