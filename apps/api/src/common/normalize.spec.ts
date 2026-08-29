import {
  normalizeEmail,
  normalizeProductName,
  normalizeSearchText,
} from './normalize';

describe('normalizeProductName', () => {
  it('trims, lowercases and collapses spaces', () => {
    expect(normalizeProductName('  Mleko   UHT ')).toBe('mleko uht');
  });
});

describe('normalizeSearchText', () => {
  it('folds Polish diacritics for search', () => {
    expect(normalizeSearchText('  Łosoś  ')).toBe('losos');
    expect(normalizeSearchText('jabłko')).toBe('jablko');
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases email', () => {
    expect(normalizeEmail('  Anna@Example.com ')).toBe('anna@example.com');
  });
});
