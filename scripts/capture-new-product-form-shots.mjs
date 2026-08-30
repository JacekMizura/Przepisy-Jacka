/**
 * Zrzuty formularza „Nowy produkt” wg referencji TSX (PR #25).
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'stock-catalog-ux');
const WEB = 'http://localhost:3000';
const API = 'http://localhost:3001';
const stamp = Date.now();
const email = `form-${stamp}@example.com`;
const password = 'TestPass123!form';

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
    body: JSON.stringify({ email, password, name: 'Form Smoke' }),
  });
  const cookie = cookieHeader(signUp.setCookie);
  const kitchen = await apiJson(`${API}/api/kitchens`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ name: `Form demo ${stamp}` }),
  });
  return { cookie, kitchenId: kitchen.body.id };
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

async function fillForm(page) {
  await page.getByRole('heading', { name: 'Nowy produkt' }).waitFor();
  const kind = page.locator('input[placeholder*="Mozzarella"]');
  await kind.click();
  await kind.fill('Mozzarella');
  await page.waitForTimeout(400);
  const createKind = page.getByRole('option', { name: /Utwórz/i });
  if (await createKind.count()) {
    await createKind.first().click();
  }
  await page.locator('#product-entry-name').fill('Galbani Mozzarella kulka 125 g');
  await page.locator('#product-entry-brand').fill('Galbani');
  await page.locator('#product-entry-variant').fill('kulka');
  await page.locator('#product-entry-ean').fill('5901234123457');
  const pkg = page.locator('input[placeholder="np. 125"]');
  if (await pkg.count()) await pkg.fill('125');
  await page.locator('#entry-qty, input[name="quantity"]').first().fill('250');
  await page.locator('#entry-price, input[placeholder="0,00"]').first().fill('4,99');
  await page.locator('input[placeholder="np. Lidl"]').fill('Biedronka');
}

async function run(browser, size, suffix, data) {
  const { context, page } = await withCookies(browser, size, data.cookie);
  await page.goto(
    `${WEB}/kitchens/${data.kitchenId}/products/new?mode=catalog&from=catalog`,
  );
  await fillForm(page);
  await page.waitForTimeout(500);
  await shot(page, `new-product-purchase-active-${suffix}`);

  if (suffix === 'desktop') {
    await page.getByRole('button', { name: /Wpisz ręcznie/i }).click();
    await page.waitForTimeout(400);
    const kcal = page.locator('#product-nutrition-kcal, [id$="-kcal"]').first();
    if (await kcal.count()) await kcal.fill('280');
    await page.waitForTimeout(300);
    await shot(page, `new-product-nutrition-manual-desktop`);
  }

  await context.close();
}

const data = await bootstrap();
console.log('kitchen', data.kitchenId);
const browser = await chromium.launch({ headless: true });
try {
  await run(browser, { width: 1440, height: 900 }, 'desktop', data);
  await run(browser, { width: 390, height: 844 }, 'mobile', data);
  console.log('OK', OUT);
} finally {
  await browser.close();
}
