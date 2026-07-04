// Unit tests for parseMentions — pure function, no DOM, so no jest-axe assertion applies
// (web-testing.md). Covers extraction, de-duplication, order, email exclusion, and edge inputs.

import { parseMentions } from './mentions';

describe('parseMentions', () => {
  it('parseMentions — a single @handle — returns that handle without the @', () => {
    // Arrange
    const text = 'Thanks @alice for the review';

    // Act
    const result = parseMentions(text);

    // Assert
    expect(result).toEqual(['alice']);
  });

  it('parseMentions — multiple handles — preserves first-seen order and de-dupes case-insensitively', () => {
    // Arrange
    const text = 'cc @Bob @alice and again @BOB';

    // Act
    const result = parseMentions(text);

    // Assert
    expect(result).toEqual(['Bob', 'alice']);
  });

  it('parseMentions — an email address — does not match the local part as a mention', () => {
    // Arrange
    const text = 'email me at name@example.com please';

    // Act
    const result = parseMentions(text);

    // Assert
    expect(result).toEqual([]);
  });

  it('parseMentions — handles with dots and hyphens — matches the full handle', () => {
    // Arrange
    const text = 'ping @jo.smith and @maria-lee';

    // Act
    const result = parseMentions(text);

    // Assert
    expect(result).toEqual(['jo.smith', 'maria-lee']);
  });

  it('parseMentions — empty or mention-free text — returns an empty list', () => {
    // Assert
    expect(parseMentions('')).toEqual([]);
    expect(parseMentions('no mentions here')).toEqual([]);
  });
});
