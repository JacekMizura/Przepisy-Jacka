/**
 * Lokalne zrzuty UX przyjęcia produktu (desktop 1440×900 + mobile 390×844).
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'product-entry');
const WEB = 'http://localhost:3000';
const API = 'http://localhost:3001';
const stamp = Date.now();
const email = `shot-${stamp}@example.com`;
const password = 'TestPass123!shot';

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
    body: JSON.stringify({ email, password, name: 'Smoke' }),
  });
  const cookie = cookieHeader(signUp.setCookie);
  const kitchen = await apiJson(`${API}/api/kitchens`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ name: `Kuchnia ${stamp}` }),
  });
  return { cookie, kitchenId: kitchen.body.id };
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('wrote', file);
}

async function runViewport(browser, size, suffix, cookie, kitchenId) {
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

  await page.goto(
    `${WEB}/kitchens/${kitchenId}/products/new?stock=1&from=stock`,
  );
  await page.waitForSelector('#product-entry-name', { timeout: 30_000 });
  await page.locator('#product-entry-name').fill('Jogurt naturalny');
  await page.locator('#product-entry-ean').fill('5901234123457');
  await page.locator('#entry-qty').fill('2');
  await page.locator('#entry-price').fill('4.50');
  await shot(page, `new-form-stock-on-${suffix}`);

  const manual = page.getByRole('button', { name: /Wpisz ręcznie/i });
  if (await manual.count()) {
    await manual.click();
    await page.waitForTimeout(400);
  }
  // nutrition fields — ids from editor if any, else first number inputs in section
  const nutritionSection = page.getByText('Wartości odżywcze').first();
  await nutritionSection.scrollIntoViewIfNeeded().catch(() => {});
  const kcal = page.locator('input').filter({ hasText: '' });
  // Prefer labeled ids if present
  for (const id of ['nutrition-kcal', 'kcal', 'product-nutrition-kcal']) {
    const el = page.locator(`#${id}`);
    if (await el.count()) await el.fill('61');
  }
  await shot(page, `nutrition-manual-${suffix}`);

  const intake = await apiJson(
    `${API}/api/kitchens/${kitchenId}/product-intakes`,
    {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({
        idempotencyKey: `shot-${suffix}-${stamp}`,
        newProduct: {
          name: `Mleko ${suffix} ${stamp}`,
          defaultUnit: 'milliliter',
          ean: suffix === 'desktop' ? '5909999123456' : null,
        },
        nutrition: {
          baseQuantity: '100.000',
          baseUnit: 'milliliter',
          kcal: '64.000',
          proteinGrams: '3.200',
          carbsGrams: '4.700',
          fatGrams: '3.600',
          source: 'manual',
        },
        stock: {
          quantity: '1000.000',
          location: 'fridge',
          purchasePriceMinor: 399,
          storeName: 'Lidl',
          purchasedAt: new Date().toISOString(),
        },
      }),
    },
  );
  const productId = intake.body.product.id;

  await page.goto(
    `${WEB}/kitchens/${kitchenId}/products/new?stock=1&name=${encodeURIComponent(`Mleko ${suffix} ${stamp}`)}`,
  );
  await page.waitForTimeout(1500);
  await shot(page, `existing-match-${suffix}`);

  await page.goto(`${WEB}/kitchens/${kitchenId}/products/${productId}/edit`);
  await page.waitForSelector('#product-entry-name', { timeout: 20_000 });
  await shot(page, `edit-product-${suffix}`);

  await page.goto(
    `${WEB}/kitchens/${kitchenId}/products/${productId}/add-batch`,
  );
  await page.waitForSelector('#entry-qty', { timeout: 20_000 });
  await shot(page, `add-batch-${suffix}`);

  await context.close();
}

const { cookie, kitchenId } = await bootstrap();
console.log('kitchen', kitchenId);
const browser = await chromium.launch({ headless: true });
try {
  await runViewport(
    browser,
    { width: 1440, height: 900 },
    'desktop',
    cookie,
    kitchenId,
  );
  await runViewport(
    browser,
    { width: 390, height: 844 },
    'mobile',
    cookie,
    kitchenId,
  );
  console.log('OK', OUT);
} finally {
  await browser.close();
}
