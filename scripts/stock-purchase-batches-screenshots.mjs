/**
 * Screenshots for stock purchase batches UI (manual consume + history).
 * Requires web on :3000 and API on :3001.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = process.env.PUBLIC_WEB_ORIGIN || "http://localhost:3000";
const OUT = path.join(
  __dirname,
  "..",
  "verification-screenshots",
  "stock-purchase-batches",
);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const email = `stock.batches.${Date.now()}@example.com`;
  const password = "DemoHaslo123!";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: WEB });
  const page = await context.newPage();

  async function api(method, urlPath, body) {
    const res = await context.request.fetch(urlPath, {
      method,
      headers: {
        "content-type": "application/json",
        origin: WEB,
      },
      data: body,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok()) {
      throw new Error(`${method} ${urlPath} → ${res.status()}: ${text}`);
    }
    return data;
  }

  await api("POST", "/api/auth/sign-up/email", {
    email,
    password,
    name: "Stock Batches Demo",
  });

  const kitchen = await api("POST", "/api/kitchens", {
    name: "Spiżarnia partii",
  });
  const kitchenId = kitchen.id;

  const product = await api("POST", `/api/kitchens/${kitchenId}/products`, {
    name: "Pomidory malinowe",
    defaultUnit: "gram",
    category: "Warzywa",
  });

  await api("POST", `/api/kitchens/${kitchenId}/stock-items`, {
    productId: product.id,
    quantity: "500.000",
    location: "fridge",
    purchasePriceMinor: 400,
    expiresAt: "2026-08-30T00:00:00.000Z",
    purchasedAt: "2026-08-20T00:00:00.000Z",
  });
  await api("POST", `/api/kitchens/${kitchenId}/stock-items`, {
    productId: product.id,
    quantity: "1000.000",
    location: "fridge",
    purchasePriceMinor: 1000,
    expiresAt: "2026-09-01T00:00:00.000Z",
    purchasedAt: "2026-08-22T00:00:00.000Z",
  });

  const stockUrl = `/kitchens/${kitchenId}/stock`;

  async function openManualConsume() {
    await page.goto(stockUrl);
    await page
      .getByRole("button", { name: /^Zużyj$/ })
      .first()
      .waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: /^Zużyj$/ }).first().click();
    await page.getByRole("heading", { name: /Zużyj:/i }).waitFor({
      timeout: 10000,
    });
    await page.getByRole("button", { name: /Wybierz partie/i }).click();
    await page.getByLabel("Ilość do zużycia").fill("600");
    const inputs = page.locator('input[aria-label^="Ilość z partii"]');
    await inputs.nth(0).fill("500");
    await inputs.nth(1).fill("100");
    await page.getByRole("button", { name: /Podgląd podziału/i }).click();
    await page.getByText("Łączny koszt").waitFor({ timeout: 10000 });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await openManualConsume();
  await page.screenshot({
    path: path.join(OUT, "stock-consume-manual-desktop.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: /Zatwierdź zużycie/i }).click();
  await page
    .getByRole("heading", { name: /Zużyj:/i })
    .waitFor({ state: "hidden", timeout: 15000 })
    .catch(() => undefined);
  await page.getByRole("button", { name: /^Zużyj$/ }).first().waitFor({
    timeout: 15000,
  });

  await page.getByRole("button", { name: /Historia zużyć/i }).click();
  await page.getByRole("button", { name: /^Cofnij$/ }).first().waitFor({
    timeout: 15000,
  });
  await page.screenshot({
    path: path.join(OUT, "stock-consume-history-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^Cofnij$/ }).first().click();
  await page.waitForTimeout(1000);

  await openManualConsume();
  await page.screenshot({
    path: path.join(OUT, "stock-consume-manual-mobile.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: /Zatwierdź zużycie/i }).click();
  await page
    .getByRole("heading", { name: /Zużyj:/i })
    .waitFor({ state: "hidden", timeout: 15000 })
    .catch(() => undefined);
  await page.getByRole("button", { name: /Historia zużyć/i }).click();
  await page.getByRole("button", { name: /^Cofnij$/ }).first().waitFor({
    timeout: 15000,
  });
  await page.screenshot({
    path: path.join(OUT, "stock-consume-history-mobile.png"),
    fullPage: true,
  });

  await browser.close();
  console.log(`Screenshots saved to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
