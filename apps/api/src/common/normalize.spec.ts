import { normalizeEmail, normalizeProductName } from './normalize';

describe('normalizeProductName', () => {
  it('trims, lowercases and collapses spaces', () => {
    expect(normalizeProductName('  Mleko   UHT ')).toBe('mleko uht');
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases email', () => {
    expect(normalizeEmail('  Anna@Example.com ')).toBe('anna@example.com');
  });
});
