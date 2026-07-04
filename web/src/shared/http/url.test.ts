// Unit tests for the query-string builder.

import { withQuery } from './url';

describe('withQuery', () => {
  it('withQuery — with params — appends an encoded query string', () => {
    const result = withQuery('/v1/fields', { objectType: 'Request', page: 2 });
    expect(result).toBe('/v1/fields?objectType=Request&page=2');
  });

  it('withQuery — undefined and null params — dropped', () => {
    const result = withQuery('/v1/fields', { objectType: 'Request', cursor: undefined, tag: null });
    expect(result).toBe('/v1/fields?objectType=Request');
  });

  it('withQuery — no params — returns the bare path', () => {
    expect(withQuery('/v1/fields', {})).toBe('/v1/fields');
  });

  it('withQuery — encodes special characters', () => {
    expect(withQuery('/v1/search', { q: 'a & b' })).toBe('/v1/search?q=a+%26+b');
  });
});
