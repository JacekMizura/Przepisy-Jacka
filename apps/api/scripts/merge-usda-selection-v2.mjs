/**
 * Scala dotychczasową listę FDC z dodatkami v2 i zapisuje catalog-selection.json.
 * Nie pobiera wartości odżywczych — tylko metadane PL + fdcId.
 *
 *   node scripts/merge-usda-selection-v2.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, '..');
const SELECTION_PATH = join(API_ROOT, 'src/usda-catalog/catalog-selection.json');
const TS_PATH = join(API_ROOT, 'src/usda-catalog/catalog-selection.ts');

const ADDITIONS = [
  // Papryka (obowiązkowe)
  { fdcId: 170108, polishName: 'Papryka czerwona surowa', aliases: ['papryka', 'papryki', 'papryka czerwona', 'czerwona papryka', 'red pepper', 'sweet pepper', 'bell pepper', 'papryka slodka', 'papryka słodka'], variantLabel: 'słodka, czerwona, surowa' },
  { fdcId: 170427, polishName: 'Papryka zielona surowa', aliases: ['papryka zielona', 'zielona papryka', 'green pepper', 'green bell pepper'], variantLabel: 'słodka, zielona, surowa' },
  { fdcId: 169383, polishName: 'Papryka żółta surowa', aliases: ['papryka żółta', 'żółta papryka', 'yellow pepper', 'papryka zolta'], variantLabel: 'słodka, żółta, surowa' },
  { fdcId: 170106, polishName: 'Papryczka chili czerwona surowa', aliases: ['papryczka chili', 'chili', 'hot chili', 'papryka chili', 'chilli'], variantLabel: 'hot chili, czerwona, surowa' },
  { fdcId: 170497, polishName: 'Papryczka chili zielona surowa', aliases: ['chili zielone', 'green chili'], variantLabel: 'hot chili, zielona, surowa' },
  { fdcId: 170457, polishName: 'Papryka czerwona gotowana', aliases: ['papryka gotowana', 'papryka czerwona gotowana'], variantLabel: 'słodka, czerwona, gotowana, odsączona' },

  // Warzywa
  { fdcId: 2685573, preferDataType: 'Foundation', polishName: 'Kalafior surowy', aliases: ['kalafior', 'kalafiory', 'cauliflower'], variantLabel: 'surowy' },
  { fdcId: 2685568, preferDataType: 'Foundation', polishName: 'Cukinia zielona surowa', aliases: ['cukinia', 'cukinie', 'zucchini'], variantLabel: 'zielona, ze skórką, surowa' },
  { fdcId: 169251, polishName: 'Pieczarki białe surowe', aliases: ['pieczarki', 'pieczarka', 'grzyby', 'mushroom', 'mushrooms'], variantLabel: 'white, raw' },
  { fdcId: 170154, polishName: 'Bakłażan surowy', aliases: ['bakłażan', 'baklazany', 'eggplant'], variantLabel: 'raw' },
  { fdcId: 169243, polishName: 'Burak surowy', aliases: ['burak', 'buraki', 'beet', 'buraczki'], variantLabel: 'raw' },
  { fdcId: 169967, polishName: 'Seler naciowy surowy', aliases: ['seler naciowy', 'seler', 'celery'], variantLabel: 'raw' },
  { fdcId: 170099, polishName: 'Natka pietruszki surowa', aliases: ['pietruszka', 'natka pietruszki', 'parsley'], variantLabel: 'raw' },
  { fdcId: 170129, polishName: 'Koperek surowy', aliases: ['koperek', 'dill'], variantLabel: 'raw' },
  { fdcId: 169231, polishName: 'Imbir surowy', aliases: ['imbir', 'ginger'], variantLabel: 'raw' },
  { fdcId: 170050, polishName: 'Por surowy', aliases: ['por', 'pory', 'leek'], variantLabel: 'bulb and lower leaf, raw' },
  { fdcId: 169248, polishName: 'Rzodkiewka surowa', aliases: ['rzodkiewka', 'rzodkiewki', 'radish'], variantLabel: 'raw' },
  { fdcId: 169246, polishName: 'Brukselka surowa', aliases: ['brukselka', 'brukselki', 'brussels sprouts'], variantLabel: 'raw' },
  { fdcId: 169236, polishName: 'Dynia surowa', aliases: ['dynia', 'pumpkin'], variantLabel: 'raw' },
  { fdcId: 168482, polishName: 'Batat surowy', aliases: ['batat', 'bataty', 'sweet potato'], variantLabel: 'raw' },
  { fdcId: 169308, polishName: 'Kukurydza słodka surowa', aliases: ['kukurydza', 'corn', 'sweet corn'], variantLabel: 'sweet, yellow, raw' },
  { fdcId: 169244, polishName: 'Fasolka szparagowa zielona surowa', aliases: ['fasolka szparagowa', 'green beans'], variantLabel: 'snap beans, green, raw' },
  { fdcId: 170419, polishName: 'Groszek zielony surowy', aliases: ['groszek', 'groszek zielony', 'peas'], variantLabel: 'green, raw' },
  { fdcId: 170051, polishName: 'Pomidory czerwone z puszki', aliases: ['pomidory z puszki', 'canned tomatoes'], variantLabel: 'canned in tomato juice' },
  { fdcId: 170459, polishName: 'Koncentrat pomidorowy', aliases: ['koncentrat pomidorowy', 'tomato paste'], variantLabel: 'canned paste, without salt added' },

  // Owoce
  { fdcId: 171719, polishName: 'Gruszka surowa ze skórką', aliases: ['gruszka', 'gruszki', 'pear'], variantLabel: 'raw, with skin' },
  { fdcId: 167762, polishName: 'Winogrono surowe', aliases: ['winogrono', 'winogrona', 'grape', 'grapes'], variantLabel: 'red or green, raw' },
  { fdcId: 173945, polishName: 'Kiwi surowe', aliases: ['kiwi'], variantLabel: 'raw' },
  { fdcId: 168154, polishName: 'Mango surowe', aliases: ['mango'], variantLabel: 'raw' },
  { fdcId: 169090, polishName: 'Cytryna surowa ze skórką', aliases: ['cytryna', 'cytryny', 'lemon'], variantLabel: 'raw, with peel' },
  { fdcId: 168153, polishName: 'Awokado surowe', aliases: ['awokado', 'avocado'], variantLabel: 'raw, all commercial varieties' },
  { fdcId: 171688, polishName: 'Brzoskwinia surowa', aliases: ['brzoskwinia', 'brzoskwinie', 'peach'], variantLabel: 'raw' },
  { fdcId: 169910, polishName: 'Śliwka surowa', aliases: ['śliwka', 'śliwki', 'sliwka', 'plum'], variantLabel: 'raw' },
  { fdcId: 171705, polishName: 'Czereśnia słodka surowa', aliases: ['czereśnia', 'czereśnie', 'sweet cherry'], variantLabel: 'sweet, raw' },
  { fdcId: 171721, polishName: 'Malina surowa', aliases: ['malina', 'maliny', 'raspberry'], variantLabel: 'raw' },
  { fdcId: 168157, polishName: 'Arbuz surowy', aliases: ['arbuz', 'watermelon'], variantLabel: 'raw' },
  { fdcId: 167747, polishName: 'Melon cantaloupe surowy', aliases: ['melon', 'cantaloupe'], variantLabel: 'raw' },

  // Mięso / drób
  { fdcId: 174032, polishName: 'Wołowina rostbef surowy', aliases: ['wołowina', 'rostbef', 'beef'], variantLabel: 'top sirloin, choice, trimmed, raw' },
  { fdcId: 167812, polishName: 'Wieprzowina łopatka surowa', aliases: ['wieprzowina', 'łopatka', 'pork shoulder'], variantLabel: 'shoulder blade, boneless, raw' },
  { fdcId: 168249, polishName: 'Polędwiczka wieprzowa surowa', aliases: ['polędwiczka', 'poledwiczka', 'pork tenderloin'], variantLabel: 'tenderloin, lean only, raw' },
  { fdcId: 168314, polishName: 'Kurczak mięso ze skórą surowy', aliases: ['kurczak', 'chicken'], variantLabel: 'meat and skin, raw' },
  { fdcId: 172373, polishName: 'Pałka kurczaka ze skórą surowa', aliases: ['pałka kurczaka', 'udko pałka', 'drumstick'], variantLabel: 'drumstick, meat and skin, raw' },
  { fdcId: 171116, polishName: 'Indyk pierś bez skóry surowa', aliases: ['indyk pierś', 'turkey breast'], variantLabel: 'breast, meat only, raw' },
  { fdcId: 171505, polishName: 'Indyk mielony surowy', aliases: ['indyk mielony', 'ground turkey'], variantLabel: 'ground, raw' },

  // Ryby
  { fdcId: 175122, polishName: 'Pstrąg tęczowy hodowlany surowy', aliases: ['pstrąg', 'pstrag', 'trout'], variantLabel: 'rainbow, farmed, raw' },
  { fdcId: 175118, polishName: 'Makrela atlantycka surowa', aliases: ['makrela', 'mackerel'], variantLabel: 'Atlantic, raw' },
  { fdcId: 175179, polishName: 'Śledź atlantycki surowy', aliases: ['śledź', 'sledz', 'herring'], variantLabel: 'Atlantic, raw' },
  { fdcId: 174219, polishName: 'Mintaj alaskański surowy', aliases: ['mintaj', 'pollock'], variantLabel: 'Alaska, raw' },
  { fdcId: 171952, polishName: 'Karp surowy', aliases: ['karp', 'carp'], variantLabel: 'raw' },
  { fdcId: 173680, polishName: 'Krewetki gotowane', aliases: ['krewetki', 'shrimp'], variantLabel: 'mixed species, cooked, moist heat' },

  // Nabiał
  { fdcId: 170849, polishName: 'Ser ricotta pełnotłusta', aliases: ['ricotta'], variantLabel: 'whole milk', compositionMayVary: true },
  { fdcId: 170854, polishName: 'Ser cottage pełnotłusty', aliases: ['twaróg', 'twarog', 'cottage cheese'], variantLabel: 'creamed, large or small curd', compositionMayVary: true },
  { fdcId: 173417, polishName: 'Ser gouda', aliases: ['gouda', 'ser żółty', 'ser zolty'], variantLabel: 'gouda', compositionMayVary: true },
  { fdcId: 173418, polishName: 'Serek śmietankowy (cream cheese)', aliases: ['serek śmietankowy', 'cream cheese'], variantLabel: 'cream cheese', compositionMayVary: true },
  { fdcId: 173424, polishName: 'Jajko kurze ugotowane na twardo', aliases: ['jajko na twardo', 'jajka na twardo', 'hard boiled egg'], variantLabel: 'whole, hard-boiled' },

  // Wędliny
  { fdcId: 173864, polishName: 'Szynka plasterkowana regularna', aliases: ['szynka', 'ham'], variantLabel: 'sliced, ~11% fat', compositionMayVary: true },
  { fdcId: 167868, polishName: 'Kiełbasa wieprzowa gotowana', aliases: ['kiełbasa', 'kielbasa', 'sausage'], variantLabel: 'pork sausage, cooked', compositionMayVary: true },
  { fdcId: 174594, polishName: 'Bekon wieprzowy surowy', aliases: ['bekon', 'bacon'], variantLabel: 'raw', compositionMayVary: true },
  { fdcId: 174585, polishName: 'Salami gotowane', aliases: ['salami'], variantLabel: 'beef and pork, cooked', compositionMayVary: true },

  // Zboża / kasze / makaron / pieczywo
  { fdcId: 169736, polishName: 'Makaron suchy wzbogacony', aliases: ['makaron', 'pasta', 'spaghetti', 'makarony'], variantLabel: 'dry, enriched' },
  { fdcId: 168928, polishName: 'Makaron ugotowany wzbogacony', aliases: ['makaron ugotowany', 'cooked pasta'], variantLabel: 'cooked, enriched' },
  { fdcId: 170685, polishName: 'Kasza gryczana prażona sucha', aliases: ['kasza gryczana', 'kasza', 'kasze', 'buckwheat groats'], variantLabel: 'roasted, dry' },
  { fdcId: 170686, polishName: 'Kasza gryczana prażona ugotowana', aliases: ['kasza gryczana ugotowana'], variantLabel: 'roasted, cooked' },
  { fdcId: 170283, polishName: 'Jęczmień niełuskany surowy', aliases: ['jęczmień', 'jecmien', 'barley', 'kasza jęczmienna'], variantLabel: 'hulled, raw' },
  { fdcId: 170688, polishName: 'Bulgur suchy', aliases: ['bulgur', 'kasza bulgur'], variantLabel: 'dry' },
  { fdcId: 169699, polishName: 'Kuskus suchy', aliases: ['kuskus', 'couscous'], variantLabel: 'dry' },
  { fdcId: 168874, polishName: 'Komosa ryżowa (quinoa) surowa', aliases: ['quinoa', 'komosa'], variantLabel: 'uncooked' },
  { fdcId: 169703, polishName: 'Ryż brązowy długoziarnisty surowy', aliases: ['ryż brązowy', 'brown rice'], variantLabel: 'long-grain, raw' },
  { fdcId: 169702, polishName: 'Proso surowe', aliases: ['proso', 'millet', 'kasza jaglana'], variantLabel: 'raw' },
  { fdcId: 325871, preferDataType: 'Foundation', polishName: 'Chleb pszenny biały', aliases: ['chleb', 'chleb biały', 'pieczywo', 'bread'], variantLabel: 'white, commercially prepared' },
  { fdcId: 335240, preferDataType: 'Foundation', polishName: 'Chleb pełnoziarnisty', aliases: ['chleb razowy', 'whole wheat bread'], variantLabel: 'whole-wheat, commercially prepared' },
  { fdcId: 174899, polishName: 'Bajgiel zwykły', aliases: ['bajgiel', 'bagel'], variantLabel: 'plain, enriched' },

  // Nasiona / orzechy / rośliny strączkowe
  { fdcId: 173734, polishName: 'Fasola czarna sucha', aliases: ['fasola czarna', 'black beans'], variantLabel: 'mature seeds, raw' },
  { fdcId: 173744, polishName: 'Fasola czerwona kidney sucha', aliases: ['fasola czerwona', 'kidney beans'], variantLabel: 'red, mature seeds, raw' },
  { fdcId: 173756, polishName: 'Ciecierzyca sucha', aliases: ['ciecierzyca', 'chickpeas', 'garbanzo'], variantLabel: 'mature seeds, raw' },
  { fdcId: 174270, polishName: 'Soja sucha', aliases: ['soja', 'soybeans'], variantLabel: 'mature seeds, raw' },
  { fdcId: 170562, polishName: 'Pestki słonecznika suszone', aliases: ['słonecznik', 'slonecznik', 'sunflower seeds'], variantLabel: 'dried' },
  { fdcId: 170554, polishName: 'Nasiona chia suszone', aliases: ['chia', 'nasiona chia'], variantLabel: 'dried' },
  { fdcId: 170184, polishName: 'Pistacje surowe', aliases: ['pistacje', 'pistachio'], variantLabel: 'raw' },
  { fdcId: 170581, polishName: 'Orzechy laskowe', aliases: ['orzechy laskowe', 'hazelnuts', 'laskowe'], variantLabel: 'filberts' },
  { fdcId: 169421, polishName: 'Nerkowce pieczone', aliases: ['nerkowce', 'cashew'], variantLabel: 'dry roasted, with salt' },

  // Tłuszcze / przyprawy / sypkie
  { fdcId: 173430, polishName: 'Masło niesolone', aliases: ['masło niesolone', 'butter unsalted'], variantLabel: 'without salt' },
  { fdcId: 171412, polishName: 'Olej kokosowy', aliases: ['olej kokosowy', 'coconut oil'], variantLabel: 'coconut' },
  { fdcId: 171411, polishName: 'Olej sojowy', aliases: ['olej sojowy', 'soybean oil'], variantLabel: 'salad or cooking' },
  { fdcId: 746775, preferDataType: 'Foundation', polishName: 'Sól kuchenna jodowana', aliases: ['sól', 'sol', 'salt'], variantLabel: 'table, iodized' },
  { fdcId: 170931, polishName: 'Pieprz czarny', aliases: ['pieprz', 'black pepper'], variantLabel: 'spices, black' },
  { fdcId: 171329, polishName: 'Papryka mielona (przyprawa)', aliases: ['papryka mielona', 'paprika spice'], variantLabel: 'spices, paprika' },
  { fdcId: 171320, polishName: 'Cynamon mielony', aliases: ['cynamon', 'cinnamon'], variantLabel: 'ground' },
  { fdcId: 172237, polishName: 'Ocet spirytusowy', aliases: ['ocet', 'vinegar'], variantLabel: 'distilled' },
];

const base = JSON.parse(readFileSync(SELECTION_PATH, 'utf8'));
const byFdc = new Map();
for (const item of base.selection) {
  byFdc.set(item.fdcId, item);
}

let added = 0;
let skipped = 0;
for (const item of ADDITIONS) {
  if (byFdc.has(item.fdcId)) {
    // Wzbogać aliasy istniejącego wpisu (np. papryka na istniejący wpis nie istnieje — dodajemy nowe)
    const existing = byFdc.get(item.fdcId);
    const aliases = new Set([...(existing.aliases ?? []), ...(item.aliases ?? [])]);
    existing.aliases = Array.from(aliases);
    // Jeśli to był słaby alias-only wpis, nie nadpisujemy polishName bez potrzeby
    skipped += 1;
    continue;
  }
  byFdc.set(item.fdcId, item);
  added += 1;
}

// Wzbogać kluczowe aliasy na istniejących produktach kontrolnych
const enrich = [
  { fdcId: 170845, aliases: ['mozzarella', 'ser mozzarella'] },
  { fdcId: 328637, aliases: ['cheddar', 'ser żółty', 'ser zolty'] },
  { fdcId: 332397, aliases: ['szynka', 'ham'] },
  { fdcId: 168877, aliases: ['ryż', 'ryż biały', 'ryz', 'rice'] },
  { fdcId: 2346396, aliases: ['płatki owsiane', 'platki owsiane', 'owies', 'oats'] },
  { fdcId: 171077, aliases: ['pierś z kurczaka', 'piers z kurczaka', 'pierś kurczaka', 'chicken breast'] },
  { fdcId: 175167, aliases: ['łosoś', 'losos', 'salmon'] },
  { fdcId: 171955, aliases: ['dorsz', 'cod'] },
  { fdcId: 173706, aliases: ['tuńczyk', 'tunczyk', 'tuna'] },
  { fdcId: 2514743, aliases: ['wołowina', 'wolowina', 'mięso mielone', 'ground beef'] },
  { fdcId: 167829, aliases: ['wieprzowina', 'schab', 'pork'] },
  { fdcId: 171287, aliases: ['jajko', 'jajka', 'jajo', 'egg'] },
  { fdcId: 746782, aliases: ['mleko', 'mleko pełne', 'milk'] },
  { fdcId: 1999634, aliases: ['pomidor', 'pomidory', 'tomato'] },
  { fdcId: 170026, aliases: ['ziemniak', 'ziemniaki', 'potato'] },
  { fdcId: 170000, aliases: ['cebula', 'cebule', 'onion'] },
  { fdcId: 1104647, aliases: ['czosnek', 'garlic'] },
  { fdcId: 170393, aliases: ['marchew', 'marchewka', 'carrot'] },
  { fdcId: 2346406, aliases: ['ogórek', 'ogorek', 'ogórki', 'cucumber'] },
  { fdcId: 747447, aliases: ['brokuł', 'brokul', 'brokuły', 'broccoli'] },
  { fdcId: 1750340, aliases: ['jabłko', 'jablko', 'jabłka', 'apple'] },
  { fdcId: 173944, aliases: ['banan', 'banany', 'banana'] },
  { fdcId: 2346409, aliases: ['truskawka', 'truskawki', 'strawberry'] },
];
for (const e of enrich) {
  const row = byFdc.get(e.fdcId);
  if (!row) continue;
  row.aliases = Array.from(new Set([...(row.aliases ?? []), ...e.aliases]));
}

const selection = Array.from(byFdc.values()).sort((a, b) =>
  a.polishName.localeCompare(b.polishName, 'pl'),
);

const next = {
  version: '2026-08-usda-v2',
  foundationRelease: base.foundationRelease,
  srLegacyRelease: base.srLegacyRelease,
  selection,
};

writeFileSync(SELECTION_PATH, `${JSON.stringify(next, null, 2)}\n`);

// Zsynchronizuj stałe w catalog-selection.ts (wersja); pełna tablica zostaje w JSON.
let ts = readFileSync(TS_PATH, 'utf8');
ts = ts.replace(
  /export const USDA_CATALOG_VERSION = '[^']+';/,
  "export const USDA_CATALOG_VERSION = '2026-08-usda-v2';",
);
ts = ts.replace(
  /\/\*\* ~100 starannie dobranych wariantów[^*]*\*\//,
  '/** Dobór FDC: źródło prawdy w catalog-selection.json (v2). */',
);
writeFileSync(TS_PATH, ts);

console.log(
  JSON.stringify({
    previous: base.selection.length,
    added,
    skippedExistingFdc: skipped,
    total: selection.length,
  }),
);
