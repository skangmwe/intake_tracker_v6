import { initialsOf } from './authContext';

describe('initialsOf', () => {
  it('initialsOf — two names — returns first+last initials uppercased', () => {
    // Act
    const result = initialsOf('Priya Raman');

    // Assert
    expect(result).toBe('PR');
  });

  it('initialsOf — single name — returns first two letters uppercased', () => {
    expect(initialsOf('Cher')).toBe('CH');
  });

  it('initialsOf — three names — uses first and last', () => {
    expect(initialsOf('Ana María Gómez')).toBe('AG');
  });

  it('initialsOf — empty/whitespace — returns a placeholder', () => {
    expect(initialsOf('   ')).toBe('?');
  });
});
