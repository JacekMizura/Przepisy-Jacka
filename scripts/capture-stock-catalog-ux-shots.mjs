/**
 * Zrzuty redesignu Moje zapasy (ograniczony zestaw).
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
const email = `ux-${stamp}@example.com`;
const password = 'TestPass123!ux';

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
    body: JSON.stringify({ email, password, name: 'UX Smoke' }),
  });
  const cookie = cookieHeader(signUp.setCookie);
  const kitchen = await apiJson(`${API}/api/kitchens`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ name: `UX zapasy ${stamp}` }),
  });
  const kitchenId = kitchen.body.id;

  const galbani = await apiJson(`${API}/api/kitchens/${kitchenId}/product-intakes`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({
      idempotencyKey: `g-${stamp}`,
      newProduct: {
        name: 'Galbani Mozzarella kulka 125 g',
        defaultUnit: 'gram',
        ean: '5907777000001',
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

  await apiJson(`${API}/api/kitchens/${kitchenId}/product-intakes`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({
      idempotencyKey: `m-${stamp}`,
      newProduct: {
        name: 'Mlekovita Mozzarella 125 g',
        defaultUnit: 'gram',
        ean: '5907777000002',
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
  });

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
    productId: galbani.body.product.id,
    canUndo: galbani.body.removalHint?.canUndo === true,
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

async function run(browser, size, suffix, data) {
  const { cookie, kitchenId, productId } = data;
  const { context, page } = await withCookies(browser, size, cookie);

  await page.goto(`${WEB}/kitchens/${kitchenId}/stock?view=stock`);
  await page.getByRole('heading', { name: 'Moje zapasy' }).waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  await page.waitForTimeout(800);
  await shot(page, `tab-stock-${suffix}`);

  if (suffix === 'desktop') {
    await page.goto(`${WEB}/kitchens/${kitchenId}/stock?view=catalog`);
    await page.waitForSelector('text=Mozzarella', { timeout: 20_000 });
    await page.waitForTimeout(600);
    await shot(page, `tab-catalog-desktop`);
  }

  await page.goto(
    `${WEB}/kitchens/${kitchenId}/products/new?mode=purchase&stock=1&from=stock`,
  );
  await page.getByText('Rodzaj produktu').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(700);
  await shot(page, `form-purchase-${suffix}`);

  if (suffix === 'desktop') {
    await page.goto(`${WEB}/kitchens/${kitchenId}/stock?view=stock`);
    await page.waitForTimeout(800);
    const menus = page.locator('button[aria-haspopup="menu"], button[aria-label*="akcj" i], button[aria-label*="Więcej" i]');
    const count = await menus.count();
    for (let i = 0; i < count; i += 1) {
      await menus.nth(i).click();
      await page.waitForTimeout(300);
      const undo = page.getByText('Cofnij dodanie');
      if (await undo.count()) {
        await undo.first().click();
        await page.waitForTimeout(500);
        await shot(page, `undo-dialog-desktop`);
        break;
      }
      await page.keyboard.press('Escape');
    }
  }

  await context.close();
}

const data = await bootstrap();
console.log('kitchen', data.kitchenId, 'canUndo', data.canUndo);
const browser = await chromium.launch({ headless: true });
try {
  await run(browser, { width: 1440, height: 900 }, 'desktop', data);
  await run(browser, { width: 390, height: 844 }, 'mobile', data);
  console.log('OK', OUT);
} finally {
  await browser.close();
}
