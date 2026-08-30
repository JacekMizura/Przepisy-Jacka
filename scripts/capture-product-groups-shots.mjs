/**
 * Zrzuty katalogu rodzajów (Mozzarella) + formularz z Rodzaj produktu.
 * Desktop 1440×900 + mobile web 390×844.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'product-groups');
const WEB = 'http://localhost:3000';
const API = 'http://localhost:3001';
const stamp = Date.now();
const email = `groups-${stamp}@example.com`;
const password = 'TestPass123!groups';

fs.mkdirSync(OUT, { recursive: true });

async function apiJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      origin: WEB,
      ...(init.headers || {}),
    },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${init.method || 'GET'} ${url} → ${res.status} ${text}`);
  }
  return { body, setCookie };
}

function cookieHeader(setCookies) {
  return setCookies.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
}

async function bootstrap() {
  const signUp = await apiJson(`${API}/api/auth/sign-up/email`, {
    method: 'POST',
    body: JSON.stringify({ email, password, name: 'Groups Smoke' }),
  });
  const cookie = cookieHeader(signUp.setCookie);
  const kitchen = await apiJson(`${API}/api/kitchens`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ name: `Mozzarella demo ${stamp}` }),
  });
  const kitchenId = kitchen.body.id;

  const galbani = await apiJson(`${API}/api/kitchens/${kitchenId}/product-intakes`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({
      idempotencyKey: `galbani-${stamp}`,
      newProduct: {
        name: 'Galbani Mozzarella kulka 125 g',
        defaultUnit: 'gram',
        ean: '5901111000001',
        brand: 'Galbani',
        variantLabel: 'kulka',
        packageQuantity: '125.000',
        packageUnit: 'gram',
        createGroupName: 'Mozzarella',
      },
      nutrition: {
        baseQuantity: '100.000',
        baseUnit: 'gram',
        kcal: '280.000',
        proteinGrams: '18.000',
        carbsGrams: '1.000',
        fatGrams: '22.000',
        source: 'manual',
      },
      stock: {
        packageCount: '2',
        location: 'fridge',
        purchasePriceMinor: 499,
        storeName: 'Biedronka',
      },
    }),
  });

  const mlekovita = await apiJson(
    `${API}/api/kitchens/${kitchenId}/product-intakes`,
    {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({
        idempotencyKey: `mlekovita-${stamp}`,
        newProduct: {
          name: 'Mlekovita Mozzarella 125 g',
          defaultUnit: 'gram',
          ean: '5901111000002',
          brand: 'Mlekovita',
          variantLabel: 'kulka',
          packageQuantity: '125.000',
          packageUnit: 'gram',
          groupId: galbani.body.product.groupId,
        },
        nutrition: {
          baseQuantity: '100.000',
          baseUnit: 'gram',
          kcal: '250.000',
          proteinGrams: '19.000',
          carbsGrams: '1.500',
          fatGrams: '18.000',
          source: 'manual',
        },
        stock: {
          quantity: '250.000',
          location: 'fridge',
          purchasePriceMinor: 449,
          storeName: 'Lidl',
        },
      }),
    },
  );

  const grated = await apiJson(
    `${API}/api/kitchens/${kitchenId}/product-intakes`,
    {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({
        idempotencyKey: `grated-${stamp}`,
        newProduct: {
          name: 'Mozzarella tarta 200 g',
          defaultUnit: 'gram',
          ean: '5901111000003',
          brand: 'Serowar',
          variantLabel: 'tarta',
          packageQuantity: '200.000',
          packageUnit: 'gram',
          groupId: galbani.body.product.groupId,
        },
        nutrition: {
          baseQuantity: '100.000',
          baseUnit: 'gram',
          kcal: '310.000',
          proteinGrams: '22.000',
          carbsGrams: '2.000',
          fatGrams: '24.000',
          source: 'manual',
        },
        stock: {
          quantity: '200.000',
          location: 'fridge',
          purchasePriceMinor: 699,
          storeName: 'Carrefour',
        },
      }),
    },
  );

  // Second batch for Galbani (different store/price)
  await apiJson(`${API}/api/kitchens/${kitchenId}/product-intakes`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({
      idempotencyKey: `galbani-batch2-${stamp}`,
      existingProductId: galbani.body.product.id,
      stock: {
        quantity: '125.000',
        location: 'fridge',
        purchasePriceMinor: 549,
        storeName: 'Carrefour',
      },
    }),
  });

  // Ungrouped product for „Pozostałe”
  await apiJson(`${API}/api/kitchens/${kitchenId}/product-intakes`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({
      idempotencyKey: `oil-${stamp}`,
      newProduct: {
        name: 'Oliwa z oliwek',
        defaultUnit: 'milliliter',
      },
      stock: {
        quantity: '500.000',
        location: 'pantry',
        purchasePriceMinor: 1899,
        storeName: 'Auchan',
      },
    }),
  });

  return {
    cookie,
    kitchenId,
    groupId: galbani.body.product.groupId,
    productId: galbani.body.product.id,
    gratedId: grated.body.product.id,
    mlekovitaId: mlekovita.body.product.id,
  };
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('wrote', file);
}

async function withCookies(browser, size, cookie) {
  const context = await browser.newContext({ viewport: size, locale: 'pl-PL' });
  const pairs = cookie.split('; ').map((p) => {
    const i = p.indexOf('=');
    return { name: p.slice(0, i), value: p.slice(i + 1) };
  });
  await context.addCookies(
    pairs.map((p) => ({
      name: p.name,
      value: p.value,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    })),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

async function runViewport(browser, size, suffix, data) {
  const { cookie, kitchenId, groupId, productId } = data;
  const { context, page } = await withCookies(browser, size, cookie);

  // Catalog: one Mozzarella card
  await page.goto(`${WEB}/kitchens/${kitchenId}/stock`);
  await page.getByRole('button', { name: /Katalog produktów/i }).click();
  await page.waitForSelector('text=Pozostałe produkty', { timeout: 30_000 });
  const mozzarellaCard = page
    .locator('a[href*="/product-groups/"]')
    .filter({ hasText: 'Mozzarella' })
    .first();
  await mozzarellaCard.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(500);
  await shot(page, `catalog-mozzarella-card-${suffix}`);

  await mozzarellaCard.click();
  await page.waitForURL(/product-groups/, { timeout: 15_000 });
  await page.waitForSelector('text=Galbani', { timeout: 20_000 });
  await page.waitForTimeout(600);
  await shot(page, `group-detail-variants-${suffix}`);

  // New product form with kind field
  await page.goto(
    `${WEB}/kitchens/${kitchenId}/products/new?stock=1&from=stock`,
  );
  await page.waitForSelector('#product-entry-name', { timeout: 30_000 });
  await page.locator('#product-entry-name').fill('Galbani Mozzarella light 125 g');
  await page.locator('#product-entry-brand').fill('Galbani');
  await page.locator('#product-entry-variant').fill('light');
  await page.locator('#product-entry-ean').fill('5901111999999');
  await page.locator('#product-entry-package-qty').fill('125');
  await shot(page, `new-form-kind-field-${suffix}`);

  // Inline create kind
  const kindInput = page.locator('label:has-text("Rodzaj produktu")').locator('..').locator('input').first();
  await kindInput.click();
  await kindInput.fill('Mozzarella');
  await page.waitForTimeout(600);
  await shot(page, `kind-search-existing-${suffix}`);

  await kindInput.fill('Tuńczyk');
  await page.waitForTimeout(700);
  const createBtn = page.getByRole('button', { name: /Utwórz|Dodaj rodzaj|Tuńczyk/i });
  if (await createBtn.count()) {
    await createBtn.first().click();
    await page.waitForTimeout(400);
  }
  await shot(page, `kind-inline-create-${suffix}`);

  // Manual nutrition for a concrete variant
  const manual = page.getByRole('button', { name: /Wpisz ręcznie/i });
  if (await manual.count()) await manual.click();
  await page.waitForTimeout(400);
  const kcal = page.locator('#product-nutrition-kcal, [id$="-kcal"]').first();
  if (await kcal.count()) await kcal.fill('220');
  await shot(page, `nutrition-variant-manual-${suffix}`);

  // Product with two batches
  await page.goto(`${WEB}/kitchens/${kitchenId}/products/${productId}/edit`);
  await page.waitForSelector('#product-entry-name', { timeout: 20_000 });
  await page.waitForTimeout(600);
  await shot(page, `edit-product-two-batches-${suffix}`);

  await page.goto(
    `${WEB}/kitchens/${kitchenId}/products/${productId}/add-batch`,
  );
  await page.waitForSelector('#entry-qty', { timeout: 20_000 });
  await shot(page, `add-batch-same-sku-${suffix}`);

  await context.close();
}

const data = await bootstrap();
console.log('kitchen', data.kitchenId, 'group', data.groupId);
const browser = await chromium.launch({ headless: true });
try {
  await runViewport(browser, { width: 1440, height: 900 }, 'desktop', data);
  await runViewport(browser, { width: 390, height: 844 }, 'mobile', data);
  console.log('OK', OUT);
} finally {
  await browser.close();
}
