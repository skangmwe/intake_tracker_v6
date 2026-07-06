// Tests for splitSnippet — pure string segmentation for client-side highlighting (no DOM, no axe).

import { splitSnippet } from './highlight';

describe('splitSnippet', () => {
  it('splitSnippet — empty query — returns one unmatched segment', () => {
    // Arrange / Act
    const segments = splitSnippet('some text', '  ');

    // Assert
    expect(segments).toEqual([{ text: 'some text', match: false }]);
  });

  it('splitSnippet — empty text — returns one empty unmatched segment', () => {
    // Arrange / Act
    const segments = splitSnippet('', 'omega');

    // Assert
    expect(segments).toEqual([{ text: '', match: false }]);
  });

  it('splitSnippet — matches a token case-insensitively', () => {
    // Arrange / Act
    const segments = splitSnippet('The Omega threshold', 'omega');

    // Assert
    expect(segments).toEqual([
      { text: 'The ', match: false },
      { text: 'Omega', match: true },
      { text: ' threshold', match: false },
    ]);
  });

  it('splitSnippet — multiple tokens — highlights each', () => {
    // Arrange / Act
    const segments = splitSnippet('contract clause review', 'contract review');

    // Assert
    const matched = segments.filter((segment) => segment.match).map((segment) => segment.text);
    expect(matched).toEqual(['contract', 'review']);
  });

  it('splitSnippet — regex metacharacters in the query are escaped, not interpreted', () => {
    // Arrange / Act — "a.b" must match the literal "a.b", never "axb".
    const segments = splitSnippet('axb and a.b', 'a.b');

    // Assert
    const matched = segments.filter((segment) => segment.match).map((segment) => segment.text);
    expect(matched).toEqual(['a.b']);
  });
});
