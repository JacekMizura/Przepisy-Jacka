/**
 * Screenshots for stock purchase batches UI.
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

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(stockUrl);
  await page.getByText("Pomidory malinowe").waitFor({ timeout: 20000 });
  await page.screenshot({
    path: path.join(OUT, "stock-summary-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: /Partie/i }).first().click();
  await page.getByText("Ręczne dodanie").first().waitFor({ timeout: 10000 });
  await page.screenshot({
    path: path.join(OUT, "stock-batches-expanded-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: /^Zużyj$/ }).first().click();
  await page.getByLabel("Ilość do zużycia").fill("600");
  await page.getByRole("button", { name: /Podgląd podziału/i }).click();
  await page.getByText("Łączny koszt").waitFor({ timeout: 10000 });
  await page.screenshot({
    path: path.join(OUT, "stock-consume-desktop.png"),
    fullPage: false,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(stockUrl);
  await page.getByText("Pomidory malinowe").waitFor({ timeout: 20000 });
  await page.screenshot({
    path: path.join(OUT, "stock-summary-mobile.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: /Partie/i }).first().click();
  await page.screenshot({
    path: path.join(OUT, "stock-batches-expanded-mobile.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: /^Zużyj$/ }).first().click();
  await page.getByLabel("Ilość do zużycia").fill("600");
  await page.getByRole("button", { name: /Podgląd podziału/i }).click();
  await page.getByText("Łączny koszt").waitFor({ timeout: 10000 });
  await page.screenshot({
    path: path.join(OUT, "stock-consume-mobile.png"),
    fullPage: false,
  });

  await browser.close();
  console.log(`Screenshots saved to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
