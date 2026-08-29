/**
 * Ręcznie dobrana lista FDC ID + polskie nazwy/aliasy.
 * Wartości odżywcze pochodzą wyłącznie z oficjalnych plików USDA
 * (Foundation Foods / SR Legacy) przez skrypt build-catalog.mjs.
 */
export type CatalogSelection = {
  fdcId: number;
  /** Prefer Foundation when both exist for same food. */
  preferDataType?: 'Foundation' | 'SR Legacy';
  polishName: string;
  aliases: string[];
  variantLabel: string;
  /** Ostrzeżenie dla serów/wędlin — konkretny wyrób może się różnić. */
  compositionMayVary?: boolean;
};

export const USDA_CATALOG_VERSION = '2026-08-usda-v1';
export const USDA_FOUNDATION_RELEASE = '2025-12-18';
export const USDA_SR_LEGACY_RELEASE = '2018-04';

/** ~100 starannie dobranych wariantów — bez wymuszania kompletności kategorii. */
export const USDA_CATALOG_SELECTION: CatalogSelection[] = [
  // Owoce
  {
    fdcId: 1750340,
    polishName: 'Jabłko surowe ze skórką',
    aliases: ['jabłko', 'jabłka', 'apple'],
    variantLabel: 'surowe, ze skórką (ogólne)',
  },
  {
    fdcId: 168203,
    polishName: 'Jabłko Granny Smith surowe ze skórką',
    aliases: ['granny smith', 'jabłko kwaśne'],
    variantLabel: 'Granny Smith, surowe, ze skórką',
  },
  {
    fdcId: 168201,
    polishName: 'Jabłko Red Delicious surowe ze skórką',
    aliases: ['red delicious'],
    variantLabel: 'Red Delicious, surowe, ze skórką',
  },
  {
    fdcId: 173944,
    polishName: 'Banan surowy',
    aliases: ['banan', 'banany', 'banana'],
    variantLabel: 'surowy',
  },
  {
    fdcId: 2346409,
    preferDataType: 'Foundation',
    polishName: 'Truskawka surowa',
    aliases: ['truskawka', 'truskawki', 'strawberry'],
    variantLabel: 'surowa',
  },
  {
    fdcId: 2346411,
    preferDataType: 'Foundation',
    polishName: 'Borówka surowa',
    aliases: ['borówka', 'borówki', 'blueberry'],
    variantLabel: 'surowa',
  },
  {
    fdcId: 746771,
    preferDataType: 'Foundation',
    polishName: 'Pomarańcza Navel surowa',
    aliases: ['pomarańcza', 'pomarańcze', 'orange'],
    variantLabel: 'Navel, surowa',
  },
  // Warzywa
  {
    fdcId: 1999634,
    polishName: 'Pomidor Roma surowy',
    aliases: ['pomidor', 'pomidory', 'tomato'],
    variantLabel: 'Roma, surowy',
  },
  {
    fdcId: 321360,
    polishName: 'Pomidor koktajlowy surowy',
    aliases: ['pomidorki cherry', 'grape tomato'],
    variantLabel: 'grape, surowy',
  },
  {
    fdcId: 170393,
    polishName: 'Marchew surowa',
    aliases: ['marchew', 'marchewka', 'carrot'],
    variantLabel: 'surowa',
  },
  {
    fdcId: 170000,
    polishName: 'Cebula surowa',
    aliases: ['cebula', 'cebule', 'onion'],
    variantLabel: 'surowa',
  },
  {
    fdcId: 170026,
    polishName: 'Ziemniak surowy ze skórką',
    aliases: ['ziemniak', 'ziemniaki', 'potato'],
    variantLabel: 'miąższ i skórka, surowy',
  },
  {
    fdcId: 168462,
    polishName: 'Szpinak surowy',
    aliases: ['szpinak', 'spinach'],
    variantLabel: 'surowy',
  },
  {
    fdcId: 747447,
    preferDataType: 'Foundation',
    polishName: 'Brokuł surowy',
    aliases: ['brokuł', 'brokuły', 'broccoli'],
    variantLabel: 'surowy',
  },
  {
    fdcId: 2346406,
    preferDataType: 'Foundation',
    polishName: 'Ogórek ze skórką surowy',
    aliases: ['ogórek', 'ogorki', 'cucumber'],
    variantLabel: 'ze skórką, surowy',
  },
  {
    fdcId: 169225,
    polishName: 'Ogórek obrany surowy',
    aliases: ['ogórek obrany'],
    variantLabel: 'obrany, surowy',
  },
  {
    fdcId: 1104647,
    preferDataType: 'Foundation',
    polishName: 'Czosnek surowy',
    aliases: ['czosnek', 'garlic'],
    variantLabel: 'surowy',
  },
  {
    fdcId: 2346388,
    preferDataType: 'Foundation',
    polishName: 'Sałata lodowa surowa',
    aliases: ['sałata', 'iceberg'],
    variantLabel: 'iceberg, surowa',
  },
  {
    fdcId: 2346389,
    preferDataType: 'Foundation',
    polishName: 'Sałata rzymska zielona surowa',
    aliases: ['sałata rzymska', 'romaine'],
    variantLabel: 'romaine, zielona, surowa',
  },
  {
    fdcId: 169975,
    polishName: 'Kapusta surowa',
    aliases: ['kapusta', 'cabbage'],
    variantLabel: 'surowa',
  },
  {
    fdcId: 169124,
    polishName: 'Ananas surowy',
    aliases: ['ananas', 'pineapple'],
    variantLabel: 'surowy, wszystkie odmiany',
  },
  // Jaja
  {
    fdcId: 171287,
    polishName: 'Jajo kurze całe surowe',
    aliases: ['jajko', 'jajka', 'jajo', 'egg'],
    variantLabel: 'całe, świeże, surowe',
  },
  {
    fdcId: 172183,
    polishName: 'Białko jaja surowego',
    aliases: ['białko jaja', 'egg white'],
    variantLabel: 'białko, świeże, surowe',
  },
  {
    fdcId: 172184,
    polishName: 'Żółtko jaja surowego',
    aliases: ['żółtko', 'egg yolk'],
    variantLabel: 'żółtko, świeże, surowe',
  },
  // Mięsa
  {
    fdcId: 171474,
    polishName: 'Pierś kurczaka ze skórą surowa',
    aliases: ['pierś kurczaka', 'kurczak pierś'],
    variantLabel: 'pierś, mięso i skóra, surowa',
  },
  {
    fdcId: 171077,
    polishName: 'Pierś kurczaka bez skóry surowa',
    aliases: ['pierś kurczaka bez skóry', 'chicken breast skinless'],
    variantLabel: 'pierś, tylko mięso, surowa',
  },
  {
    fdcId: 171477,
    polishName: 'Pierś kurczaka bez skóry pieczona',
    aliases: ['pierś kurczaka pieczona'],
    variantLabel: 'pierś, tylko mięso, pieczona',
  },
  {
    fdcId: 171480,
    polishName: 'Udko kurczaka bez skóry surowe',
    aliases: ['udko kurczaka', 'chicken thigh'],
    variantLabel: 'udko, tylko mięso, surowe',
  },
  {
    fdcId: 2514743,
    preferDataType: 'Foundation',
    polishName: 'Wołowina mielona 90% chuda surowa',
    aliases: ['mięso mielone wołowe', 'ground beef 90'],
    variantLabel: '90% chude / 10% tłuszczu, surowa',
  },
  {
    fdcId: 2514744,
    preferDataType: 'Foundation',
    polishName: 'Wołowina mielona 80% chuda surowa',
    aliases: ['mięso mielone 80', 'ground beef 80'],
    variantLabel: '80% chude / 20% tłuszczu, surowa',
  },
  {
    fdcId: 167829,
    polishName: 'Schab wieprzowy chudy surowy',
    aliases: ['schab', 'wieprzowina schab', 'pork loin'],
    variantLabel: 'center loin, tylko chude, surowy',
  },
  {
    fdcId: 2514747,
    preferDataType: 'Foundation',
    polishName: 'Indyk mielony 93% chudy surowy',
    aliases: ['indyk mielony', 'ground turkey'],
    variantLabel: '93% chude / 7% tłuszczu, surowy',
  },
  // Ryby
  {
    fdcId: 175167,
    polishName: 'Łosoś atlantycki hodowlany surowy',
    aliases: ['łosoś', 'losos', 'salmon'],
    variantLabel: 'atlantycki, hodowlany, surowy',
  },
  {
    fdcId: 173686,
    polishName: 'Łosoś atlantycki dziki surowy',
    aliases: ['łosoś dziki', 'wild salmon'],
    variantLabel: 'atlantycki, dziki, surowy',
  },
  {
    fdcId: 175168,
    polishName: 'Łosoś atlantycki hodowlany pieczony',
    aliases: ['łosoś pieczony'],
    variantLabel: 'atlantycki, hodowlany, pieczony na sucho',
  },
  {
    fdcId: 171955,
    polishName: 'Dorsz atlantycki surowy',
    aliases: ['dorsz', 'cod'],
    variantLabel: 'atlantycki, surowy',
  },
  {
    fdcId: 173706,
    polishName: 'Tuńczyk błękitnopłetwy świeży surowy',
    aliases: ['tuńczyk', 'tuna'],
    variantLabel: 'bluefin, świeży, surowy',
  },
  // Nabiał
  {
    fdcId: 746782,
    preferDataType: 'Foundation',
    polishName: 'Mleko pełne 3,25%',
    aliases: ['mleko', 'mleko pełne', 'whole milk'],
    variantLabel: '3,25% tłuszczu, z wit. D',
  },
  {
    fdcId: 746778,
    preferDataType: 'Foundation',
    polishName: 'Mleko 2%',
    aliases: ['mleko 2%', 'reduced fat milk'],
    variantLabel: '2% tłuszczu',
  },
  {
    fdcId: 2259793,
    preferDataType: 'Foundation',
    polishName: 'Jogurt naturalny pełnotłusty',
    aliases: ['jogurt', 'jogurt naturalny', 'yogurt'],
    variantLabel: 'plain, whole milk',
  },
  {
    fdcId: 2647437,
    preferDataType: 'Foundation',
    polishName: 'Jogurt naturalny odtłuszczony',
    aliases: ['jogurt 0%', 'nonfat yogurt'],
    variantLabel: 'plain, nonfat',
  },
  {
    fdcId: 2346386,
    preferDataType: 'Foundation',
    polishName: 'Śmietana kremówka',
    aliases: ['śmietana', 'cream', 'heavy cream'],
    variantLabel: 'heavy cream',
  },
  {
    fdcId: 2346387,
    preferDataType: 'Foundation',
    polishName: 'Śmietana kwaśna pełnotłusta',
    aliases: ['śmietana kwaśna', 'sour cream'],
    variantLabel: 'sour cream, full fat',
  },
  {
    fdcId: 173410,
    polishName: 'Masło solone',
    aliases: ['masło', 'butter'],
    variantLabel: 'solone',
  },
  // Sery (mogą się różnić składem)
  {
    fdcId: 328637,
    preferDataType: 'Foundation',
    polishName: 'Ser cheddar',
    aliases: ['cheddar', 'ser żółty'],
    variantLabel: 'cheddar',
    compositionMayVary: true,
  },
  {
    fdcId: 170845,
    polishName: 'Ser mozzarella pełnotłusta',
    aliases: ['mozzarella'],
    variantLabel: 'whole milk',
    compositionMayVary: true,
  },
  {
    fdcId: 329370,
    preferDataType: 'Foundation',
    polishName: 'Ser mozzarella półtłusta niskowilgotna',
    aliases: ['mozzarella light'],
    variantLabel: 'low moisture, part-skim',
    compositionMayVary: true,
  },
  {
    fdcId: 746767,
    preferDataType: 'Foundation',
    polishName: 'Ser szwajcarski',
    aliases: ['ser szwajcarski', 'swiss'],
    variantLabel: 'swiss',
    compositionMayVary: true,
  },
  {
    fdcId: 325036,
    preferDataType: 'Foundation',
    polishName: 'Parmezan tarty',
    aliases: ['parmezan', 'parmesan'],
    variantLabel: 'grated',
    compositionMayVary: true,
  },
  {
    fdcId: 173420,
    polishName: 'Ser feta',
    aliases: ['feta'],
    variantLabel: 'feta',
    compositionMayVary: true,
  },
  // Wędliny
  {
    fdcId: 332397,
    preferDataType: 'Foundation',
    polishName: 'Szynka plasterkowana wędliniana',
    aliases: ['szynka', 'ham'],
    variantLabel: 'sliced deli, ~96% fat free',
    compositionMayVary: true,
  },
  {
    fdcId: 167872,
    polishName: 'Szynka wieprzowa pieczona regularna',
    aliases: ['szynka pieczona'],
    variantLabel: 'cured ham, boneless, ~11% fat, roasted',
    compositionMayVary: true,
  },
  // Oleje i orzechy
  {
    fdcId: 171413,
    polishName: 'Oliwa z oliwek do sałatek/gotowania',
    aliases: ['oliwa', 'oliwa z oliwek', 'olive oil'],
    variantLabel: 'salad or cooking',
  },
  {
    fdcId: 172336,
    polishName: 'Olej rzepakowy',
    aliases: ['olej rzepakowy', 'canola'],
    variantLabel: 'canola',
  },
  {
    fdcId: 171025,
    polishName: 'Olej słonecznikowy (~65% kwasu linolowego)',
    aliases: ['olej słonecznikowy', 'sunflower oil'],
    variantLabel: 'sunflower, linoleic ~65%',
  },
  {
    fdcId: 2515376,
    preferDataType: 'Foundation',
    polishName: 'Orzeszki ziemne surowe',
    aliases: ['orzeszki ziemne', 'arachidowe', 'peanuts'],
    variantLabel: 'surowe',
  },
  {
    fdcId: 170567,
    polishName: 'Migdały',
    aliases: ['migdał', 'migdały', 'almonds'],
    variantLabel: 'nuts, almonds',
  },
  {
    fdcId: 170187,
    polishName: 'Orzechy włoskie',
    aliases: ['orzechy włoskie', 'walnuts'],
    variantLabel: 'english walnuts',
  },
  // Suche
  {
    fdcId: 168877,
    polishName: 'Ryż biały długoziarnisty surowy',
    aliases: ['ryż', 'ryż biały', 'rice'],
    variantLabel: 'long-grain, raw, enriched',
  },
  {
    fdcId: 168878,
    polishName: 'Ryż biały długoziarnisty ugotowany',
    aliases: ['ryż ugotowany', 'cooked rice'],
    variantLabel: 'long-grain, cooked, enriched',
  },
  {
    fdcId: 2512381,
    preferDataType: 'Foundation',
    polishName: 'Ryż biały długoziarnisty nieenrzyszony surowy',
    aliases: ['ryż nieenrzyszony'],
    variantLabel: 'long grain, unenriched, raw',
  },
  {
    fdcId: 2346396,
    preferDataType: 'Foundation',
    polishName: 'Płatki owsiane tradycyjne',
    aliases: ['płatki owsiane', 'owies', 'oats'],
    variantLabel: 'rolled, old fashioned',
  },
  {
    fdcId: 789890,
    preferDataType: 'Foundation',
    polishName: 'Mąka pszenna uniwersalna bielona',
    aliases: ['mąka', 'mąka pszenna', 'flour'],
    variantLabel: 'all-purpose, enriched, bleached',
  },
  {
    fdcId: 168893,
    polishName: 'Mąka pszenna pełnoziarnista',
    aliases: ['mąka razowa', 'whole wheat flour'],
    variantLabel: 'whole-grain',
  },
  {
    fdcId: 2644283,
    preferDataType: 'Foundation',
    polishName: 'Soczewica sucha',
    aliases: ['soczewica', 'lentils'],
    variantLabel: 'dry',
  },
  {
    fdcId: 169640,
    polishName: 'Miód',
    aliases: ['miód', 'honey'],
    variantLabel: 'honey',
  },
  {
    fdcId: 169655,
    polishName: 'Cukier biały granulowany',
    aliases: ['cukier', 'sugar'],
    variantLabel: 'granulated',
  },
  // Dodatkowe warianty (~100 łącznie)
  {
    fdcId: 168202,
    polishName: 'Jabłko Golden Delicious surowe ze skórką',
    aliases: ['golden delicious'],
    variantLabel: 'Golden Delicious, surowe, ze skórką',
  },
  {
    fdcId: 167793,
    polishName: 'Jabłko Fuji surowe ze skórką (SR)',
    aliases: ['fuji'],
    variantLabel: 'Fuji, surowe, ze skórką',
  },
  {
    fdcId: 169097,
    polishName: 'Pomarańcza surowa (odmiany handlowe)',
    aliases: ['pomarańcza ogólna'],
    variantLabel: 'all commercial varieties, raw',
  },
  {
    fdcId: 170379,
    polishName: 'Brokuł surowy (SR Legacy)',
    aliases: ['brokuł sr'],
    variantLabel: 'surowy',
  },
  {
    fdcId: 168409,
    polishName: 'Ogórek ze skórką surowy (SR)',
    aliases: ['ogórek sr'],
    variantLabel: 'with peel, raw',
  },
  {
    fdcId: 169230,
    polishName: 'Czosnek surowy (SR)',
    aliases: ['czosnek sr'],
    variantLabel: 'surowy',
  },
  {
    fdcId: 171267,
    polishName: 'Mleko 2% (SR Legacy)',
    aliases: ['mleko 2 sr'],
    variantLabel: '2% milkfat',
  },
  {
    fdcId: 170886,
    polishName: 'Jogurt naturalny niskotłuszczowy',
    aliases: ['jogurt low fat'],
    variantLabel: 'plain, low fat',
  },
  {
    fdcId: 171251,
    polishName: 'Ser szwajcarski (SR)',
    aliases: ['swiss sr'],
    variantLabel: 'swiss',
    compositionMayVary: true,
  },
  {
    fdcId: 170848,
    polishName: 'Parmezan twardy',
    aliases: ['parmezan hard'],
    variantLabel: 'hard',
    compositionMayVary: true,
  },
  {
    fdcId: 169051,
    polishName: 'Mozzarella odtłuszczona',
    aliases: ['mozzarella nonfat'],
    variantLabel: 'nonfat',
    compositionMayVary: true,
  },
  {
    fdcId: 171795,
    polishName: 'Wołowina mielona 90% pieczona (bochenek)',
    aliases: ['mielone 90 pieczone'],
    variantLabel: '90% lean, loaf, baked',
  },
  {
    fdcId: 171798,
    polishName: 'Wołowina mielona 80% smażona (kotlet)',
    aliases: ['mielone 80 smażone'],
    variantLabel: '80% lean, patty, pan-broiled',
  },
  {
    fdcId: 175168,
    polishName: 'Łosoś atlantycki hodowlany pieczony',
    aliases: ['łosoś pieczony'],
    variantLabel: 'farmed, cooked dry heat',
  },
  {
    fdcId: 171998,
    polishName: 'Łosoś atlantycki dziki pieczony',
    aliases: ['łosoś dziki pieczony'],
    variantLabel: 'wild, cooked dry heat',
  },
  {
    fdcId: 171956,
    polishName: 'Dorsz atlantycki pieczony',
    aliases: ['dorsz pieczony'],
    variantLabel: 'Atlantic, cooked dry heat',
  },
  {
    fdcId: 172430,
    polishName: 'Orzeszki ziemne surowe (wszystkie typy)',
    aliases: ['arachidowe sr'],
    variantLabel: 'all types, raw',
  },
  {
    fdcId: 168894,
    polishName: 'Mąka pszenna uniwersalna bielona (SR)',
    aliases: ['mąka biała'],
    variantLabel: 'white, all-purpose, enriched, bleached',
  },
  {
    fdcId: 169756,
    polishName: 'Ryż biały długoziarnisty nieenrzyszony surowy (SR)',
    aliases: ['ryż unenriched'],
    variantLabel: 'long-grain, raw, unenriched',
  },
  {
    fdcId: 2346397,
    preferDataType: 'Foundation',
    polishName: 'Owies cięty (steel cut)',
    aliases: ['owies steel cut'],
    variantLabel: 'steel cut, whole grain',
  },
  {
    fdcId: 746952,
    preferDataType: 'Foundation',
    polishName: 'Szynka plasterkowana (restauracyjna)',
    aliases: ['szynka restaurant'],
    variantLabel: 'sliced, restaurant',
    compositionMayVary: true,
  },
  {
    fdcId: 168092,
    polishName: 'Szynka indycza plasterkowana ekstra chuda',
    aliases: ['szynka z indyka'],
    variantLabel: 'turkey ham, extra lean, deli',
    compositionMayVary: true,
  },
  {
    fdcId: 170857,
    polishName: 'Śmietanka do kawy (light cream)',
    aliases: ['śmietanka', 'coffee cream'],
    variantLabel: 'fluid, light',
  },
  {
    fdcId: 171265,
    polishName: 'Mleko pełne 3,25% (SR)',
    aliases: ['mleko pełne sr'],
    variantLabel: '3.25% milkfat with vitamin D',
  },
];
