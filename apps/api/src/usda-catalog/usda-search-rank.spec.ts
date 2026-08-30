import {
  filterAndRankUsdaEntries,
  isProcessedVariant,
  normalizeUsdaQuery,
  tokenizeUsdaQuery,
} from './usda-search-rank';

describe('usda-search-rank', () => {
  const peppers = [
    {
      polishName: 'Papryka czerwona surowa',
      aliases: [
        'papryka',
        'papryki',
        'papryka czerwona',
        'czerwona papryka',
        'red pepper',
        'sweet pepper',
      ],
      descriptionOriginal: 'Peppers, sweet, red, raw',
      variantLabel: 'słodka, czerwona, surowa',
      searchText:
        'papryka czerwona surowa papryka papryki red pepper sweet pepper',
    },
    {
      polishName: 'Papryka zielona surowa',
      aliases: ['papryka', 'papryka zielona', 'green pepper'],
      descriptionOriginal: 'Peppers, sweet, green, raw',
      variantLabel: 'słodka, zielona, surowa',
      searchText: 'papryka zielona surowa papryka green pepper',
    },
    {
      polishName: 'Papryka czerwona gotowana',
      aliases: ['papryka gotowana'],
      descriptionOriginal: 'Peppers, sweet, red, cooked, boiled, drained',
      variantLabel: 'gotowana',
      searchText: 'papryka czerwona gotowana papryka gotowana',
    },
    {
      polishName: 'Papryka mielona przyprawa',
      aliases: ['papryka mielona', 'paprika'],
      descriptionOriginal: 'Spices, paprika',
      variantLabel: 'przyprawa',
      searchText: 'papryka mielona paprika',
    },
  ];

  it('normalizuje polskie znaki i interpunkcję', () => {
    expect(normalizeUsdaQuery('  Łosoś!!! ')).toBe('losos');
    expect(tokenizeUsdaQuery('czerwona, papryka')).toEqual([
      'czerwona',
      'papryka',
    ]);
  });

  it('papryka zwraca kilka wariantów, surowe przed gotowanymi', () => {
    const hits = filterAndRankUsdaEntries(peppers, 'papryka');
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(hits[0]!.polishName).toMatch(/surowa/i);
    const cookedIdx = hits.findIndex((h) => /gotowana/i.test(h.polishName));
    const rawIdx = hits.findIndex((h) => /czerwona surowa/i.test(h.polishName));
    expect(rawIdx).toBeGreaterThanOrEqual(0);
    expect(cookedIdx).toBeGreaterThan(rawIdx);
  });

  it('czerwona papryka i papryka czerwona', () => {
    const a = filterAndRankUsdaEntries(peppers, 'czerwona papryka');
    const b = filterAndRankUsdaEntries(peppers, 'papryka czerwona');
    expect(a.some((h) => /czerwona surowa/i.test(h.polishName))).toBe(true);
    expect(b.some((h) => /czerwona surowa/i.test(h.polishName))).toBe(true);
  });

  it('liczba mnoga papryki', () => {
    const hits = filterAndRankUsdaEntries(peppers, 'papryki');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('angielska nazwa sweet pepper / red pepper', () => {
    expect(
      filterAndRankUsdaEntries(peppers, 'sweet pepper').length,
    ).toBeGreaterThan(0);
    expect(
      filterAndRankUsdaEntries(peppers, 'red pepper').some((h) =>
        /czerwona/i.test(h.polishName),
      ),
    ).toBe(true);
  });

  it('literówka przy min. 4 znakach', () => {
    const hits = filterAndRankUsdaEntries(peppers, 'paprya');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('isProcessedVariant', () => {
    expect(isProcessedVariant(peppers[0]!)).toBe(false);
    expect(isProcessedVariant(peppers[2]!)).toBe(true);
  });
});
