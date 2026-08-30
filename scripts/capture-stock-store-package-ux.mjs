/**
 * Zrzuty: formularz partii, partia po zapisie, nagłówek+filtry zapasów.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'stock-store-package-ux');
const WEB = 'http://localhost:3000';
const API = 'http://localhost:3001';
const stamp = Date.now();
const email = `pkg-ux-${stamp}@example.com`;
const password = 'TestPass123!pkg';

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
    body: JSON.stringify({ email, password, name: 'Pkg UX' }),
  });
  const cookie = cookieHeader(signUp.setCookie);
  const kitchen = await apiJson(`${API}/api/kitchens`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ name: `Pkg UX ${stamp}` }),
  });
  const kitchenId = kitchen.body.id;
  const intake = await apiJson(`${API}/api/kitchens/${kitchenId}/product-intakes`, {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({
      idempotencyKey: `pkg-ux-${stamp}`,
      newProduct: {
        name: 'Ser mozzarella Delikate',
        defaultUnit: 'gram',
        brand: 'Delikate',
        variantLabel: 'Kulka',
        category: 'Nabiał',
        packageQuantity: '125.000',
        packageUnit: 'gram',
        createGroupName: 'Mozzarella',
      },
      stock: {
        packageCount: '2',
        location: 'fridge',
        purchasePriceMinor: 598,
        storeName: 'Biedronka',
        purchasedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 86400000).toISOString(),
      },
    }),
  });
  return {
    cookie,
    kitchenId,
    productId: intake.body.product.id,
  };
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

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('wrote', file);
}

const data = await bootstrap();
console.log('kitchen', data.kitchenId, 'product', data.productId);

const browser = await chromium.launch({ headless: true });
try {
  {
    const { context, page } = await withCookies(
      browser,
      { width: 1280, height: 900 },
      data.cookie,
    );
    await page.goto(
      `${WEB}/kitchens/${data.kitchenId}/products/${data.productId}/add-batch`,
    );
    await page.getByRole('heading', { name: /Dodaj kolejną partię|partię/i }).waitFor();
    const pkg = page.locator('#entry-package-count');
    if (await pkg.count()) {
      await pkg.fill('2');
      await page.locator('#entry-price').fill('2,99');
      await page.locator('#entry-store').fill('Biedronka');
    }
    await page.waitForTimeout(400);
    await shot(page, 'add-batch-packages-desktop');
    await context.close();
  }

  {
    const { context, page } = await withCookies(
      browser,
      { width: 1280, height: 900 },
      data.cookie,
    );
    await page.goto(`${WEB}/kitchens/${data.kitchenId}/stock?view=stock`);
    await page.getByRole('heading', { name: 'Moje zapasy' }).waitFor();
    await page.waitForTimeout(500);
    const row = page.getByText('Ser mozzarella Delikate').first();
    await row.click();
    await page.waitForTimeout(400);
    await shot(page, 'stock-batch-after-save-desktop');
    await shot(page, 'stock-header-filters-desktop');
    await context.close();
  }
  console.log('OK', OUT);
} finally {
  await browser.close();
}
